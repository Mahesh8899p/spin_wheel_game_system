import { Router } from "express";
import { pool } from "../db";

const router = Router();

/**
 * GET /api/users
 * Returns list of users for testing UI (dev-only).
 */
router.get("/", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, username, is_admin FROM users ORDER BY username ASC`
    );
    res.json({ users: r.rows });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

export default router;