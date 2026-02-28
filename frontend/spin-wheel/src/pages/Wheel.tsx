import { useEffect, useMemo, useState } from "react";
import { getWheel, joinWheel } from "../api/wheels";
import type { Participant, WheelDetails } from "../types/models";
import { connectWheelWs, type WsEvent } from "../realtime/ws";
import { getUsers, type User } from "../api/users";

export default function WheelPage(props: { wheelId: string; onBack: () => void }) {
  const { wheelId } = props;

  const [data, setData] = useState<WheelDetails | null>(null);
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [joining, setJoining] = useState(false);


  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  async function refresh() {
    const d = await getWheel(wheelId);
    setData(d);
  }

  useEffect(() => {
    refresh();
    (async () => {
      const u = await getUsers();
      setUsers(u.users);
      
      const firstPlayer = u.users.find((x) => !x.is_admin) ?? u.users[0];
      if (firstPlayer) setSelectedUserId(firstPlayer.id);
    })();
  }, [wheelId]);

  useEffect(() => {
    const disconnect = connectWheelWs(wheelId, (e) => {
      setEvents((prev) => [e, ...prev].slice(0, 50));
      if (
        e.type === "player_joined" ||
        e.type === "wheel_started" ||
        e.type === "player_eliminated" ||
        e.type === "wheel_completed" ||
        e.type === "wheel_aborted"
      ) {
        refresh().catch(() => {});
      }
    });
    return disconnect;
  }, [wheelId]);

  const participants: Participant[] = useMemo(() => data?.participants ?? [], [data]);

  const onJoin = async () => {
    setJoining(true);
    try {
      await joinWheel(wheelId, selectedUserId);
      await refresh();
      alert("Joined successfully!");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Join failed");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <button onClick={props.onBack}>← Back</button>
      <h2 style={{ marginTop: 12 }}>Wheel</h2>

      {!data ? (
        <p>Loading wheel…</p>
      ) : (
        <>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
              <h3>Status</h3>
              <p><b>{data.wheel.status}</b></p>
              <p>Entry fee: {data.wheel.entry_fee}</p>
              <p>Auto start at: {new Date(data.wheel.auto_start_at).toLocaleString()}</p>
              <p>Winner: {data.wheel.winner_id ?? "-"}</p>
            </div>

            <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
              <h3>Pools</h3>
              <p>Winner pool: {data.wheel.winner_pool}</p>
              <p>Admin pool: {data.wheel.admin_pool}</p>
              <p>App pool: {data.wheel.app_pool}</p>
            </div>
          </div>

          
          <div style={{ marginTop: 16, border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
            <h3>Join Wheel</h3>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>Choose user:</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{ padding: 8, minWidth: 220 }}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}{u.is_admin ? " (admin)" : ""}
                  </option>
                ))}
              </select>

              <button disabled={!selectedUserId || joining} onClick={onJoin}>
                {joining ? "Joining…" : "Join"}
              </button>

              <button onClick={refresh}>Refresh</button>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
              <h3>Participants ({participants.length})</h3>
              <ul>
                {participants.map((p) => (
                  <li key={p.user_id}>
                    <b>{p.username}</b> — {p.status}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
              <h3>Live Events (WebSocket)</h3>
              <ul>
                {events.map((e, i) => (
                  <li key={i}>
                    <code>{e.type}</code>{" "}
                    {"userId" in e ? `user=${e.userId}` : ""}{" "}
                    {"winnerId" in e ? `winner=${e.winnerId}` : ""}{" "}
                    {"reason" in e ? `reason=${e.reason}` : ""}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 12, opacity: 0.8 }}>
                (Tip: participants list is the source of truth — it shows usernames.)
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}