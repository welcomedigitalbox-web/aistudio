"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One approval button. Shows what is being approved and what it unlocks, so
 * nobody clicks through a gate without knowing what happens next.
 *
 * A creator sees the same card, without the button: the work is finished and
 * waiting on someone else, which is worth saying rather than hiding.
 */
export function Gate({
  seriesId,
  episodeId,
  gate,
  approved,
  what,
  unlocks,
  canApprove = true,
}: {
  seriesId?: string;
  episodeId?: string;
  gate: string;
  approved: boolean;
  what: string;
  unlocks: string;
  canApprove?: boolean;
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
          {canApprove && (
            <button className="ghost" onClick={() => set(false)} disabled={busy}>
              Reopen
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!canApprove) {
    return (
      <div className="card" style={{ borderColor: "var(--amber)" }}>
        <strong>{what}</strong>
        <div className="note" style={{ marginTop: 4 }}>
          Waiting on a reviewer. Approving unlocks: {unlocks}
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
