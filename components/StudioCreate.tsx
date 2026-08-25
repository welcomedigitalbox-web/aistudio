"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RENDER_STYLES } from "@/lib/stages";

export function StudioCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [style, setStyle] = useState<string>("2d_anime");
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return <button onClick={() => setOpen(true)}>New show</button>;

  async function create() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, premise, renderStyle: style, targetMinutes: minutes }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not create the show.");
    router.push(`/studio/${json.seriesId}`);
  }

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <input placeholder="Show title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <textarea
        placeholder="Premise — what the show is about, in two or three sentences."
        value={premise}
        onChange={(e) => setPremise(e.target.value)}
        style={{ minHeight: 70 }}
      />

      <div>
        <span className="eyebrow">Look</span>
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {RENDER_STYLES.map((s) => (
            <button
              key={s.id}
              className={style === s.id ? "" : "ghost"}
              onClick={() => setStyle(s.id)}
              style={{ fontSize: 13, padding: "4px 10px" }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="note" style={{ marginTop: 6 }}>
          Fixed for the whole show. Changing it later means regenerating every frame.
        </p>
      </div>

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
        <span className="note" />
        <div className="row" style={{ gap: 8 }}>
          <button className="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          <button onClick={create} disabled={busy || !title}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      {error && <div className="err">{error}</div>}
    </div>
  );
}
