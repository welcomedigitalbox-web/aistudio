"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = [
  { id: "spine", label: "Spine", blurb: "The backbone: central want, shape, ending. Pick one." },
  { id: "character", label: "Characters", blurb: "People come from here. Not the plot." },
  { id: "setting", label: "Setting", blurb: "Place, period, texture. Not the plot." },
  { id: "voice", label: "Voice", blurb: "Style only — no events, no people, no places." },
  { id: "free", label: "General", blurb: "No constraint. Use as the writer judges." },
] as const;

interface LabSource {
  source_id: string;
  role: string;
  note: string | null;
  sources: { title: string; author: string | null; state: string };
}

export function LabSources({
  labId,
  sources,
  spines,
}: {
  labId: string;
  sources: LabSource[];
  spines: number;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [basis, setBasis] = useState("own");
  const [role, setRole] = useState("free");
  const [stage, setStage] = useState<"idle" | "uploading" | "extracting">("idle");
  const [error, setError] = useState("");

  async function add() {
    if (!file) return;
    setError("");
    setStage("uploading");

    const form = new FormData();
    form.set("file", file);
    form.set("labId", labId);
    form.set("title", title);
    form.set("author", author);
    form.set("basis", basis);
    form.set("role", role);

    const up = await fetch("/api/lab/upload", { method: "POST", body: form });
    const upJson = await up.json();
    if (!up.ok) {
      setStage("idle");
      return setError(upJson.error ?? "Upload failed.");
    }

    setStage("extracting");
    const proc = await fetch("/api/sources/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: upJson.sourceId }),
    });
    const procJson = await proc.json();
    setStage("idle");
    if (!proc.ok) return setError(procJson.error ?? "Extraction failed.");

    setFile(null);
    setTitle("");
    setAuthor("");
    router.refresh();
  }

  async function setRoleFor(sourceId: string, newRole: string) {
    await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-source", labId, sourceId, role: newRole }),
    });
    router.refresh();
  }

  async function remove(sourceId: string) {
    await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove-source", labId, sourceId }),
    });
    router.refresh();
  }

  const busy = stage !== "idle";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {spines > 1 && (
        <div className="card" style={{ borderColor: "var(--amber)" }}>
          <strong>{spines} sources are marked as the spine.</strong>
          <div className="note" style={{ marginTop: 4 }}>
            Two backbones pull the story in two directions. Pick one and give the other a
            different role.
          </div>
        </div>
      )}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f && !title) setTitle(f.name.replace(/\.pdf$/i, ""));
          }}
        />
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="Author (optional)" value={author} onChange={(e) => setAuthor(e.target.value)} />

        <select value={basis} onChange={(e) => setBasis(e.target.value)}>
          <option value="own">We wrote it</option>
          <option value="licensed">Rights from the author</option>
          <option value="public_domain">Public domain</option>
        </select>

        <div>
          <span className="eyebrow">Role in this book</span>
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {ROLES.map((r) => (
              <button
                key={r.id}
                className={role === r.id ? "" : "ghost"}
                onClick={() => setRole(r.id)}
                style={{ fontSize: 13, padding: "4px 10px" }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="note" style={{ marginTop: 6 }}>
            {ROLES.find((r) => r.id === role)?.blurb}
          </p>
        </div>

        <div className="row between">
          <span className="note">
            {stage === "uploading" && "Uploading…"}
            {stage === "extracting" && "Reading the PDF…"}
            {stage === "idle" && "Text-layer PDFs only."}
          </span>
          <button onClick={add} disabled={busy || !file || !title}>
            {busy ? "Working…" : "Add source"}
          </button>
        </div>

        {error && <div className="err">{error}</div>}
      </div>

      <div className="grid">
        {sources.map((s) => (
          <div key={s.source_id} className="card">
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: 14 }}>{s.sources.title}</h3>
                <div className="note">
                  {s.sources.author ? `${s.sources.author} · ` : ""}
                  {s.sources.state}
                </div>
              </div>
              <button className="ghost" onClick={() => remove(s.source_id)}>Remove</button>
            </div>

            <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  className={s.role === r.id ? "" : "ghost"}
                  onClick={() => setRoleFor(s.source_id, r.id)}
                  style={{ fontSize: 12, padding: "3px 8px" }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {sources.length === 0 && (
          <div className="empty">
            No sources yet. Add the books this story should come out of.
          </div>
        )}
      </div>
    </div>
  );
}
