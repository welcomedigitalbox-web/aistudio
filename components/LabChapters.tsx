"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Chapter {
  id: string;
  n: number;
  title: string | null;
  summary: string | null;
  body: string | null;
  approved: boolean;
  cost_usd: number;
}

export function LabChapters({
  labId,
  chapters,
  hasOutline,
  hasPremise,
  exported,
}: {
  labId: string;
  chapters: Chapter[];
  hasOutline: boolean;
  hasPremise: boolean;
  exported: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [outlineNote, setOutlineNote] = useState("");
  const [error, setError] = useState("");

  const unwritten = chapters.filter((c) => !c.body);
  const spent = chapters.reduce((t, c) => t + Number(c.cost_usd), 0);

  async function call(payload: Record<string, unknown>) {
    const res = await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "That did not run.");
      return null;
    }
    return json;
  }

  async function outline() {
    setBusy("outline");
    setError("");
    await call({ action: "outline", labId, note: outlineNote || undefined });
    setBusy(null);
    setOutlineNote("");
    router.refresh();
  }

  async function write(chapterId: string, withNote?: string) {
    setBusy(chapterId);
    setError("");
    const ok = await call({ action: "chapter", chapterId, note: withNote || undefined });
    setBusy(null);
    if (!ok) return false;
    setNote("");
    router.refresh();
    return true;
  }

  /** Sequential: each chapter reads the tail of the one before it. */
  async function writeAll() {
    setRunningAll(true);
    setError("");
    for (const c of unwritten) {
      const ok = await write(c.id);
      if (!ok) break;
    }
    setRunningAll(false);
  }

  async function save(chapterId: string) {
    setBusy(chapterId);
    await call({ action: "save-chapter", chapterId, text: draft });
    setBusy(null);
    setEditing(null);
    router.refresh();
  }

  if (!hasPremise) {
    return <div className="empty">Settle the premise before outlining.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div>
          <strong>{hasOutline ? "Re-outline" : "Outline the chapters"}</strong>
          <div className="note" style={{ marginTop: 4 }}>
            Structure only — what each chapter does and what changes.
            {hasOutline && " Re-outlining discards any chapters already written."}
          </div>
        </div>
        <textarea
          placeholder="Anything to steer this pass? Optional."
          value={outlineNote}
          onChange={(e) => setOutlineNote(e.target.value)}
          style={{ minHeight: 60 }}
        />
        <div className="row between">
          <span className="note">Roughly $0.25.</span>
          <button onClick={outline} disabled={busy !== null || runningAll}>
            {busy === "outline" ? "Outlining…" : hasOutline ? "Re-outline" : "Outline"}
          </button>
        </div>
      </div>

      {error && <div className="err">{error}</div>}

      {chapters.length > 0 && (
        <div className="row between">
          <span className="note">
            {chapters.length - unwritten.length}/{chapters.length} written · ${spent.toFixed(3)}
          </span>
          {unwritten.length > 0 && !exported && (
            <button onClick={writeAll} disabled={runningAll || busy !== null}>
              {runningAll
                ? `Writing… (${chapters.length - unwritten.length}/${chapters.length})`
                : `Write all ${unwritten.length}`}
            </button>
          )}
        </div>
      )}

      {chapters.map((c) => {
        const isOpen = open === c.id;
        const isEditing = editing === c.id;
        return (
          <div key={c.id} className="card">
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow">
                  Chapter {c.n}
                  {c.body ? ` · ${c.body.split(/\s+/).length} words` : ""}
                </div>
                <h3 style={{ fontSize: 14 }}>{c.title ?? `Chapter ${c.n}`}</h3>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {c.body ? (
                  <button
                    className="ghost"
                    onClick={() => { setOpen(isOpen ? null : c.id); setEditing(null); }}
                  >
                    {isOpen ? "Hide" : "Read"}
                  </button>
                ) : (
                  <span className="rail-label">not written</span>
                )}
                {!exported && c.body && (
                  <button
                    className="ghost"
                    onClick={() => {
                      if (isEditing) return setEditing(null);
                      setDraft(c.body ?? "");
                      setEditing(c.id);
                      setOpen(c.id);
                    }}
                  >
                    {isEditing ? "Cancel" : "Edit"}
                  </button>
                )}
                {!exported && (
                  <button
                    className="ghost"
                    onClick={() => write(c.id)}
                    disabled={busy !== null || runningAll}
                  >
                    {busy === c.id ? "…" : c.body ? "Rewrite" : "Write"}
                  </button>
                )}
              </div>
            </div>

            {c.summary && <p className="note" style={{ marginTop: 6 }}>{c.summary}</p>}

            {isOpen && isEditing && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ minHeight: 400, fontSize: 14, lineHeight: 1.6 }}
                />
                <div className="row between">
                  <span className="note">Plain prose. Blank line between paragraphs.</span>
                  <button onClick={() => save(c.id)} disabled={busy !== null}>
                    {busy === c.id ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}

            {isOpen && !isEditing && c.body && (
              <>
                <div
                  style={{
                    marginTop: 12,
                    whiteSpace: "pre-wrap",
                    fontSize: 15,
                    lineHeight: 1.65,
                  }}
                >
                  {c.body}
                </div>
                {!exported && (
                  <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                    <textarea
                      placeholder="Rewrite with a note — what is wrong with this pass?"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      style={{ minHeight: 60 }}
                    />
                    <div className="row between">
                      <span className="note">The note applies to this chapter only.</span>
                      <button
                        className="ghost"
                        onClick={() => write(c.id, note)}
                        disabled={busy !== null || runningAll || !note.trim()}
                      >
                        Rewrite with note
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
