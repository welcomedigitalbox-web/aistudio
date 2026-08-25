"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SeriesCreate({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [bible, setBible] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} disabled={projects.length === 0}>
        {projects.length === 0 ? "Add a project first" : "New series"}
      </button>
    );
  }

  async function create() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title, premise, bible, targetMinutes: minutes }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not create the series.");
    router.push(`/series/${json.seriesId}`);
  }

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <input placeholder="Series title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <textarea
        placeholder="Premise — what the show is about in two or three sentences."
        value={premise}
        onChange={(e) => setPremise(e.target.value)}
        style={{ minHeight: 70 }}
      />

      <textarea
        placeholder={`Show bible — the rules that hold across every episode.

Tone:
Visual language:
Pacing:
The show never:`}
        value={bible}
        onChange={(e) => setBible(e.target.value)}
        style={{ minHeight: 160 }}
      />

      <div className="row" style={{ gap: 10 }}>
        <span className="note">Episode length</span>
        <input
          type="number"
          min={3}
          max={60}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          style={{ width: 90 }}
        />
        <span className="note">minutes</span>
      </div>

      <div className="row between">
        <span className="note">
          The bible is fed to every agent on every episode — this is what stops the show drifting.
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button className="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          <button onClick={create} disabled={busy || !title || !projectId}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      {error && <div className="err">{error}</div>}
    </div>
  );
}
