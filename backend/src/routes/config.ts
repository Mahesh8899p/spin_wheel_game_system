import { Router } from "express";

const router = Router();

//GET /api/config/coin-distribution
 
router.get("/coin-distribution", async (req, res) => {
  try {
    res.json({
      message: "Get config (not implemented yet)",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch config" });
  }
});


//PUT /api/config/coin-distribution

router.put("/coin-distribution", async (req, res) => {
  try {
    res.json({
      message: "Update config (not implemented yet)",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update config" });
  }
});

export default router;