"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Pipeline {
  id: string;
  state: string;
  stage: string | null;
  error: string | null;
  scenes_total: number;
  scenes_done: number;
  cost_usd: number;
  plan_id: string | null;
}

interface Source { id: string; title: string; state: string }

const LIVE = ["running", "awaiting_approval", "writing"];

export function PipelinePanel({
  projectId,
  pipeline,
  sources,
}: {
  projectId: string;
  pipeline: Pipeline | null;
  sources: Source[];
}) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = sources.filter((s) => s.state === "ready");
  const live = pipeline && LIVE.includes(pipeline.state);

  async function start() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, brief, sourceIds }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not start the run.");
    setBrief("");
    router.refresh();
  }

  async function decide(action: "approve" | "cancel") {
    setBusy(true);
    setError("");
    const res = await fetch("/api/pipeline/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineId: pipeline!.id, action }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "That did not go through.");
    router.refresh();
  }

  // ---------- live run ----------
  if (live) {
    const pct =
      pipeline!.scenes_total > 0
        ? (pipeline!.scenes_done / pipeline!.scenes_total) * 100
        : 0;

    return (
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div className="row between">
          <span className="eyebrow" style={{ margin: 0 }}>{pipeline!.state.replace("_", " ")}</span>
          <span className="cost">${Number(pipeline!.cost_usd).toFixed(4)}</span>
        </div>

        <div>
          <div style={{ marginBottom: 6 }}>{pipeline!.stage}</div>
          {pipeline!.scenes_total > 0 && (
            <div className="meter"><i style={{ width: `${pct}%` }} /></div>
          )}
        </div>

        {pipeline!.state === "awaiting_approval" && (
          <>
            <p className="note" style={{ margin: 0 }}>
              Read the scene plan below before approving. Writing {pipeline!.scenes_total} scenes
              costs roughly ${(pipeline!.scenes_total * 0.06).toFixed(2)} and cannot be undone
              partway.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button onClick={() => decide("approve")} disabled={busy}>
                Write {pipeline!.scenes_total} scenes
              </button>
              <button className="ghost" onClick={() => decide("cancel")} disabled={busy}>
                Cancel run
              </button>
            </div>
          </>
        )}

        {pipeline!.state !== "awaiting_approval" && (
          <span className="note">This page updates on refresh.</span>
        )}

        {error && <div className="err">{error}</div>}
      </div>
    );
  }

  // ---------- start a new run ----------
  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <span className="eyebrow">Run the room</span>

      <textarea
        placeholder="What is the story? Give the premise, the tone, and roughly how long it should run."
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        style={{ minHeight: 120 }}
      />

      {ready.length > 0 && (
        <div>
          <span className="eyebrow">Sources</span>
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {ready.map((s) => (
              <button
                key={s.id}
                className={sourceIds.includes(s.id) ? "" : "ghost"}
                onClick={() =>
                  setSourceIds(
                    sourceIds.includes(s.id)
                      ? sourceIds.filter((x) => x !== s.id)
                      : [...sourceIds, s.id]
                  )
                }
                style={{ fontSize: 13, padding: "4px 10px" }}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {pipeline?.state === "failed" && (
        <div className="err">Last run failed: {pipeline.error}</div>
      )}

      <div className="row between">
        <span className="note">
          Research, characters, and a scene plan run first — then it stops for your approval.
        </span>
        <button onClick={start} disabled={busy || !brief}>
          {busy ? "Starting…" : "Start"}
        </button>
      </div>

      {error && <div className="err">{error}</div>}
    </div>
  );
}
