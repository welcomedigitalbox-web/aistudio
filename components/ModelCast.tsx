"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Shot {
  id: string;
  n: number;
  scene_n: number | null;
  framing: string | null;
  visual: string;
  target_seconds: number;
  keyframe_approved: boolean;
  clip_storage_key: string | null;
  suggested_model: string | null;
  suggested_reason: string | null;
  model_approved: boolean;
}

const MODELS = [
  { id: "kling_v1", label: "Kling 1.6", usd: 0.2 },
  { id: "wan27", label: "Wan 2.7", usd: 0.3 },
  { id: "kling_turbo", label: "Kling 2.5 Turbo", usd: 0.35 },
  { id: "kling3_std", label: "Kling 3.0 Std", usd: 0.56 },
  { id: "veo_fast_fal", label: "Veo 3.1 Fast", usd: 0.75 },
  { id: "kling3", label: "Kling 3.0 Pro", usd: 0.84 },
  { id: "kling_o3", label: "Kling O3 Pro", usd: 1.0 },
  { id: "veo_full", label: "Veo 3.1", usd: 1.0 },
  { id: "seedance2_mini", label: "Seedance 2.0 Mini", usd: 1.2 },
  { id: "kling3_4k", label: "Kling 3.0 4K", usd: 2.1 },
  { id: "seedance2", label: "Seedance 2.0", usd: 3.41 },
];

/**
 * A model per shot, suggested and then signed off.
 *
 * The suggestion is the cheap part; the sign-off is the point. Nothing
 * generates until a person has looked at the list, because a wrong model on
 * sixty shots is the difference between twenty dollars and two hundred.
 */
export function ModelCast({ episodeId, shots }: { episodeId: string; shots: Shot[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ estimatedCostUsd: number; unknown: string[] } | null>(null);

  const cast = shots.filter((s) => s.suggested_model);
  const approved = shots.filter((s) => s.model_approved);

  const total = cast.reduce((t, s) => {
    const m = MODELS.find((x) => x.id === s.suggested_model);
    if (!m) return t;
    return t + m.usd * (Number(s.target_seconds) > 7 ? 2 : 1);
  }, 0);

  // Where the money actually goes, which is usually not where people expect.
  const byModel = new Map<string, { count: number; usd: number }>();
  for (const s of cast) {
    const m = MODELS.find((x) => x.id === s.suggested_model);
    if (!m) continue;
    const prev = byModel.get(m.label) ?? { count: 0, usd: 0 };
    byModel.set(m.label, {
      count: prev.count + 1,
      usd: prev.usd + m.usd * (Number(s.target_seconds) > 7 ? 2 : 1),
    });
  }

  async function call(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    const res = await fetch("/api/studio/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(json.error ?? "That did not run.");
      return null;
    }
    router.refresh();
    return json;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div>
          <strong>{cast.length > 0 ? "Re-cast the models" : "Cast a model to every shot"}</strong>
          <div className="note" style={{ marginTop: 4 }}>
            A candle flame and a crowd turning want different models. One
            dropdown for sixty shots pays the crowd rate for the flame.
          </div>
        </div>

        <textarea
          placeholder="Anything to steer this pass? e.g. keep it under $30, or use 4K on the last shot."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ minHeight: 60 }}
        />

        <div className="row between">
          <span className="note">A few cents. Nothing generates.</span>
          <button
            onClick={async () => {
              const r = await call({ action: "cast", episodeId, note }, "cast");
              if (r) {
                setResult(r);
                setNote("");
              }
            }}
            disabled={busy !== null}
          >
            {busy === "cast" ? "Casting…" : cast.length > 0 ? "Re-cast" : "Cast"}
          </button>
        </div>

        {result?.unknown?.length ? (
          <div className="note" style={{ color: "var(--amber)" }}>
            Ignored models that are not in the catalogue: {result.unknown.join(", ")}
          </div>
        ) : null}

        {error && <div className="err">{error}</div>}
      </div>

      {cast.length > 0 && (
        <>
          <div className="card">
            <div className="row between">
              <div>
                <span className="eyebrow" style={{ margin: 0 }}>Estimate</span>
                <div style={{ display: "grid", gap: 2, marginTop: 6 }}>
                  {[...byModel.entries()]
                    .sort((a, b) => b[1].usd - a[1].usd)
                    .map(([label, v]) => (
                      <div key={label} className="note mono" style={{ fontSize: 12 }}>
                        {v.count}× {label} — ${v.usd.toFixed(2)}
                      </div>
                    ))}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="cost">${total.toFixed(2)}</div>
                <div className="rail-label">{cast.length} shots</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderColor: approved.length ? "var(--pine)" : "var(--amber)" }}>
            <div className="row between">
              <div>
                <strong>
                  {approved.length ? "Cast approved" : `Approve the cast (${cast.length} shots)`}
                </strong>
                <div className="note" style={{ marginTop: 4 }}>
                  {approved.length
                    ? "Clips will use each shot's own model."
                    : "Nothing generates until this is signed off."}
                </div>
              </div>
              <button
                className={approved.length ? "ghost" : ""}
                onClick={() =>
                  call({ action: "approve", episodeId, approved: !approved.length }, "approve")
                }
                disabled={busy !== null}
              >
                {approved.length ? "Reopen" : "Approve"}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {shots.map((s) => (
              <div key={s.id} className="card" style={{ padding: 10 }}>
                <div className="row between" style={{ gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="mono" style={{ fontSize: 12 }}>
                      {s.n} · scene {s.scene_n} · {s.framing} · {s.target_seconds}s
                    </span>
                    <div className="note" style={{ fontSize: 12, marginTop: 2 }}>
                      {s.suggested_reason ?? String(s.visual).slice(0, 80)}
                    </div>
                  </div>

                  <select
                    value={s.suggested_model ?? ""}
                    onChange={(e) =>
                      call({ action: "set", shotId: s.id, model: e.target.value }, s.id)
                    }
                    disabled={busy !== null || !!s.clip_storage_key}
                    style={{ maxWidth: 200, fontSize: 12 }}
                  >
                    <option value="">unassigned</option>
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — ${m.usd.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
