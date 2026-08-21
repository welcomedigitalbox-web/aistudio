"use client";
import { useState } from "react";

interface Version {
  id: string;
  n: number;
  text_body: string | null;
  storage_key: string | null;
  model: string | null;
  prompt: string | null;
  cost_usd: number;
  created_at: string;
  approvals: { decision: string; note: string | null }[];
}

export function VersionList({ versions, currentId }: { versions: Version[]; currentId: string | null }) {
  const [open, setOpen] = useState<string | null>(versions[0]?.id ?? null);
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "";

  if (versions.length === 0) {
    return <div className="empty">No versions yet. The first render will appear here.</div>;
  }

  return (
    <div className="grid">
      {versions.map((v) => {
        const isOpen = open === v.id;
        const url = v.storage_key ? `${base}/${v.storage_key}` : null;
        return (
          <div key={v.id} className="card">
            <div className="row between">
              <div className="row" style={{ gap: 8 }}>
                <span className="mono">v{v.n}</span>
                {v.id === currentId && <span className="eyebrow" style={{ margin: 0, color: "var(--pine)" }}>current</span>}
                <span className="note mono">{v.model}</span>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <span className="cost">${Number(v.cost_usd).toFixed(4)}</span>
                <button className="ghost" onClick={() => setOpen(isOpen ? null : v.id)}>
                  {isOpen ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14 }}>
                {v.text_body && (
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{v.text_body}</pre>
                )}
                {url && url.match(/\.(mp4|webm|mov)$/i) && (
                  <video src={url} controls style={{ width: "100%", maxWidth: 380, borderRadius: 3 }} />
                )}
                {url && url.match(/\.(png|jpg|jpeg|webp)$/i) && (
                  <img src={url} alt={`Version ${v.n}`} style={{ width: "100%", maxWidth: 380, borderRadius: 3 }} />
                )}
                {v.prompt && (
                  <div className="note" style={{ marginTop: 12 }}>
                    <span className="eyebrow">Prompt</span>
                    {v.prompt}
                  </div>
                )}
                {v.approvals?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {v.approvals.map((a, i) => (
                      <div key={i} className="note">
                        <strong>{a.decision.replace("_", " ")}</strong>
                        {a.note ? ` — ${a.note}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
