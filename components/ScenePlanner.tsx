"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScenePlanner({
  episodeId,
  planned,
  locked,
}: {
  episodeId: string;
  planned: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newPlaces, setNewPlaces] = useState<string[]>([]);

  async function run() {
    setBusy(true);
    setError("");
    setNewPlaces([]);

    const res = await fetch("/api/studio/scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "plan", episodeId, note }),
    });
    const json = await res.json();
    setBusy(false);

    if (!res.ok) return setError(json.error ?? "The planner could not run.");
    setNewPlaces(json.newLocations ?? []);
    setNote("");
    router.refresh();
  }

  if (locked) {
    return (
      <div className="card" style={{ borderColor: "var(--pine)" }}>
        <span className="note">Scene plan — locked in.</span>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div>
        <strong>{planned ? "Re-plan the scenes" : "Plan the scenes"}</strong>
        <div className="note" style={{ marginTop: 4 }}>
          Structure only — what each scene does and how it turns. No dialogue yet.
          {planned && " Re-planning discards any scenes already written."}
        </div>
      </div>

      <textarea
        placeholder="Anything to steer this pass? Optional."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ minHeight: 60 }}
      />

      <div className="row between">
        <span className="note">A few cents.</span>
        <button onClick={run} disabled={busy}>
          {busy ? "Planning…" : planned ? "Re-plan" : "Plan"}
        </button>
      </div>

      {newPlaces.length > 0 && (
        <div className="note" style={{ borderLeft: "2px solid var(--amber)", paddingLeft: 10 }}>
          This episode needs locations that do not exist yet: {newPlaces.join(", ")}. Add them to
          the cast before generating shots.
        </div>
      )}
      {error && <div className="err">{error}</div>}
    </div>
  );
}
