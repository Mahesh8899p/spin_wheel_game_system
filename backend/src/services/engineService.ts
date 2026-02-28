import { pool } from "../db";
import { broadcastToWheel } from "../realtime/ws";
import { HttpError } from "../utils/httpError";
import { PoolClient } from "pg";

function toBigInt(v: string | number | bigint): bigint {
  return typeof v === "bigint" ? v : BigInt(v);
}

async function tryInsertIdempotencyKey(client: PoolClient, key: string): Promise<boolean> {
  // returns true if inserted; false if already exists
  const r = await client.query(
    `INSERT INTO idempotency_keys(key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING key`,
    [key]
  );
  return r.rowCount === 1;
}

/**
 auto-start wheels after auto_start_at.
 */
export async function tickAutoStart() {
  // Find wheels ready to auto-start
  const r = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM spin_wheels
    WHERE status = 'OPEN'
      AND auto_start_at <= now()
    ORDER BY auto_start_at ASC
    LIMIT 10
    `
  );

  for (const row of r.rows) {
    await startOrAbortWheel(row.id);
  }
}

async function startOrAbortWheel(wheelId: string) {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const wheelRes = await client.query<{
      id: string;
      status: string;
      entry_fee: string;
      min_participants: number;
      owner_id: string;
    }>(`SELECT id, status, entry_fee, min_participants, owner_id FROM spin_wheels WHERE id=$1 FOR UPDATE`, [wheelId]);

    if (wheelRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return;
    }

    const wheel = wheelRes.rows[0]!;

    // If someone already started/aborted it, exit
    if (wheel.status !== "OPEN") {
      await client.query("ROLLBACK");
      return;
    }

    const countRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text as cnt FROM wheel_participants WHERE wheel_id=$1 AND status='JOINED'`,
      [wheelId]
    );
    const joinedCount = Number(countRes.rows[0]!.cnt);

    if (joinedCount < wheel.min_participants) {
    
      await abortAndRefund(client, wheelId, toBigInt(wheel.entry_fee));
      await client.query(
        `UPDATE spin_wheels SET status='ABORTED', ended_at=now() WHERE id=$1`,
        [wheelId]
      );

      await client.query("COMMIT");
      broadcastToWheel(wheelId, {
        type: "wheel_aborted",
        wheelId,
        reason: `Not enough participants (${joinedCount}/${wheel.min_participants})`,
        at: new Date().toISOString(),
      });
      return;
    }

    // Start the wheel
    await client.query(
      `UPDATE spin_wheels SET status='RUNNING', started_at=now() WHERE id=$1`,
      [wheelId]
    );

    // Create random elimination queue
   
    await client.query(
      `
      INSERT INTO wheel_elimination_queue (wheel_id, position, user_id)
      SELECT $1 as wheel_id,
             ROW_NUMBER() OVER (ORDER BY random()) as position,
             p.user_id
      FROM wheel_participants p
      WHERE p.wheel_id = $1 AND p.status='JOINED'
      `,
      [wheelId]
    );

    await client.query("COMMIT");

    broadcastToWheel(wheelId, { type: "wheel_started", wheelId, at: new Date().toISOString() });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("startOrAbortWheel ERROR:", e);
  } finally {
    client.release();
  }
}

async function abortAndRefund(client: PoolClient, wheelId: string, entryFee: bigint) {
  
  const ok = await tryInsertIdempotencyKey(client, `refund:${wheelId}`);
  if (!ok) return;

  
  const pRes = await client.query<{ user_id: string }>(
    `SELECT user_id FROM wheel_participants WHERE wheel_id=$1 AND status='JOINED' FOR UPDATE`,
    [wheelId]);

  for (const p of pRes.rows) {
    
    await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [p.user_id]);

   
    await client.query(`UPDATE wallets SET balance = balance + $2 WHERE user_id=$1`, [
      p.user_id,
      entryFee.toString(),
    ]);

    
    await client.query(
      `UPDATE wheel_participants SET status='REFUNDED' WHERE wheel_id=$1 AND user_id=$2`,
      [wheelId, p.user_id]
    );

    
    await client.query(
      `
      INSERT INTO coin_transactions(user_id, wheel_id, type, amount, metadata)
      VALUES ($1, $2, 'REFUND_CREDIT', $3, $4::jsonb)
      `,
      [p.user_id, wheelId, entryFee.toString(), JSON.stringify({ reason: "wheel_aborted" })]
    );
  }
}

/**
elimination tick (every second, but only eliminates if 7s passed).
 */
export async function tickEliminations() {
  const r = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM spin_wheels
    WHERE status='RUNNING'
    ORDER BY started_at ASC NULLS LAST
    LIMIT 10
    `
  );

  for (const row of r.rows) {
    await eliminateIfDue(row.id);
  }
}

async function eliminateIfDue(wheelId: string) {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    
    const wheelRes = await client.query<{ id: string; status: string; owner_id: string; winner_pool: string; admin_pool: string; app_pool: string }>(
      `SELECT id, status, owner_id, winner_pool, admin_pool, app_pool FROM spin_wheels WHERE id=$1 FOR UPDATE`,
      [wheelId]
    );
    if (wheelRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return;
    }
    const wheel = wheelRes.rows[0]!;
    if (wheel.status !== "RUNNING") {
      await client.query("ROLLBACK");
      return;
    }

    
    const lastRes = await client.query<{ last_at: string | null }>(
      `SELECT MAX(eliminated_at) as last_at FROM wheel_elimination_queue WHERE wheel_id=$1`,
      [wheelId]
    );

    const lastAt = lastRes.rows[0]!.last_at ? new Date(lastRes.rows[0]!.last_at) : null;
    if (lastAt) {
      const now = Date.now();
      if (now - lastAt.getTime() < 7000) {
        await client.query("ROLLBACK");
        return;
      }
    }

    
    const remainingRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text as cnt FROM wheel_elimination_queue WHERE wheel_id=$1 AND eliminated=false`,
      [wheelId]
    );
    const remaining = Number(remainingRes.rows[0]!.cnt);

    if (remaining <= 1) {
      
      const winnerRes = await client.query<{ user_id: string }>(
        `SELECT user_id FROM wheel_elimination_queue WHERE wheel_id=$1 AND eliminated=false LIMIT 1`,
        [wheelId]
      );
      if (winnerRes.rowCount === 1) {
        await completeWheel(client, wheelId, winnerRes.rows[0]!.user_id, wheel.owner_id, toBigInt(wheel.winner_pool), toBigInt(wheel.admin_pool), toBigInt(wheel.app_pool));
        await client.query("COMMIT");

        broadcastToWheel(wheelId, { type: "wheel_completed", wheelId, winnerId: winnerRes.rows[0]!.user_id, at: new Date().toISOString() });
      } else {
        await client.query("ROLLBACK");
      }
      return;
    }

    
    const nextRes = await client.query<{ user_id: string; position: number }>(
      `
      SELECT user_id, position
      FROM wheel_elimination_queue
      WHERE wheel_id=$1 AND eliminated=false
      ORDER BY position ASC
      LIMIT 1
      FOR UPDATE
      `,
      [wheelId]
    );
    if (nextRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return;
    }

    const victimId = nextRes.rows[0]!.user_id;

    await client.query(
      `
      UPDATE wheel_elimination_queue
      SET eliminated=true, eliminated_at=now()
      WHERE wheel_id=$1 AND user_id=$2
      `,
      [wheelId, victimId]
    );

    await client.query(
      `
      UPDATE wheel_participants
      SET status='ELIMINATED', eliminated_at=now()
      WHERE wheel_id=$1 AND user_id=$2
      `,
      [wheelId, victimId]
    );

    await client.query("COMMIT");

    broadcastToWheel(wheelId, { type: "player_eliminated", wheelId, userId: victimId, at: new Date().toISOString() });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("eliminateIfDue ERROR:", e);
  } finally {
    client.release();
  }
}

async function completeWheel(
  client: PoolClient,
  wheelId: string,
  winnerId: string,
  ownerId: string,
  winnerPool: bigint,
  adminPool: bigint,
  appPool: bigint
) {
  
  const ok = await tryInsertIdempotencyKey(client, `payout:${wheelId}`);
  if (!ok) return;

  
  const appUserId = process.env.APP_USER_ID || null;

  
  await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [winnerId]);
  await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [ownerId]);
  if (appUserId) await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [appUserId]);


  await client.query(`UPDATE wallets SET balance = balance + $2 WHERE user_id=$1`, [winnerId, winnerPool.toString()]);
  await client.query(`UPDATE wallets SET balance = balance + $2 WHERE user_id=$1`, [ownerId, adminPool.toString()]);
  if (appUserId) await client.query(`UPDATE wallets SET balance = balance + $2 WHERE user_id=$1`, [appUserId, appPool.toString()]);

  
  await client.query(`UPDATE wheel_participants SET status='WINNER' WHERE wheel_id=$1 AND user_id=$2`, [wheelId, winnerId]);
  await client.query(`UPDATE spin_wheels SET status='COMPLETED', ended_at=now(), winner_id=$2 WHERE id=$1`, [wheelId, winnerId]);

  
  await client.query(
    `INSERT INTO coin_transactions(user_id, wheel_id, type, amount, metadata) VALUES ($1,$2,'WINNER_PAYOUT',$3,'{}'::jsonb)`,
    [winnerId, wheelId, winnerPool.toString()]
  );
  await client.query(
    `INSERT INTO coin_transactions(user_id, wheel_id, type, amount, metadata) VALUES ($1,$2,'ADMIN_PAYOUT',$3,'{}'::jsonb)`,
    [ownerId, wheelId, adminPool.toString()]
  );
  if (appUserId) {
    await client.query(
      `INSERT INTO coin_transactions(user_id, wheel_id, type, amount, metadata) VALUES ($1,$2,'APP_PAYOUT',$3,'{}'::jsonb)`,
      [appUserId, wheelId, appPool.toString()]
    );
  }
}