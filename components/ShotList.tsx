"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Line {
  id: string;
  n: number;
  speaker: string;
  line: string;
  on_screen: boolean;
  seconds: number | null;
  storage_key: string | null;
}

interface Shot {
  id: string;
  n: number;
  scene_n: number | null;
  framing: string | null;
  visual: string;
  motion: string | null;
  ref_ids: string[];
  target_seconds: number;
  approved: boolean;
  keyframe_storage_key: string | null;
  clip_storage_key: string | null;
  shot_lines: Line[];
}

interface Scene {
  id: string;
  n: number;
  slug: string | null;
  job: string | null;
}

export function ShotList({
  scenes,
  shots,
  locked,
}: {
  scenes: Scene[];
  shots: Shot[];
  locked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [visual, setVisual] = useState("");
  const [motion, setMotion] = useState("");
  const [seconds, setSeconds] = useState(6);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const byScene = new Map<string, Shot[]>();
  for (const s of shots) {
    const key = String(s.scene_n ?? 0);
    byScene.set(key, [...(byScene.get(key) ?? []), s]);
  }

  const scenesWithout = scenes.filter((sc) => !(byScene.get(String(sc.n)) ?? []).length);
  const totalSeconds = shots.reduce((t, s) => t + Number(s.target_seconds), 0);
  const approved = shots.filter((s) => s.approved).length;
  const onScreenLines = shots.reduce(
    (t, s) => t + (s.shot_lines ?? []).filter((l) => l.on_screen).length,
    0
  );

  async function call(payload: Record<string, unknown>) {
    const res = await fetch("/api/studio/shots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "That did not run.");
      return null;
    }
    return json;
  }

  async function build(sceneId: string) {
    setBusy(sceneId);
    setError("");
    const json = await call({ action: "build", sceneId });
    setBusy(null);
    if (!json) return false;
    if (json.unknownRefs?.length) {
      setWarnings((w) => [
        ...w,
        `Shots reference art that does not exist: ${json.unknownRefs.join(", ")}`,
      ]);
    }
    router.refresh();
    return true;
  }

  async function buildAll() {
    setRunningAll(true);
    setError("");
    setWarnings([]);
    for (const sc of scenesWithout) {
      const ok = await build(sc.id);
      if (!ok) break;
    }
    setRunningAll(false);
  }

  async function save(shot: Shot) {
    setBusy(shot.id);
    await call({
      action: "update",
      shotId: shot.id,
      visual,
      motion,
      targetSeconds: seconds,
    });
    setBusy(null);
    setEditing(null);
    router.refresh();
  }

  async function setApproved(shotId: string, value: boolean) {
    setBusy(shotId);
    await call({ action: "update", shotId, approved: value });
    setBusy(null);
    router.refresh();
  }

  async function remove(shotId: string) {
    setBusy(shotId);
    await call({ action: "delete", shotId });
    setBusy(null);
    router.refresh();
  }

  async function toggleOnScreen(line: Line) {
    setBusy(line.id);
    await call({ action: "update-line", lineId: line.id, onScreen: !line.on_screen });
    setBusy(null);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="row between">
        <span className="note">
          {shots.length} shots · {approved}/{shots.length} approved ·{" "}
          {Math.round(totalSeconds / 60)}m {Math.round(totalSeconds % 60)}s
        </span>
        {!locked && scenesWithout.length > 0 && (
          <button onClick={buildAll} disabled={runningAll || busy !== null}>
            {runningAll
              ? `Building… (${scenes.length - scenesWithout.length}/${scenes.length})`
              : `Build ${scenesWithout.length} scenes`}
          </button>
        )}
      </div>

      {onScreenLines > 0 && (
        <div className="card" style={{ borderColor: "var(--amber)" }}>
          <strong>{onScreenLines} lines are marked on-screen.</strong>
          <div className="note" style={{ marginTop: 4 }}>
            Those shots need a character visibly speaking, which is where AI video is weakest.
            Flip them off-screen unless the shot depends on seeing the mouth.
          </div>
        </div>
      )}

      {warnings.map((w, i) => (
        <div key={i} className="card" style={{ borderColor: "var(--amber)" }}>
          <span className="note">{w}</span>
        </div>
      ))}

      {error && <div className="err">{error}</div>}

      {scenes.map((sc) => {
        const list = byScene.get(String(sc.n)) ?? [];
        return (
          <div key={sc.id} style={{ display: "grid", gap: 8 }}>
            <div className="row between" style={{ marginTop: 8 }}>
              <div>
                <span className="eyebrow">Scene {sc.n}</span>
                <div style={{ fontSize: 13 }}>{sc.slug}</div>
              </div>
              {!locked && (
                <button
                  className="ghost"
                  onClick={() => build(sc.id)}
                  disabled={busy !== null || runningAll}
                  style={{ fontSize: 12, padding: "3px 10px" }}
                >
                  {busy === sc.id ? "…" : list.length ? "Rebuild" : "Build"}
                </button>
              )}
            </div>

            {list.length === 0 && (
              <div className="empty" style={{ padding: 16, fontSize: 13 }}>
                No shots for this scene yet.
              </div>
            )}

            {list.map((shot) => {
              const isEditing = editing === shot.id;
              return (
                <div
                  key={shot.id}
                  className="card"
                  style={shot.approved ? { borderColor: "var(--pine)" } : undefined}
                >
                  <div className="row between">
                    <div className="row" style={{ gap: 10 }}>
                      <span className="mono">{shot.n}</span>
                      <span className="rail-label">{shot.framing}</span>
                      <span className="rail-label">{shot.target_seconds}s</span>
                    </div>
                    {!locked && (
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="ghost"
                          onClick={() => {
                            if (isEditing) return setEditing(null);
                            setVisual(shot.visual);
                            setMotion(shot.motion ?? "");
                            setSeconds(Number(shot.target_seconds));
                            setEditing(shot.id);
                          }}
                          style={{ fontSize: 12, padding: "3px 10px" }}
                        >
                          {isEditing ? "Cancel" : "Edit"}
                        </button>
                        <button
                          className="ghost"
                          onClick={() => remove(shot.id)}
                          disabled={busy !== null}
                          style={{ fontSize: 12, padding: "3px 10px" }}
                        >
                          Delete
                        </button>
                        <button
                          className={shot.approved ? "ghost" : ""}
                          onClick={() => setApproved(shot.id, !shot.approved)}
                          disabled={busy !== null}
                          style={{ fontSize: 12, padding: "3px 10px" }}
                        >
                          {shot.approved ? "Reopen" : "Approve"}
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      <div>
                        <span className="eyebrow">Visual — the still</span>
                        <textarea
                          value={visual}
                          onChange={(e) => setVisual(e.target.value)}
                          style={{ minHeight: 80, marginTop: 4 }}
                        />
                      </div>
                      <div>
                        <span className="eyebrow">Motion — what changes</span>
                        <textarea
                          value={motion}
                          onChange={(e) => setMotion(e.target.value)}
                          style={{ minHeight: 60, marginTop: 4 }}
                        />
                      </div>
                      <div className="row between">
                        <div className="row" style={{ gap: 8 }}>
                          <span className="note">Seconds</span>
                          <input
                            type="number"
                            min={2}
                            max={10}
                            value={seconds}
                            onChange={(e) => setSeconds(Number(e.target.value))}
                            style={{ width: 80 }}
                          />
                        </div>
                        <button onClick={() => save(shot)} disabled={busy !== null}>
                          {busy === shot.id ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14 }}>{shot.visual}</p>
                      {shot.motion && (
                        <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
                          → {shot.motion}
                        </p>
                      )}
                    </>
                  )}

                  {(shot.shot_lines ?? []).length > 0 && (
                    <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                      {shot.shot_lines.map((l) => (
                        <div key={l.id} className="row between" style={{ gap: 10 }}>
                          <div style={{ minWidth: 0, fontSize: 13 }}>
                            <span className="mono" style={{ fontSize: 12 }}>
                              {l.speaker}
                            </span>{" "}
                            {l.line}
                          </div>
                          {!locked && (
                            <button
                              className="ghost"
                              onClick={() => toggleOnScreen(l)}
                              disabled={busy !== null}
                              style={{
                                fontSize: 11,
                                padding: "2px 8px",
                                whiteSpace: "nowrap",
                                color: l.on_screen ? "var(--amber)" : undefined,
                              }}
                            >
                              {l.on_screen ? "on screen" : "voice over"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
