"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Element {
  type: "action" | "dialogue";
  character?: string;
  parenthetical?: string;
  text: string;
}

interface Scene {
  id: string;
  n: number;
  slug: string | null;
  job: string | null;
  opens_on: string | null;
  closes_on: string | null;
  characters: string[];
  conflict: string | null;
  est_seconds: number | null;
  script: { slug?: string; elements?: Element[] } | null;
  approved: boolean;
  cost_usd: number;
}

/**
 * One row per scene. Each can be written by the agent, edited by hand, or
 * rewritten with a note — and approved individually, so a good scene stays put
 * while a bad one goes back through.
 */
export function SceneList({ scenes, locked }: { scenes: Scene[]; locked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const unwritten = scenes.filter((s) => !s.script);
  const spent = scenes.reduce((t, s) => t + Number(s.cost_usd), 0);
  const approvedCount = scenes.filter((s) => s.approved).length;

  /** Screenplay text ↔ the stored element array. */
  function toText(script: Scene["script"]) {
    return (script?.elements ?? [])
      .map((el) =>
        el.type === "dialogue"
          ? `${el.character?.toUpperCase()}\n${el.parenthetical ? `(${el.parenthetical})\n` : ""}${el.text}`
          : el.text
      )
      .join("\n\n");
  }

  /**
   * Parse it back. A block whose first line is ALL CAPS is dialogue; anything
   * else is action. That is the one convention screenwriters already follow,
   * so the editor needs no syntax of its own.
   */
  function fromText(text: string): Element[] {
    return text
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const lines = block.split("\n");
        const head = lines[0].trim();
        const isName = head === head.toUpperCase() && /[A-Z]/.test(head) && lines.length > 1;

        if (!isName) return { type: "action" as const, text: block.replace(/\n/g, " ") };

        let rest = lines.slice(1);
        let parenthetical: string | undefined;
        if (rest[0]?.trim().startsWith("(")) {
          parenthetical = rest[0].trim().replace(/^\(|\)$/g, "");
          rest = rest.slice(1);
        }
        return {
          type: "dialogue" as const,
          character: head,
          parenthetical,
          text: rest.join(" ").trim(),
        };
      });
  }

  async function write(sceneId: string, withNote?: string) {
    setBusy(sceneId);
    setError("");
    const res = await fetch("/api/studio/scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "write", sceneId, note: withNote || undefined }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(json.error ?? "That scene did not write.");
      return false;
    }
    setNote("");
    router.refresh();
    return true;
  }

  /** Sequential, not parallel: each scene reads its neighbours. */
  async function writeAll() {
    setRunningAll(true);
    setError("");
    for (const scene of unwritten) {
      const ok = await write(scene.id);
      if (!ok) break;
    }
    setRunningAll(false);
  }

  async function save(scene: Scene) {
    setBusy(scene.id);
    setError("");
    const res = await fetch("/api/studio/scene-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sceneId: scene.id,
        script: { slug: scene.script?.slug ?? scene.slug, elements: fromText(draft) },
      }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) return setError(json.error ?? "Could not save.");
    setEditing(null);
    router.refresh();
  }

  async function setApproved(sceneId: string, approved: boolean) {
    setBusy(sceneId);
    setError("");
    const res = await fetch("/api/studio/scene-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneId, approved }),
    });
    setBusy(null);
    if (res.ok) router.refresh();
  }

  if (scenes.length === 0) {
    return <div className="empty">No scenes yet. Plan them above.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="row between">
        <span className="note">
          {scenes.length - unwritten.length}/{scenes.length} written ·{" "}
          {approvedCount}/{scenes.length} approved · ${spent.toFixed(4)}
        </span>
        {!locked && unwritten.length > 0 && (
          <button onClick={writeAll} disabled={runningAll || busy !== null}>
            {runningAll
              ? `Writing… (${scenes.length - unwritten.length}/${scenes.length})`
              : `Write all ${unwritten.length}`}
          </button>
        )}
      </div>

      {error && <div className="err">{error}</div>}

      {scenes.map((s) => {
        const isOpen = open === s.id;
        const isEditing = editing === s.id;

        return (
          <div
            key={s.id}
            className="card"
            style={s.approved ? { borderColor: "var(--pine)" } : undefined}
          >
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow">
                  Scene {s.n}
                  {s.est_seconds ? ` · ${s.est_seconds}s` : ""}
                  {s.approved ? " · approved" : ""}
                </div>
                <h3 style={{ fontSize: 14 }}>{s.script?.slug ?? s.slug ?? `Scene ${s.n}`}</h3>
              </div>

              <div className="row" style={{ gap: 8 }}>
                {s.script ? (
                  <button
                    className="ghost"
                    onClick={() => {
                      setOpen(isOpen ? null : s.id);
                      setEditing(null);
                    }}
                  >
                    {isOpen ? "Hide" : "Read"}
                  </button>
                ) : (
                  <span className="rail-label">not written</span>
                )}

                {!locked && s.script && (
                  <button
                    className="ghost"
                    onClick={() => {
                      if (isEditing) return setEditing(null);
                      setDraft(toText(s.script));
                      setEditing(s.id);
                      setOpen(s.id);
                    }}
                    disabled={busy !== null || runningAll}
                  >
                    {isEditing ? "Cancel" : "Edit"}
                  </button>
                )}

                {!locked && (
                  <button
                    className="ghost"
                    onClick={() => write(s.id)}
                    disabled={busy !== null || runningAll}
                  >
                    {busy === s.id ? "…" : s.script ? "Rewrite" : "Write"}
                  </button>
                )}

                {!locked && s.script && (
                  <button
                    className={s.approved ? "ghost" : ""}
                    onClick={() => setApproved(s.id, !s.approved)}
                    disabled={busy !== null || runningAll}
                  >
                    {s.approved ? "Reopen" : "Approve"}
                  </button>
                )}
              </div>
            </div>

            {s.job && <p className="note" style={{ marginTop: 6 }}>{s.job}</p>}
            {(s.opens_on || s.closes_on) && (
              <div className="note mono" style={{ marginTop: 4, fontSize: 12 }}>
                {s.opens_on} → {s.closes_on}
              </div>
            )}

            {isOpen && isEditing && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ minHeight: 320, fontFamily: "var(--font-mono)", fontSize: 13 }}
                />
                <div className="row between">
                  <span className="note">
                    A block starting with a NAME in capitals is dialogue; everything else is
                    action. Blank line between blocks.
                  </span>
                  <button onClick={() => save(s)} disabled={busy !== null}>
                    {busy === s.id ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}

            {isOpen && !isEditing && s.script && (
              <>
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {(s.script.elements ?? []).map((el, i) =>
                    el.type === "dialogue" ? (
                      <div key={i} style={{ paddingLeft: 40 }}>
                        <div className="mono" style={{ fontSize: 12 }}>{el.character}</div>
                        {el.parenthetical && (
                          <div className="note" style={{ fontSize: 12 }}>({el.parenthetical})</div>
                        )}
                        <div>{el.text}</div>
                      </div>
                    ) : (
                      <div key={i}>{el.text}</div>
                    )
                  )}
                </div>

                {!locked && (
                  <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                    <textarea
                      placeholder="Rewrite with a note — what is wrong with this pass?"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      style={{ minHeight: 60 }}
                    />
                    <div className="row between">
                      <span className="note">The note applies to this scene only.</span>
                      <button
                        className="ghost"
                        onClick={() => write(s.id, note)}
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
