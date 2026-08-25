"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Break the novel into episodes. The count comes from the book, not a setting.
 */
export function SeasonPlan({ seriesId, hasEpisodes }: { seriesId: string; hasEpisodes: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reasoning, setReasoning] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setReasoning("");

    const res = await fetch("/api/studio/season", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId }),
    });
    const json = await res.json();
    setBusy(false);

    if (!res.ok) return setError(json.error ?? "Could not plan the season.");
    setReasoning(json.reasoning ?? "");
    router.refresh();
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div>
        <strong>{hasEpisodes ? "Plan more episodes" : "Break the novel into episodes"}</strong>
        <div className="note" style={{ marginTop: 4 }}>
          The episode count comes from the book — one per real turn in the story.
          {hasEpisodes && " New episodes are added after the existing ones."}
        </div>
      </div>

      <div className="row between">
        <span className="note">
          {busy ? "Reading the whole arc — a minute or so." : "Costs roughly $0.30."}
        </span>
        <button onClick={run} disabled={busy}>
          {busy ? "Planning…" : "Plan the season"}
        </button>
      </div>

      {reasoning && (
        <div className="note" style={{ borderLeft: "2px solid var(--line)", paddingLeft: 10 }}>
          {reasoning}
        </div>
      )}
      {error && <div className="err">{error}</div>}
    </div>
  );
}
