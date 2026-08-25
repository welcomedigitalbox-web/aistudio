"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const BASIS = [
  { id: "own", label: "We wrote it" },
  { id: "licensed", label: "Rights from the author" },
  { id: "public_domain", label: "Public domain" },
] as const;

export function SourceUpload({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [basis, setBasis] = useState<string>("own");
  const [basisNote, setBasisNote] = useState("");
  const [stage, setStage] = useState<"idle" | "uploading" | "extracting">("idle");
  const [error, setError] = useState("");

  async function submit() {
    if (!file) return;
    setError("");
    setStage("uploading");

    const form = new FormData();
    form.set("file", file);
    form.set("seriesId", seriesId);
    form.set("title", title);
    form.set("author", author);
    form.set("basis", basis);
    form.set("basisNote", basisNote);

    const up = await fetch("/api/sources/upload", { method: "POST", body: form });
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
    router.refresh();
  }

  const busy = stage !== "idle";

  return (
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
        {BASIS.map((b) => (
          <option key={b.id} value={b.id}>{b.label}</option>
        ))}
      </select>

      <input
        placeholder="Rights note — optional"
        value={basisNote}
        onChange={(e) => setBasisNote(e.target.value)}
      />

      <div className="row between">
        <span className="note">
          {stage === "uploading" && "Uploading…"}
          {stage === "extracting" && "Reading the PDF — a long book takes a minute."}
          {stage === "idle" && "Text-layer PDFs only. Scans need OCR first."}
        </span>
        <button onClick={submit} disabled={busy || !file || !title}>
          {busy ? "Working…" : "Add"}
        </button>
      </div>

      {error && <div className="err">{error}</div>}
    </div>
  );
}
