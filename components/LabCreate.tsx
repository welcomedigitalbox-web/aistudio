"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const OUTPUTS = [
  { id: "treatment", label: "Treatment", blurb: "10–30 pages, compressed. Fast to read, fast to change." },
  { id: "manuscript", label: "Manuscript", blurb: "Full prose. Slower and pricier, but ready to adapt." },
] as const;

export function LabCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [output, setOutput] = useState<string>("treatment");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return <button onClick={() => setOpen(true)}>New story</button>;

  async function create() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", title, brief, output }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not create that.");
    router.push(`/lab/${json.labId}`);
  }

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <input placeholder="Working title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <textarea
        placeholder="What are you after? What should this book do that the sources do not?"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        style={{ minHeight: 80 }}
      />

      <div>
        <span className="eyebrow">Output</span>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          {OUTPUTS.map((o) => (
            <button
              key={o.id}
              className={output === o.id ? "" : "ghost"}
              onClick={() => setOutput(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="note" style={{ marginTop: 6 }}>
          {OUTPUTS.find((o) => o.id === output)?.blurb}
        </p>
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
