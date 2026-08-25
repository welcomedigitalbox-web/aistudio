"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LabPremise({
  labId,
  premise,
  hasSources,
}: {
  labId: string;
  premise: string | null;
  hasSources: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState(premise ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [took, setTook] = useState<{ from: string; what: string }[]>([]);
  const [risks, setRisks] = useState<string[]>([]);

  async function run() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "premise", labId, note: note || undefined }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "That did not run.");
    setTook(json.took ?? []);
    setRisks(json.risks ?? []);
    setDraft(json.premise);
    setNote("");
    router.refresh();
  }

  async function save() {
    setBusy(true);
    await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-premise", labId, premise: draft }),
    });
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  if (!hasSources) {
    return <div className="empty">Add sources before drafting a premise.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {premise && (
        <div className="card">
          {editing ? (
            <div style={{ display: "grid", gap: 8 }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} style={{ minHeight: 120 }} />
              <div className="row between">
                <button className="ghost" onClick={() => setEditing(false)}>Cancel</button>
                <button onClick={save} disabled={busy}>Save</button>
              </div>
            </div>
          ) : (
            <>
              <div className="row between">
                <span className="eyebrow" style={{ margin: 0 }}>Premise</span>
                <button className="ghost" onClick={() => { setDraft(premise); setEditing(true); }}>
                  Edit
                </button>
              </div>
              <p style={{ marginTop: 8, marginBottom: 0 }}>{premise}</p>
            </>
          )}
        </div>
      )}

      {took.length > 0 && (
        <div className="card">
          <span className="eyebrow">What came from where</span>
          <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
            {took.map((t, i) => (
              <div key={i} className="note">
                <strong>{t.from}</strong> — {t.what}
              </div>
            ))}
          </div>
        </div>
      )}

      {risks.length > 0 && (
        <div className="card" style={{ borderColor: "var(--amber)" }}>
          <span className="eyebrow">Where this might not hold</span>
          <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
            {risks.map((r, i) => (
              <div key={i} className="note">{r}</div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <textarea
          placeholder={premise ? "What is wrong with this premise?" : "Anything to steer this pass? Optional."}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ minHeight: 60 }}
        />
        <div className="row between">
          <span className="note">Roughly $0.20.</span>
          <button onClick={run} disabled={busy}>
            {busy ? "Thinking…" : premise ? "Draft again" : "Draft the premise"}
          </button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}
