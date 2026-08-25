"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LabExport({
  labId,
  ready,
  exportedSourceId,
  unwritten,
}: {
  labId: string;
  ready: boolean;
  exportedSourceId: string | null;
  unwritten: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "export", labId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Export failed.");
    router.refresh();
  }

  if (exportedSourceId) {
    return (
      <div className="card" style={{ borderColor: "var(--pine)" }}>
        <strong>Exported.</strong>
        <div className="note" style={{ marginTop: 4 }}>
          This book is now a source in the Studio. Create a show and pick it as the novel.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div>
        <strong>Send to the Studio</strong>
        <div className="note" style={{ marginTop: 4 }}>
          Assembles the chapters into a source the Studio reads like an uploaded novel — one
          chunk per chapter.
        </div>
      </div>
      <div className="row between">
        <span className="note">
          {unwritten > 0
            ? `${unwritten} chapters are still unwritten.`
            : "All chapters written."}
        </span>
        <button onClick={run} disabled={busy || !ready}>
          {busy ? "Exporting…" : "Export"}
        </button>
      </div>
      {error && <div className="err">{error}</div>}
    </div>
  );
}
