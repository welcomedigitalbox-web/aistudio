"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATE = `Tone:

Visual language:

Pacing:

The show never:`;

export function BibleEditor({
  seriesId,
  bible,
  locked,
}: {
  seriesId: string;
  bible: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(bible || TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    const res = await fetch("/api/studio/bible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, bible: text }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not save.");
    setSaved(true);
    router.refresh();
  }

  if (locked) {
    return (
      <div className="card">
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, fontSize: 14 }}>
          {bible}
        </pre>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 200 }} />
      <div className="row between">
        <span className="note">
          Fed to every agent on every episode. This is what stops the show drifting.
        </span>
        <button onClick={save} disabled={busy || !text.trim()}>
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      {error && <div className="err">{error}</div>}
    </div>
  );
}
