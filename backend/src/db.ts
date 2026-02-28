import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in .env");
}

//connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Testing the database connection on the startup
export const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log("Connected to the Database");

    // test query
    await client.query("SELECT 1");

    client.release();
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

// Shutting Down DB
process.on("SIGINT", async () => {
  console.log("Closing DB pool");
  await pool.end();
  process.exit(0);
});