import { API_BASE } from "../api/client";

export type WsEvent =
  | { type: "subscribed"; wheelId: string; at: string }
  | { type: "player_joined"; wheelId: string; userId: string; username?: string; at: string }
  | { type: "wheel_started"; wheelId: string; at: string }
  | { type: "player_eliminated"; wheelId: string; userId: string; at: string }
  | { type: "wheel_aborted"; wheelId: string; reason: string; at: string }
  | { type: "wheel_completed"; wheelId: string; winnerId: string; at: string }
  | { type: "error"; message: string };

export function connectWheelWs(wheelId: string, onEvent: (e: WsEvent) => void) {
  const wsBase = API_BASE.replace("http://", "ws://").replace("https://", "wss://");
  const ws = new WebSocket(`${wsBase}/ws?wheelId=${encodeURIComponent(wheelId)}`);

  ws.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch {
      // ignore
    }
  };

  return () => ws.close();
}