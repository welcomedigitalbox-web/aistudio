"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function EpisodeCreate({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/series/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, title, premise }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not add the episode.");
    setTitle("");
    setPremise("");
    router.refresh();
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <input placeholder="Episode title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        placeholder="What happens in this one? One or two sentences."
        value={premise}
        onChange={(e) => setPremise(e.target.value)}
        style={{ minHeight: 60 }}
      />
      <div className="row between">
        <span className="note">Numbered automatically, in order.</span>
        <button onClick={create} disabled={busy || !title}>
          {busy ? "Adding…" : "Add episode"}
        </button>
      </div>
      {error && <div className="err">{error}</div>}
    </div>
  );
}
