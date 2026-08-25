"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One approval button. Shows what is being approved and what it unlocks, so
 * nobody clicks through a gate without knowing what happens next.
 */
export function Gate({
  seriesId,
  episodeId,
  gate,
  approved,
  what,
  unlocks,
}: {
  seriesId?: string;
  episodeId?: string;
  gate: string;
  approved: boolean;
  what: string;
  unlocks: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function set(value: boolean) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/studio/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, episodeId, gate, value }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "That did not go through.");
    router.refresh();
  }

  if (approved) {
    return (
      <div className="card" style={{ borderColor: "var(--pine)" }}>
        <div className="row between">
          <span className="note">{what} — approved.</span>
          <button className="ghost" onClick={() => set(false)} disabled={busy}>
            Reopen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ borderColor: "var(--amber)" }}>
      <div className="row between">
        <div>
          <strong>{what}</strong>
          <div className="note" style={{ marginTop: 4 }}>Approving unlocks: {unlocks}</div>
        </div>
        <button onClick={() => set(true)} disabled={busy}>
          {busy ? "…" : "Approve"}
        </button>
      </div>
      {error && <div className="err" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
