"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface RefImage {
  id: string;
  angle: string | null;
  storage_key: string | null;
  state: string;
  error: string | null;
  cost_usd: number;
}

interface RefRow {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  chosen_image_id: string | null;
  ref_images: RefImage[];
}

const MODELS = [
  { id: "fast", label: "Flux Schnell — draft, $0.003" },
  { id: "quality", label: "Flux Dev — $0.025" },
  { id: "seedream", label: "Seedream — $0.03" },
];

const ANGLE_LABEL: Record<string, string> = {
  front: "Front",
  three_quarter: "Three-quarter",
  profile: "Profile",
  full_body: "Full body",
  expression: "Expression",
  wide: "Wide",
  medium: "Medium",
  detail: "Detail",
  angle: "Angled",
};

export function RefSheet({ refRow }: { refRow: RefRow }) {
  const router = useRouter();
  const [model, setModel] = useState("quality");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "";
  const images = refRow.ref_images ?? [];
  const pending = images.filter((i) => i.state === "queued" || i.state === "running");
  const spent = images.reduce((s, i) => s + Number(i.cost_usd), 0);

  async function generate() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/refs/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refId: refRow.id, model }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not start generation.");
    router.refresh();
  }

  async function choose(imageId: string) {
    setError("");
    const res = await fetch("/api/refs/choose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refId: refRow.id, imageId }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Could not set that image.");
    router.refresh();
  }

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <div className="row between">
        <div>
          <div className="eyebrow">{refRow.kind}</div>
          <h3>{refRow.name}</h3>
        </div>
        <span className="cost">${spent.toFixed(3)}</span>
      </div>

      {refRow.description && <p className="note" style={{ margin: 0 }}>{refRow.description}</p>}

      {images.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          }}
        >
          {images.map((img) => {
            const chosen = img.id === refRow.chosen_image_id;
            return (
              <div
                key={img.id}
                style={{
                  border: `1px solid ${chosen ? "var(--pine)" : "var(--line)"}`,
                  borderRadius: 3,
                  overflow: "hidden",
                  background: "var(--stone)",
                }}
              >
                <div
                  style={{
                    aspectRatio: refRow.kind === "character" ? "3/4" : "16/9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {img.state === "ready" && img.storage_key ? (
                    <img
                      src={`${base}/${img.storage_key}`}
                      alt={`${refRow.name} — ${img.angle}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span className="note" style={{ fontSize: 12, textAlign: "center", padding: 8 }}>
                      {img.state === "failed" ? img.error ?? "failed" : "generating…"}
                    </span>
                  )}
                </div>

                <div className="row between" style={{ padding: "6px 8px", gap: 6 }}>
                  <span className="rail-label">{ANGLE_LABEL[img.angle ?? ""] ?? img.angle}</span>
                  {img.state === "ready" &&
                    (chosen ? (
                      <span className="rail-label" style={{ color: "var(--pine)" }}>canon</span>
                    ) : (
                      <button
                        className="ghost"
                        onClick={() => choose(img.id)}
                        style={{ fontSize: 11, padding: "2px 8px" }}
                      >
                        use
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <div className="note">{pending.length} still rendering — refresh in a moment.</div>
      )}

      <div className="row between" style={{ gap: 10 }}>
        <select value={model} onChange={(e) => setModel(e.target.value)} style={{ maxWidth: 260 }}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <button onClick={generate} disabled={busy || !refRow.description}>
          {busy ? "Queueing…" : images.length > 0 ? "Regenerate set" : "Generate set"}
        </button>
      </div>

      {!refRow.description && (
        <div className="note">Add a description before generating — it is what every angle shares.</div>
      )}

      {error && <div className="err">{error}</div>}
    </div>
  );
}
