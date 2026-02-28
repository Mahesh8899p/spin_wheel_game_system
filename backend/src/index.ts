import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";

import { connectDB, pool } from "./db";
import wheelsRoutes from "./routes/wheels";
import configRoutes from "./routes/config";
import { initWebSocket } from "./realtime/ws";
import { startGameWorker } from "./worker/gameWorker";
import usersRoutes from "./routes/users";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/wheels", wheelsRoutes);
app.use("/api/config", configRoutes);
app.use("/api/users", usersRoutes);

// Health checking route
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      db: "connected",
      time: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({
      status: "error",
      db: "disconnected",
      time: new Date().toISOString(),
    });
  }
});

// Root route
app.get("/", (_req, res) => {
  res.send("Spin-wheel backend running");
});


async function startServer() {
  await connectDB();


  const server = http.createServer(app);

  // WebSocket realtime events
  initWebSocket(server);

  
  startGameWorker();

  server.listen(PORT, () => {
    console.log(`Server running.  http://localhost:${PORT}`);
    console.log(` WebSocket ws://localhost:${PORT}/ws?wheelId=<WHEEL_ID>`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server. :", err);
  process.exit(1);
});