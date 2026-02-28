import { api } from "./client";
import type { WheelDetails, ActiveWheelResponse, CreateWheelResponse, JoinWheelResponse } from "../types/models";

export function getActiveWheel() {
  return api<ActiveWheelResponse>("/api/wheels/active");
}

export function getWheel(id: string) {
  return api<WheelDetails>(`/api/wheels/${id}`);
}

export function createWheel(entryFee: number, adminId: string) {
  return api<CreateWheelResponse>("/api/wheels", {
    method: "POST",
    headers: { "x-user-id": adminId },
    body: JSON.stringify({ entryFee }),
  });
}

export function joinWheel(wheelId: string, userId: string) {
  return api<JoinWheelResponse>(`/api/wheels/${wheelId}/join`, {
    method: "POST",
    headers: { "x-user-id": userId },
  });
}