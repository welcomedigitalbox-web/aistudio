"use client";
import { useState } from "react";

interface Result {
  id: string;
  label: string;
  state: "up" | "down" | "unauthorised" | "timeout";
}

const COLOUR: Record<string, string> = {
  up: "var(--pine)",
  down: "var(--rust)",
  unauthorised: "var(--rust)",
  timeout: "var(--amber)",
};

/**
 * Which gateway models are taking work right now.
 *
 * Capacity moves hour to hour and the gateway publishes nothing, so the only
 * honest answer is a live check. It costs nothing: each probe is a request
 * the model would reject anyway.
 */
export function GatewayProbe() {
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");

  async function check() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/studio/probe");
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not check.");
    setResults(json.results);
    setCheckedAt(new Date(json.checkedAt).toLocaleTimeString());
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div className="row between">
        <div>
          <strong>Gateway capacity</strong>
          <div className="note" style={{ marginTop: 4 }}>
            Which models are taking work right now. Costs nothing — each check is
            a request the model would reject anyway.
          </div>
        </div>
        <button onClick={check} disabled={busy}>
          {busy ? "Checking…" : "Check"}
        </button>
      </div>

      {error && <div className="err">{error}</div>}

      {results && (
        <>
          <div style={{ display: "grid", gap: 4 }}>
            {results.map((r) => (
              <div key={r.id} className="row between" style={{ fontSize: 13 }}>
                <span>{r.label}</span>
                <span className="rail-label" style={{ color: COLOUR[r.state] }}>
                  {r.state}
                </span>
              </div>
            ))}
          </div>
          <span className="note mono" style={{ fontSize: 11 }}>
            checked {checkedAt}
          </span>
        </>
      )}
    </div>
  );
}
