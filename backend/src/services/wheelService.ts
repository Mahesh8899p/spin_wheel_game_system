import { en } from "zod/v4/locales";
import { pool } from "../db";
import { HttpError } from "../utils/httpError";

type WheelRow = {
  id: string;
  owner_id: string;
  status: string;
  entry_fee: string; // pg returns BIGINT as string
  min_participants: number;
  created_at: string;
  auto_start_at: string;
  winner_pool: string;
  admin_pool: string;
  app_pool: string;
  winner_id: string | null;
};

function toBigInt(v: string | number | bigint): bigint {
  return typeof v === "bigint" ? v : BigInt(v);
}

export async function getActiveWheel(): Promise<WheelRow | null> {
  const r = await pool.query<WheelRow>(
    `
    SELECT *
    FROM spin_wheels
    WHERE status IN ('CREATED','OPEN','STARTING','RUNNING')
    ORDER BY created_at DESC
    LIMIT 1
    `
  );
  return r.rows[0] ?? null;
}

/**
 * Create wheel (admin only). DB enforces "only one active wheel" via unique index.
 */
export async function createWheel(params: { ownerId: string; entryFee: bigint }): Promise<WheelRow> {
  const { ownerId, entryFee } = params;

  // Verify admin
  const adminCheck = await pool.query<{ is_admin: boolean }>(
    `SELECT is_admin FROM users WHERE id = $1`,
    [ownerId]
  );
  if (adminCheck.rowCount === 0) throw new HttpError(404, "Owner user not found");
  if (!adminCheck.rows[0]!.is_admin) throw new HttpError(403, "Only admin can create a wheel");

  try {
    const r = await pool.query<WheelRow>(
      `
      INSERT INTO spin_wheels (owner_id, status, entry_fee, auto_start_at, max_participants)
VALUES ($1, 'OPEN', $2, now() + interval '3 minutes', 3)
RETURNING *
      `,
      [ownerId, entryFee.toString()]
    );
    return r.rows[0]!;
  } catch (e: any) {
    // Unique index one_active_wheel can throw conflict
    if (e?.code === "23505") {
      throw new HttpError(409, "Another wheel is already active");
    }
    throw e;
  }
}

/**
 * Join wheel:
 */
export async function joinWheel(params: { wheelId: string; userId: string }): Promise<{
  wheelId: string;
  userId: string;
  entryFee: string;
  pools: { winner_pool: string; admin_pool: string; app_pool: string};
}> {
  const { wheelId, userId } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    
    const wheelRes = await client.query<WheelRow>(
      `SELECT * FROM spin_wheels WHERE id = $1 FOR UPDATE`,
      [wheelId]
    );
    if (wheelRes.rowCount === 0) throw new HttpError(404, "Wheel not found");
    
    const wheel = wheelRes.rows[0]!;
    if (wheel.status !== "OPEN") throw new HttpError(409, "Wheel is not open for joining");

    const entryFee = toBigInt(wheel.entry_fee);

    
    const maxParticipants = (wheel as any).max_participants ?? 3;


    const countRes = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM wheel_participants
     WHERE wheel_id=$1 AND status='JOINED'`,
     [wheelId]
);

const joinedCount = Number(countRes.rows[0]?.cnt ?? "0");
if (joinedCount >= maxParticipants) {
  throw new HttpError(409, `Wheel is full (max ${maxParticipants} players)`);
}

   
    const walletRes = await client.query<{ balance: string }>(
      `SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (walletRes.rowCount === 0) throw new HttpError(404, "Wallet not found for user");

    const balance = toBigInt(walletRes.rows[0]!.balance);
    if (balance < entryFee) throw new HttpError(400, "Insufficient balance");

    
    const already = await client.query(
      `SELECT 1 FROM wheel_participants WHERE wheel_id=$1 AND user_id=$2`,
      [wheelId, userId]
    );
    if ((already.rowCount ?? 0) > 0)
       throw new HttpError(409, "User already joined this wheel");

    
    const cfgRes = await client.query<{ winner_pct: number; admin_pct: number; app_pct: number }>(
      `SELECT winner_pct, admin_pct, app_pct FROM coin_distribution_config WHERE id=1`
    );
    if (cfgRes.rowCount === 0) throw new HttpError(500, "Coin distribution config missing");
    const cfg = cfgRes.rows[0]!;

    
    const winnerShare = (entryFee * BigInt(cfg.winner_pct)) / 100n;
    const adminShare = (entryFee * BigInt(cfg.admin_pct)) / 100n;
    const appShare = entryFee - winnerShare - adminShare; // remainder to app to avoid rounding loss

    
    await client.query(
      `UPDATE wallets SET balance = balance - $2 WHERE user_id = $1`,
      [userId, entryFee.toString()]
    );

    
    const poolsRes = await client.query<{ winner_pool: string; admin_pool: string; app_pool: string }>(
      `
      UPDATE spin_wheels
      SET winner_pool = winner_pool + $2,
          admin_pool  = admin_pool  + $3,
          app_pool    = app_pool    + $4
      WHERE id = $1
      RETURNING winner_pool, admin_pool, app_pool
      `,
      [wheelId, winnerShare.toString(), adminShare.toString(), appShare.toString()]
    );

    
    await client.query(
      `INSERT INTO wheel_participants (wheel_id, user_id, status) VALUES ($1,$2,'JOINED')`,
      [wheelId, userId]
    );

    
    await client.query(
      `
      INSERT INTO coin_transactions (user_id, wheel_id, type, amount, metadata)
      VALUES ($1, $2, 'ENTRY_DEBIT', $3, $4::jsonb)
      `,
      [
        userId,
        wheelId,
        entryFee.toString(),
        JSON.stringify({ winnerShare: winnerShare.toString(), adminShare: adminShare.toString(), appShare: appShare.toString() }),
      ]
    );

    await client.query("COMMIT");

    const pools = poolsRes.rows[0]!;
    return {
      wheelId,
      userId,
      entryFee : entryFee.toString(),
      pools: {
        winner_pool: (pools.winner_pool),
        admin_pool: (pools.admin_pool),
        app_pool: (pools.app_pool),
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getWheelDetails(wheelId: string) {
  const wheelRes = await pool.query<WheelRow>(`SELECT * FROM spin_wheels WHERE id=$1`, [wheelId]);
  if (wheelRes.rowCount === 0) throw new HttpError(404, "Wheel not found");

  const participantsRes = await pool.query<{
    user_id: string;
    status: string;
    joined_at: string;
    eliminated_at: string | null;
    username: string;
  }>(
    `
    SELECT p.user_id, p.status, p.joined_at, p.eliminated_at, u.username
    FROM wheel_participants p
    JOIN users u ON u.id = p.user_id
    WHERE p.wheel_id = $1
    ORDER BY p.joined_at ASC
    `,
    [wheelId]
  );

  return { wheel: wheelRes.rows[0], participants: participantsRes.rows };
}