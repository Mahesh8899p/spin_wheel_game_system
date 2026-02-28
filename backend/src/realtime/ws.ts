import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import { URL } from "url";

type WheelId = string;

type WheelEvent =
  | { type: "player_joined"; wheelId: WheelId; userId: string; username?: string; at: string }
  | { type: "wheel_started"; wheelId: WheelId; at: string }
  | { type: "player_eliminated"; wheelId: WheelId; userId: string; at: string }
  | { type: "wheel_aborted"; wheelId: WheelId; reason: string; at: string }
  | { type: "wheel_completed"; wheelId: WheelId; winnerId: string; at: string };

const wheelRooms = new Map<WheelId, Set<WebSocket>>();

function safeSend(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function broadcastToWheel(wheelId: string, event: WheelEvent) {
  const room = wheelRooms.get(wheelId);
  if (!room) return;
  for (const ws of room) safeSend(ws, event);
}

export function initWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    // Parse wheelId from query string
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const wheelId = url.searchParams.get("wheelId");

    if (!wheelId) {
      safeSend(ws, { type: "error", message: "Missing wheelId query param" });
      ws.close();
      return;
    }

    if (!wheelRooms.has(wheelId)) wheelRooms.set(wheelId, new Set());
    wheelRooms.get(wheelId)!.add(ws);

    safeSend(ws, { type: "subscribed", wheelId, at: new Date().toISOString() });

    ws.on("close", () => {
      const room = wheelRooms.get(wheelId);
      if (!room) return;
      room.delete(ws);
      if (room.size === 0) wheelRooms.delete(wheelId);
    });
  });

  console.log("WebSocket server ready at ws://localhost:3001/ws?wheelId=...");
}