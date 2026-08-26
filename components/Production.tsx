"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Shot {
  id: string;
  n: number;
  scene_id: string | null;
  scene_n: number | null;
  framing: string | null;
  visual: string;
  motion: string | null;
  target_seconds: number;
  approved: boolean;
  keyframe_storage_key: string | null;
  keyframe_state: string;
  keyframe_error: string | null;
  keyframe_approved: boolean;
  clip_storage_key: string | null;
  clip_state: string;
  clip_error: string | null;
  clip_seconds: number | null;
  chain_from_shot_id: string | null;
  cost_usd: number;
}

interface Scene {
  id: string;
  n: number;
  slug: string | null;
}

const KEYFRAME_MODELS = [
  { id: "draft", label: "Flux Schnell — draft, $0.003" },
  { id: "flux", label: "Flux Dev — $0.025" },
  { id: "seedream", label: "Seedream — reference-aware, $0.03" },
];

const CLIP_MODELS = [
  { id: "kling_v1", label: "Kling 1.6 — drafts, ~$0.20/5s" },
  { id: "kling_turbo", label: "Kling 2.5 Turbo — ~$0.35/5s" },
];

export function Production({
  episodeId,
  scenes,
  shots,
}: {
  episodeId: string;
  scenes: Scene[];
  shots: Shot[];
}) {
  const router = useRouter();
  const [kfModel, setKfModel] = useState("flux");
  const [clipModel, setClipModel] = useState("kling_v1");
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "";

  const needKeyframe = shots.filter((s) => !s.keyframe_storage_key);
  const needApproval = shots.filter((s) => s.keyframe_storage_key && !s.keyframe_approved);
  const needClip = shots.filter((s) => s.keyframe_approved && !s.clip_storage_key);
  const pending = shots.filter(
    (s) => s.keyframe_state === "running" || s.clip_state === "running"
  );
  const spent = shots.reduce((t, s) => t + Number(s.cost_usd), 0);
  const runtime = shots.reduce((t, s) => t + Number(s.clip_seconds ?? 0), 0);

  async function call(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    const res = await fetch("/api/studio/produce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(json.error ?? "That did not run.");
      return null;
    }
    return json;
  }

  /**
   * Batches run one at a time rather than all at once: the provider's queue
   * limit is low, and a hundred parallel submissions come back as rate-limit
   * failures that still cost a retry.
   */
  async function runBatch(list: Shot[], action: "keyframe" | "clip", model: string) {
    setRunning(true);
    setError("");
    for (const [i, shot] of list.entries()) {
      setProgress(`${i + 1} of ${list.length}`);
      const ok = await call({ action, shotId: shot.id, model }, shot.id);
      if (!ok) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    setRunning(false);
    setProgress("");
    router.refresh();
  }

  async function estimateAndRun(stage: "keyframe" | "clip") {
    const model = stage === "keyframe" ? kfModel : clipModel;
    const est = await call({ action: "estimate", episodeId, stage, model }, "estimate");
    if (!est) return;
    if (est.count === 0) return setError("Nothing pending at this stage.");

    const ok = window.confirm(
      `Generate ${est.count} ${stage === "keyframe" ? "keyframes" : "clips"} for about $${est.estimatedCostUsd}?`
    );
    if (!ok) return;

    await runBatch(stage === "keyframe" ? needKeyframe : needClip, stage, model);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div className="row between">
          <div>
            <span className="eyebrow" style={{ margin: 0 }}>Progress</span>
            <div className="note mono" style={{ marginTop: 4 }}>
              {shots.length - needKeyframe.length}/{shots.length} keyframes ·{" "}
              {shots.filter((s) => s.keyframe_approved).length}/{shots.length} approved ·{" "}
              {shots.filter((s) => s.clip_storage_key).length}/{shots.length} clips
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="cost">${spent.toFixed(3)}</div>
            <div className="rail-label">
              {Math.floor(runtime / 60)}m {Math.round(runtime % 60)}s cut
            </div>
          </div>
        </div>
      </div>

      {error && <div className="err">{error}</div>}
      {running && <div className="note">Submitting {progress}…</div>}
      {pending.length > 0 && (
        <div className="note">{pending.length} still rendering — refresh in a moment.</div>
      )}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>1 · Keyframes</strong>
        <div className="note">
          The still comes first because it costs a tenth of the clip. A bad composition
          caught here is a clip you never paid for.
        </div>
        <div className="row between" style={{ gap: 10 }}>
          <select
            value={kfModel}
            onChange={(e) => setKfModel(e.target.value)}
            style={{ maxWidth: 300 }}
          >
            {KEYFRAME_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button
            onClick={() => estimateAndRun("keyframe")}
            disabled={running || busy !== null || needKeyframe.length === 0}
          >
            {needKeyframe.length === 0 ? "All done" : `Generate ${needKeyframe.length}`}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>2 · Clips</strong>
        <div className="note">
          Image-to-video from the approved keyframe. Shots over 7 seconds switch to
          Kling's standard mode automatically — professional mode caps at 5.
        </div>
        {needApproval.length > 0 && (
          <div className="note" style={{ color: "var(--amber)" }}>
            {needApproval.length} keyframes are unapproved and will be skipped.
          </div>
        )}
        <div className="row between" style={{ gap: 10 }}>
          <select
            value={clipModel}
            onChange={(e) => setClipModel(e.target.value)}
            style={{ maxWidth: 300 }}
          >
            {CLIP_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button
            onClick={() => estimateAndRun("clip")}
            disabled={running || busy !== null || needClip.length === 0}
          >
            {needClip.length === 0 ? "Nothing ready" : `Generate ${needClip.length}`}
          </button>
        </div>
      </div>

      {scenes.map((sc) => {
        const list = shots.filter((s) => s.scene_n === sc.n);
        if (list.length === 0) return null;
        const chained = list.some((s) => s.chain_from_shot_id);

        return (
          <div key={sc.id} style={{ display: "grid", gap: 8 }}>
            <div className="row between" style={{ marginTop: 8 }}>
              <div>
                <span className="eyebrow">Scene {sc.n}</span>
                <div style={{ fontSize: 13 }}>{sc.slug}</div>
              </div>
              <button
                className={chained ? "" : "ghost"}
                onClick={() =>
                  call({ action: "chain", sceneId: sc.id, on: !chained }, sc.id).then(() =>
                    router.refresh()
                  )
                }
                disabled={busy !== null || running}
                style={{ fontSize: 12, padding: "3px 10px" }}
                title="Start each clip from the previous one's last frame"
              >
                {chained ? "chained" : "chain shots"}
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              }}
            >
              {list.map((shot) => {
                const kfUrl = shot.keyframe_storage_key
                  ? base + "/" + shot.keyframe_storage_key
                  : null;
                const clipUrl = shot.clip_storage_key
                  ? base + "/" + shot.clip_storage_key
                  : null;

                return (
                  <div
                    key={shot.id}
                    className="card"
                    style={{
                      padding: 0,
                      overflow: "hidden",
                      borderColor: shot.keyframe_approved ? "var(--pine)" : "var(--line)",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: "16/9",
                        background: "var(--stone)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {clipUrl ? (
                        <video
                          src={clipUrl}
                          controls
                          loop
                          muted
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : kfUrl ? (
                        <img
                          src={kfUrl}
                          alt={"Shot " + shot.n}
                          onClick={() => setLightbox(kfUrl)}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            cursor: "zoom-in",
                          }}
                        />
                      ) : (
                        <span
                          className="note"
                          style={{ fontSize: 12, textAlign: "center", padding: 12 }}
                        >
                          {shot.keyframe_state === "failed"
                            ? shot.keyframe_error ?? "failed"
                            : shot.keyframe_state === "running"
                            ? "rendering…"
                            : "no keyframe"}
                        </span>
                      )}
                    </div>

                    <div style={{ padding: 10, display: "grid", gap: 6 }}>
                      <div className="row between">
                        <span className="mono" style={{ fontSize: 12 }}>
                          {shot.n} · {shot.framing} · {shot.target_seconds}s
                        </span>
                        <span className="cost" style={{ fontSize: 11 }}>
                          ${Number(shot.cost_usd).toFixed(3)}
                        </span>
                      </div>

                      <div className="note" style={{ fontSize: 12 }}>
                        {shot.visual.slice(0, 90)}
                        {shot.visual.length > 90 ? "…" : ""}
                      </div>

                      {shot.clip_state === "failed" && (
                        <div className="err" style={{ fontSize: 11 }}>{shot.clip_error}</div>
                      )}

                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        <button
                          className="ghost"
                          onClick={() =>
                            call(
                              { action: "keyframe", shotId: shot.id, model: kfModel },
                              shot.id
                            ).then(() => router.refresh())
                          }
                          disabled={busy !== null || running}
                          style={{ fontSize: 11, padding: "2px 8px" }}
                        >
                          {busy === shot.id ? "…" : kfUrl ? "redo still" : "still"}
                        </button>

                        {kfUrl && (
                          <button
                            className={shot.keyframe_approved ? "ghost" : ""}
                            onClick={() =>
                              call(
                                {
                                  action: "approve-keyframe",
                                  shotId: shot.id,
                                  approved: !shot.keyframe_approved,
                                },
                                shot.id
                              ).then(() => router.refresh())
                            }
                            disabled={busy !== null || running}
                            style={{ fontSize: 11, padding: "2px 8px" }}
                          >
                            {shot.keyframe_approved ? "reopen" : "approve"}
                          </button>
                        )}

                        {shot.keyframe_approved && (
                          <button
                            className="ghost"
                            onClick={() =>
                              call(
                                { action: "clip", shotId: shot.id, model: clipModel },
                                shot.id
                              ).then(() => router.refresh())
                            }
                            disabled={busy !== null || running}
                            style={{ fontSize: 11, padding: "2px 8px" }}
                          >
                            {clipUrl ? "redo clip" : "clip"}
                          </button>
                        )}

                        {clipUrl && (
                          <a
                            href={clipUrl}
                            download={"shot-" + shot.n + ".mp4"}
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              border: "1px solid var(--line)",
                              borderRadius: "var(--r)",
                            }}
                          >
                            save
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(27, 26, 23, 0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            cursor: "zoom-out",
            padding: 32,
          }}
        >
          <img
            src={lightbox}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        </div>
      )}
    </div>
  );
}
