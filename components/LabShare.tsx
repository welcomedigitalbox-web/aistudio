"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Grant = {
  user_id: string;
  access: string;
  profiles: { email: string; full_name: string | null } | null;
};

const LEVELS = [
  { value: "viewer",   label: "Viewer",   hint: "Reads the chapters." },
  { value: "editor",   label: "Editor",   hint: "Writes and edits too." },
  { value: "reviewer", label: "Reviewer", hint: "Reads and signs chapters off." },
];

/**
 * Sharing, shown to the owner only.
 *
 * Deliberately by email rather than a user picker: the owner knows who they
 * mean, and a dropdown of everyone in the studio invites mis-clicks.
 */
export function LabShare({ labId, grants }: { labId: string; grants: Grant[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labId, ...payload }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "That did not go through.");
    setEmail("");
    router.refresh();
  }

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <div>
        <strong>Share</strong>
        <div className="note" style={{ marginTop: 4 }}>
          Only you and the people below can open this story.
        </div>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input
          type="email"
          value={email}
          placeholder="name@studio.com"
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: "1 1 200px" }}
        />
        <select value={access} onChange={(e) => setAccess(e.target.value)}>
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
        <button onClick={() => call({ action: "share", email, access })} disabled={busy || !email}>
          {busy ? "…" : "Share"}
        </button>
      </div>

      <div className="note" style={{ fontSize: 12 }}>
        {LEVELS.find((l) => l.value === access)?.hint}
      </div>

      {grants.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {grants.map((g) => (
            <div key={g.user_id} className="row between" style={{ fontSize: 13 }}>
              <span className="mono">
                {g.profiles?.email ?? g.user_id}
                <span className="note" style={{ marginLeft: 8 }}>{g.access}</span>
              </span>
              <button
                className="ghost"
                disabled={busy}
                onClick={() => call({ action: "unshare", userId: g.user_id })}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="err">{error}</div>}
    </div>
  );
}
