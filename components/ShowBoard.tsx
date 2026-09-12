"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SERIES_STEPS } from "@/lib/stages";

interface Row {
  id: string;
  title: string;
  archived: boolean;
  completed_at: string | null;
  render_style: string;
  target_minutes: number;
  next_step: string;
  characters: number;
  characters_ready: number;
  episodes: number;
  progress: number;
  creator: string | null;
}

const TABS = [
  { id: "active", label: "In production" },
  { id: "completed", label: "Finished" },
  { id: "archived", label: "Archived" },
] as const;

export function ShowBoard({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<string>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const counts = {
    active: rows.filter((r) => !r.archived && !r.completed_at).length,
    completed: rows.filter((r) => !r.archived && r.completed_at).length,
    archived: rows.filter((r) => r.archived).length,
  };

  const visible = rows.filter((r) =>
    tab === "archived" ? r.archived
    : tab === "completed" ? !r.archived && r.completed_at
    : !r.archived && !r.completed_at
  );

  async function act(seriesId: string, action: string) {
    setBusy(seriesId);
    setError("");
    const res = await fetch("/api/studio/shelf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, action }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) return setError(json.error ?? "That did not go through.");
    router.refresh();
  }

  return (
    <>
      <div className="row between" style={{ marginTop: 36, marginBottom: 12 }}>
        <h2>Shows</h2>
        <div className="row" style={{ gap: 6 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "" : "ghost"}
              onClick={() => setTab(t.id)}
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              {t.label} {counts[t.id]}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="grid two">
        {visible.map((r) => {
          const step = SERIES_STEPS.find((s) => s.id === r.next_step);
          const pct = Math.round(r.progress * 100);

          return (
            <div key={r.id} className="card" style={{ display: "grid", gap: 8 }}>
              <div className="row between">
                <Link href={`/studio/${r.id}`} style={{ minWidth: 0 }}>
                  <h3>{r.title}</h3>
                </Link>
                <span className="rail-label" style={{ color: r.completed_at ? "var(--pine)" : "var(--amber)" }}>
                  {r.completed_at ? "finished" : step?.label ?? "Ready"}
                </span>
              </div>

              <div>
                <div className="meter">
                  <i
                    style={{
                      width: pct + "%",
                      background: r.completed_at ? "var(--pine)" : undefined,
                    }}
                  />
                </div>
                <div className="row between" style={{ marginTop: 4 }}>
                  <span className="note mono" style={{ fontSize: 11 }}>
                    {r.characters_ready}/{r.characters} cast · {r.episodes} episodes
                  </span>
                  <span className="note mono" style={{ fontSize: 11 }}>{pct}%</span>
                </div>
              </div>

              <div className="row between">
                <span className="note" style={{ fontSize: 12 }}>
                  {r.creator ?? "unattributed"}
                </span>

                <div className="row" style={{ gap: 6 }}>
                  {r.archived ? (
                    <button
                      className="ghost"
                      onClick={() => act(r.id, "restore")}
                      disabled={busy !== null}
                      style={{ fontSize: 11, padding: "2px 8px" }}
                    >
                      restore
                    </button>
                  ) : (
                    <>
                      <button
                        className="ghost"
                        onClick={() => act(r.id, r.completed_at ? "reopen" : "complete")}
                        disabled={busy !== null}
                        style={{ fontSize: 11, padding: "2px 8px" }}
                      >
                        {r.completed_at ? "reopen" : "complete"}
                      </button>
                      <button
                        className="ghost"
                        onClick={() => act(r.id, "archive")}
                        disabled={busy !== null}
                        style={{ fontSize: 11, padding: "2px 8px" }}
                      >
                        hide
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <div className="empty">
            {tab === "archived"
              ? "Nothing hidden."
              : tab === "completed"
              ? "Nothing finished yet."
              : "No shows in production. Start one in Studio."}
          </div>
        )}
      </div>
    </>
  );
}
