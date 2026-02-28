import { pool }   from "../db";

type SeedUser = {
  username: string;
  is_admin: boolean;
  balance: number;
};

const USERS: SeedUser[] = [
  { username: "admin", is_admin: true, balance: 100000 },
  { username: "player1", is_admin: false, balance: 5000 },
  { username: "player2", is_admin: false, balance: 5000 },
  { username: "player3", is_admin: false, balance: 5000 },
  { username: "player4", is_admin: false, balance: 5000 },
];

async function upsertUserAndWallet(u: SeedUser) {
  
  const userRes = await pool.query(
    `
    INSERT INTO users (username, is_admin)
    VALUES ($1, $2)
    ON CONFLICT (username)
    DO UPDATE SET is_admin = EXCLUDED.is_admin
    RETURNING id, username, is_admin
    `,
    [u.username, u.is_admin]
  );

  const user = userRes.rows[0] as { id: string; username: string; is_admin: boolean };

  // 2) Ensure wallet exists; set balance only on first create
  await pool.query(
    `
    INSERT INTO wallets (user_id, balance)
    VALUES ($1, $2)
    ON CONFLICT (user_id)
    DO NOTHING
    `,
    [user.id, u.balance]
  );

  return user;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const created: Array<{ id: string; username: string; is_admin: boolean }> = [];

    
    for (const u of USERS) {
      const userRes = await client.query(
        `
        INSERT INTO users (username, is_admin)
        VALUES ($1, $2)
        ON CONFLICT (username)
        DO UPDATE SET is_admin = EXCLUDED.is_admin
        RETURNING id, username, is_admin
        `,
        [u.username, u.is_admin]
      );

      const user = userRes.rows[0] as { id: string; username: string; is_admin: boolean };

      await client.query(
        `
        INSERT INTO wallets (user_id, balance)
        VALUES ($1, $2)
        ON CONFLICT (user_id)
        DO NOTHING
        `,
        [user.id, u.balance]
      );

      created.push(user);
    }

    await client.query("COMMIT");

    console.log("Seed completed. Users:");
    for (const u of created) {
      console.log(`- ${u.username} | admin=${u.is_admin} | id=${u.id}`);
    }

    console.log("\nTip: check wallets:");
    console.log(`docker exec -it spin_pg psql -U spin -d spindb -c "SELECT u.username, u.is_admin, w.balance FROM users u JOIN wallets w ON w.user_id=u.id ORDER BY u.username;"`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end(); 
  }
}

main();