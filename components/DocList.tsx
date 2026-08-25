"use client";
import { useState } from "react";

interface Doc {
  id: string;
  agent: string;
  title: string;
  body: unknown;
  cost_usd: number;
  created_at: string;
}

export function DocList({ docs }: { docs: Doc[] }) {
  const [open, setOpen] = useState<string | null>(docs[0]?.id ?? null);

  if (docs.length === 0) {
    return <div className="empty">Nothing yet. Run an agent above to start the room.</div>;
  }

  return (
    <div className="grid">
      {docs.map((d) => {
        const isOpen = open === d.id;
        return (
          <div key={d.id} className="card">
            <div className="row between">
              <div>
                <div className="eyebrow">{d.agent.replace("_", " ")}</div>
                <h3>{d.title}</h3>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <span className="cost">${Number(d.cost_usd).toFixed(4)}</span>
                <button className="ghost" onClick={() => setOpen(isOpen ? null : d.id)}>
                  {isOpen ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {isOpen && (
              <pre
                style={{
                  marginTop: 14,
                  whiteSpace: "pre-wrap",
                  fontSize: 13,
                  lineHeight: 1.5,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(d.body, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
