"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Scene {
  id: string;
  n: number;
  slug: string | null;
  job: string | null;
  opens_on: string | null;
  closes_on: string | null;
  characters: string[];
  conflict: string | null;
  est_seconds: number | null;
  script: any;
  cost_usd: number;
}

/**
 * One row per scene, each written on its own. Writing them one at a time keeps
 * every call small enough to finish, and lets you rewrite a single bad scene
 * without paying for the fourteen good ones again.
 */
export function SceneList({ scenes, locked }: { scenes: Scene[]; locked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const unwritten = scenes.filter((s) => !s.script);
  const spent = scenes.reduce((t, s) => t + Number(s.cost_usd), 0);

  async function write(sceneId: string) {
    setBusy(sceneId);
    setError("");
    const res = await fetch("/api/studio/scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "write", sceneId }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(json.error ?? "That scene did not write.");
      return false;
    }
    router.refresh();
    return true;
  }

  /** Sequential, not parallel: each scene reads its neighbours. */
  async function writeAll() {
    setRunningAll(true);
    setError("");
    for (const scene of unwritten) {
      const ok = await write(scene.id);
      if (!ok) break;
    }
    setRunningAll(false);
  }

  if (scenes.length === 0) {
    return <div className="empty">No scenes yet. Plan them above.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="row between">
        <span className="note">
          {scenes.length - unwritten.length}/{scenes.length} written · ${spent.toFixed(4)}
        </span>
        {!locked && unwritten.length > 0 && (
          <button onClick={writeAll} disabled={runningAll || busy !== null}>
            {runningAll ? `Writing… (${scenes.length - unwritten.length}/${scenes.length})` : `Write all ${unwritten.length}`}
          </button>
        )}
      </div>

      {error && <div className="err">{error}</div>}

      {scenes.map((s) => {
        const isOpen = open === s.id;
        return (
          <div key={s.id} className="card">
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow">
                  Scene {s.n}{s.est_seconds ? ` · ${s.est_seconds}s` : ""}
                </div>
                <h3 style={{ fontSize: 14 }}>{s.slug ?? `Scene ${s.n}`}</h3>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {s.script ? (
                  <button className="ghost" onClick={() => setOpen(isOpen ? null : s.id)}>
                    {isOpen ? "Hide" : "Read"}
                  </button>
                ) : (
                  <span className="rail-label">not written</span>
                )}
                {!locked && (
                  <button
                    className="ghost"
                    onClick={() => write(s.id)}
                    disabled={busy !== null || runningAll}
                  >
                    {busy === s.id ? "…" : s.script ? "Rewrite" : "Write"}
                  </button>
                )}
              </div>
            </div>

            {s.job && <p className="note" style={{ marginTop: 6 }}>{s.job}</p>}
            {(s.opens_on || s.closes_on) && (
              <div className="note mono" style={{ marginTop: 4, fontSize: 12 }}>
                {s.opens_on} → {s.closes_on}
              </div>
            )}

            {isOpen && s.script && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {(s.script.elements ?? []).map((el: any, i: number) =>
                  el.type === "dialogue" ? (
                    <div key={i} style={{ paddingLeft: 40 }}>
                      <div className="mono" style={{ fontSize: 12 }}>{el.character}</div>
                      {el.parenthetical && (
                        <div className="note" style={{ fontSize: 12 }}>({el.parenthetical})</div>
                      )}
                      <div>{el.text}</div>
                    </div>
                  ) : (
                    <div key={i}>{el.text}</div>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
