import { api } from "./client";

export type User = { id: string; username: string; is_admin: boolean };

export function getUsers() {
  return api<{ users: User[] }>("/api/users");
}