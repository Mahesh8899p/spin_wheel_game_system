import { Router } from "express";
import { z } from "zod";
import { createWheel, getActiveWheel, getWheelDetails, joinWheel } from "../services/wheelService";
import { HttpError } from "../utils/httpError";

const router = Router();


function getUserId(req: any): string {
  const userId = req.header("x-user-id");
  if (!userId) throw new HttpError(401, "Missing x-user-id header");
  return userId;
}

/**
 * GET /api/wheels/active
 */
router.get("/active", async (req, res) => {
  try {
    const wheel = await getActiveWheel();
    res.json({ wheel });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch active wheel" });
  }
});

/**
 * GET /api/wheels/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const data = await getWheelDetails(req.params.id);
    res.json(data);
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, details: e.details });
    res.status(500).json({ error: "Failed to fetch wheel details" });
  }
});

/**
 * POST /api/wheels
 * Brief: admin creates a wheel.
 * Body: { entryFee: number }
 */
router.post("/", async (req, res) => {
  const bodySchema = z.object({
    entryFee: z.number().int().positive(),
  });

  try {
    const userId = getUserId(req);
    const body = bodySchema.parse(req.body);

    const wheel = await createWheel({ ownerId: userId, entryFee: BigInt(body.entryFee) });
    res.status(201).json({ wheel });
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, details: e.details });
    if (e instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: e.issues });
    res.status(500).json({ error: "Failed to create wheel" });
  }
});

/**
 * POST /api/wheels/:id/join
 * Brief: user joins wheel by paying entry fee.
 * Header: x-user-id
 */
router.post("/:id/join", async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await joinWheel({ wheelId: req.params.id, userId });
    res.json(result);
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, details: e.details });
    res.status(500).json({ error: "Failed to join wheel" });
  }
});

export default router;