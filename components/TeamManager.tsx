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

interface Show {
  id: string;
  title: string;
}

interface Grant {
  user_id: string;
  series_id: string;
}

const ROLES = [
  { id: "creator", label: "Creator", blurb: "Works on assigned shows. Cannot approve." },
  { id: "reviewer", label: "Reviewer", blurb: "Approves, and sees every show." },
  { id: "admin", label: "Admin", blurb: "Everything, plus this page." },
] as const;

export function TeamManager({
  people,
  shows,
  grants,
  meId,
}: {
  people: Person[];
  shows: Show[];
  grants: Grant[];
  meId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("creator");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  function grantsFor(userId: string) {
    return new Set(grants.filter((g) => g.user_id === userId).map((g) => g.series_id));
  }

  async function call(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(json.error ?? "That did not go through.");
      return null;
    }
    router.refresh();
    return json;
  }

  async function createUser() {
    const json = await call({ action: "create", email, password, fullName, role }, "create");
    if (!json) return;
    setCreated({ email, password });
    setEmail("");
    setFullName("");
    setPassword("");
    setAdding(false);
  }

  function suggestPassword() {
    const words = ["amber", "teak", "monsoon", "quiet", "river", "lantern", "paper", "thread"];
    const pick = () => words[Math.floor(Math.random() * words.length)];
    setPassword(pick() + "-" + pick() + "-" + Math.floor(Math.random() * 900 + 100));
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error && <div className="err">{error}</div>}

      {created && (
        <div className="card" style={{ borderColor: "var(--pine)" }}>
          <strong>Account created</strong>
          <div className="note" style={{ marginTop: 6 }}>
            Hand these over now — the password is not stored anywhere and this is the only
            time it is shown.
          </div>
          <div className="mono" style={{ marginTop: 8, fontSize: 13 }}>
            {created.email}
            <br />
            {created.password}
          </div>
          <button
            className="ghost"
            onClick={() => setCreated(null)}
            style={{ marginTop: 10, fontSize: 12, padding: "3px 10px" }}
          >
            Done
          </button>
        </div>
      )}

      {adding ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="row" style={{ gap: 8 }}>
            <input
              placeholder="Password — at least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="ghost" onClick={suggestPassword} style={{ whiteSpace: "nowrap" }}>
              Suggest
            </button>
          </div>

          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {ROLES.map((r) => (
              <button
                key={r.id}
                className={role === r.id ? "" : "ghost"}
                onClick={() => setRole(r.id)}
                style={{ fontSize: 12, padding: "3px 10px" }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="row between">
            <span className="note">{ROLES.find((r) => r.id === role)?.blurb}</span>
            <div className="row" style={{ gap: 8 }}>
              <button className="ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button
                onClick={createUser}
                disabled={busy !== null || !email || password.length < 8}
              >
                {busy === "create" ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}>Add someone</button>
      )}

      {people.map((p) => {
        const mine = grantsFor(p.id);
        const isOpen = openPerson === p.id;
        const seesEverything = p.role === "admin" || p.role === "reviewer";

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
              <button
                className="ghost"
                onClick={() => setOpenPerson(isOpen ? null : p.id)}
                style={{ fontSize: 12, padding: "3px 10px" }}
              >
                {isOpen ? "Close" : "Manage"}
              </button>
            </div>

            <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  className={p.role === r.id ? "" : "ghost"}
                  onClick={() =>
                    p.role !== r.id && call({ action: "role", userId: p.id, role: r.id }, p.id)
                  }
                  disabled={busy !== null}
                  style={{ fontSize: 12, padding: "3px 10px" }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
              {seesEverything
                ? ROLES.find((r) => r.id === p.role)?.blurb
                : mine.size + " show" + (mine.size === 1 ? "" : "s") + " assigned"}
            </p>

            {isOpen && (
              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                <div>
                  <span className="eyebrow">Shows</span>
                  {seesEverything ? (
                    <p className="note" style={{ marginTop: 6 }}>
                      Reviewers and admins see every show — a reviewer who cannot open a show
                      cannot approve it.
                    </p>
                  ) : (
                    <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {shows.map((s) => {
                        const has = mine.has(s.id);
                        return (
                          <button
                            key={s.id}
                            className={has ? "" : "ghost"}
                            onClick={() =>
                              call(
                                { action: has ? "revoke" : "grant", userId: p.id, seriesId: s.id },
                                p.id + s.id
                              )
                            }
                            disabled={busy !== null}
                            style={{ fontSize: 12, padding: "3px 10px" }}
                          >
                            {s.title}
                          </button>
                        );
                      })}
                      {shows.length === 0 && <span className="note">No shows to assign yet.</span>}
                    </div>
                  )}
                </div>

                <div>
                  <span className="eyebrow">Password</span>
                  {resetting === p.id ? (
                    <div className="row" style={{ gap: 8, marginTop: 6 }}>
                      <input
                        placeholder="New password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        onClick={async () => {
                          const ok = await call(
                            { action: "password", userId: p.id, password },
                            p.id
                          );
                          if (ok) {
                            setCreated({ email: p.email, password });
                            setResetting(null);
                            setPassword("");
                          }
                        }}
                        disabled={busy !== null || password.length < 8}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        Set
                      </button>
                      <button className="ghost" onClick={() => setResetting(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      <button
                        className="ghost"
                        onClick={() => {
                          setResetting(p.id);
                          suggestPassword();
                        }}
                        style={{ fontSize: 12, padding: "3px 10px" }}
                      >
                        Set a new one
                      </button>
                    </div>
                  )}
                </div>

                {p.id !== meId && (
                  <div>
                    <span className="eyebrow">Remove</span>
                    <div className="row between" style={{ marginTop: 6 }}>
                      <span className="note">
                        Deletes the account. Their work stays; its cost becomes unattributed.
                      </span>
                      <button
                        className="ghost"
                        onClick={() => call({ action: "remove", userId: p.id }, p.id)}
                        disabled={busy !== null}
                        style={{ fontSize: 12, padding: "3px 10px", color: "var(--rust)" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
