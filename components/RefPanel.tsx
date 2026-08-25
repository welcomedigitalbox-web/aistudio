"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Ref {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  chosen_image_id: string | null;
  voice_id: string | null;
}

const KINDS = [
  { id: "character", label: "Character" },
  { id: "location", label: "Location" },
  { id: "prop", label: "Prop" },
  { id: "style", label: "Style" },
] as const;

export function RefPanel({ seriesId, refs }: { seriesId: string; refs: Ref[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<string>("character");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/series/refs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, kind, name, description }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not add that reference.");
    setName("");
    setDescription("");
    router.refresh();
  }

  const grouped = KINDS.map((k) => ({
    ...k,
    items: refs.filter((r) => r.kind === k.id),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {KINDS.map((k) => (
            <button key={k.id} className={kind === k.id ? "" : "ghost"} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>

        <input placeholder="Name — e.g. Maya, the apartment" value={name} onChange={(e) => setName(e.target.value)} />

        <textarea
          placeholder={
            kind === "character"
              ? "Physical description used verbatim in every image prompt. Age, build, hair, clothing, distinguishing features."
              : "Description used verbatim in every image prompt."
          }
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ minHeight: 80 }}
        />

        <div className="row between">
          <span className="note">
            This text goes into every prompt unchanged. Write it once, carefully.
          </span>
          <button onClick={add} disabled={busy || !name}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>

        {error && <div className="err">{error}</div>}
      </div>

      {grouped.map((g) => (
        <div key={g.id}>
          <span className="eyebrow">{g.label}s</span>
          <div className="grid two" style={{ marginTop: 6 }}>
            {g.items.map((r) => (
              <div key={r.id} className="card">
                <div className="row between">
                  <h3>{r.name}</h3>
                  <span className="rail-label" style={{ color: r.chosen_image_id ? "var(--pine)" : "var(--muted)" }}>
                    {r.kind === "style" ? "text only" : r.chosen_image_id ? "ref set" : "no image"}
                  </span>
                </div>
                {r.description && <p className="note" style={{ marginTop: 6 }}>{r.description}</p>}
                {r.kind === "character" && (
                  <div className="note mono" style={{ marginTop: 6 }}>
                    {r.voice_id ? `voice ${r.voice_id.slice(0, 8)}` : "no voice assigned"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {refs.length === 0 && (
        <div className="empty">
          No references yet. Characters and locations defined here are reused across every episode.
        </div>
      )}
    </div>
  );
}
