"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One agent, one stage. Unlike the old writers' room panel there is nothing to
 * configure -- which context to feed in is decided by the pipeline, not the
 * person. Picking the wrong parents was the easiest way to get bad output.
 */
export function EpisodeAgent({
  episodeId,
  seriesId,
  agent,
  label,
  blurb,
  done,
  locked,
}: {
  episodeId: string;
  seriesId: string;
  agent: string;
  label: string;
  blurb: string;
  done: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/studio/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId, seriesId, agent, note }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "The agent could not run.");
    setNote("");
    router.refresh();
  }

  if (locked) {
    return (
      <div className="card" style={{ borderColor: "var(--pine)" }}>
        <span className="note">{label} — locked in.</span>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div>
        <strong>{label}</strong>
        <div className="note" style={{ marginTop: 4 }}>{blurb}</div>
      </div>

      <textarea
        placeholder="Anything to steer this pass? Optional."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ minHeight: 70 }}
      />

      <div className="row between">
        <span className="note">
          {done ? "Already run once — running again writes a new version." : "Costs a few cents."}
        </span>
        <button onClick={run} disabled={busy}>
          {busy ? "Thinking…" : done ? "Run again" : "Run"}
        </button>
      </div>

      {error && <div className="err">{error}</div>}
    </div>
  );
}
