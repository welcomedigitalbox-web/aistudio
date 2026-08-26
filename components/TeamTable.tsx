"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Person {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

const ROLES = [
  { id: "creator", label: "Creator", blurb: "Makes the work. Cannot sign it off." },
  { id: "reviewer", label: "Reviewer", blurb: "Approves. Can also create." },
  { id: "admin", label: "Admin", blurb: "Everything, plus role changes." },
] as const;

export function TeamTable({
  people,
  spend,
  isAdmin,
  meId,
}: {
  people: Person[];
  spend: Record<string, { cost: number; calls: number }>;
  isAdmin: boolean;
  meId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function setRole(userId: string, role: string) {
    setBusy(userId);
    setError("");
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) return setError(json.error ?? "Could not change that role.");
    router.refresh();
  }

  const unattributed = spend["unattributed"];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error && <div className="err">{error}</div>}

      {people.map((p) => {
        const s = spend[p.email];
        return (
          <div key={p.id} className="card">
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: 15 }}>{p.full_name ?? p.email}</h3>
                <div className="note mono" style={{ fontSize: 12 }}>
                  {p.email}
                  {p.id === meId ? " · you" : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="cost">${(s?.cost ?? 0).toFixed(4)}</div>
                <div className="rail-label">{s?.calls ?? 0} calls</div>
              </div>
            </div>

            <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  className={p.role === r.id ? "" : "ghost"}
                  onClick={() => isAdmin && p.role !== r.id && setRole(p.id, r.id)}
                  disabled={!isAdmin || busy !== null}
                  style={{
                    fontSize: 12,
                    padding: "3px 10px",
                    cursor: isAdmin ? "pointer" : "default",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
              {ROLES.find((r) => r.id === p.role)?.blurb}
            </p>
          </div>
        );
      })}

      {unattributed && unattributed.cost > 0 && (
        <div className="card">
          <div className="row between">
            <div>
              <h3 style={{ fontSize: 15 }}>Unattributed</h3>
              <div className="note" style={{ marginTop: 4 }}>
                Calls made before attribution was recorded, or by a deleted account.
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="cost">${unattributed.cost.toFixed(4)}</div>
              <div className="rail-label">{unattributed.calls} calls</div>
            </div>
          </div>
        </div>
      )}

      {!isAdmin && <p className="note">Only an admin can change roles.</p>}
    </div>
  );
}
