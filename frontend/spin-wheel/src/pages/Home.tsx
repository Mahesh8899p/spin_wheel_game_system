import { useEffect, useState } from "react";
import { getActiveWheel, createWheel } from "../api/wheels";
import { getUsers, type User } from "../api/users";

export default function Home(props: { onOpenWheel: (wheelId: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [activeWheelId, setActiveWheelId] = useState<string>("");

  // For convenience: allow admin to create wheel from UI
  const [, setUsers] = useState<User[]>([]);
  const [adminId, setAdminId] = useState<string>("");
  const [entryFee, setEntryFee] = useState<number>(100);
  const [creating, setCreating] = useState(false);

  async function refreshActive() {
    const res = await getActiveWheel();
    const id = res.wheel?.id ?? "";
    setActiveWheelId(id);
    return id;
  }

  useEffect(() => {
    (async () => {
      try {
        const [u] = await Promise.all([getUsers()]);
        setUsers(u.users);
        const admin = u.users.find((x) => x.is_admin);
        if (admin) setAdminId(admin.id);

        const id = await refreshActive();
        // ✅ Auto open active wheel
        if (id) props.onOpenWheel(id);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onCreateWheel = async () => {
    setCreating(true);
    try {
      const r = await createWheel(entryFee, adminId);
      props.onOpenWheel(r.wheel.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Create wheel failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h1>Spin Wheel</h1>

      {loading ? (
        <p>Loading…</p>
      ) : activeWheelId ? (
        <>
          <p>Active wheel detected. Opening it automatically…</p>
          <code>{activeWheelId}</code>
        </>
      ) : (
        <>
          <p>No active wheel right now.</p>

          <div style={{ marginTop: 16, border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
            <h3>Create Wheel (Admin)</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label>Entry fee:</label>
              <input
                type="number"
                value={entryFee}
                onChange={(e) => setEntryFee(Number(e.target.value))}
                style={{ width: 120, padding: 6 }}
              />
              <button disabled={!adminId || creating} onClick={onCreateWheel}>
                {creating ? "Creating…" : "Create wheel"}
              </button>
            </div>
            {!adminId && <p style={{ color: "crimson" }}>No admin found in DB users.</p>}
          </div>

          <div style={{ marginTop: 16 }}>
            <button onClick={() => refreshActive().then((id) => id && props.onOpenWheel(id))}>
              Refresh active wheel
            </button>
          </div>
        </>
      )}
    </div>
  );
}