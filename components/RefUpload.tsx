"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const ANGLES = [
  { id: "front", label: "Front" },
  { id: "three_quarter", label: "Three-quarter" },
  { id: "profile", label: "Profile" },
  { id: "full_body", label: "Full body" },
  { id: "expression", label: "Expression" },
  { id: "uploaded", label: "Other" },
];

/**
 * Upload art for a reference instead of generating it.
 *
 * For a character who already exists — a real design, a photo, a render
 * someone liked — this beats regenerating: the same pixels go into every
 * prompt, so nothing drifts.
 */
export function RefUpload({ refId }: { refId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [angle, setAngle] = useState("front");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");

    try {
      const signRes = await fetch("/api/refs/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refId, contentType: file.type }),
      });
      const sign = await signRes.json();
      if (!signRes.ok) throw new Error(sign.error ?? "Could not prepare the upload.");

      // Straight to storage. A function body caps far below an image.
      const put = await fetch(sign.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Storage rejected the file (${put.status}).`);

      const reg = await fetch("/api/refs/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refId,
          storageKey: sign.key,
          angle,
          label: file.name.replace(/\.[^.]+$/, ""),
        }),
      });
      const json = await reg.json();
      if (!reg.ok) throw new Error(json.error ?? "Could not save the image.");

      setOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        className="ghost"
        onClick={() => setOpen(true)}
        style={{ fontSize: 12, padding: "3px 10px" }}
      >
        Upload art
      </button>
    );
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10, marginTop: 10 }}>
      <div>
        <span className="eyebrow">Angle</span>
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {ANGLES.map((a) => (
            <button
              key={a.id}
              className={angle === a.id ? "" : "ghost"}
              onClick={() => setAngle(a.id)}
              style={{ fontSize: 12, padding: "3px 10px" }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />

      <div className="row between">
        <span className="note">
          {busy
            ? "Uploading…"
            : "PNG, JPEG or WebP. The first one uploaded becomes the chosen art."}
        </span>
        <button className="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>

      {error && <div className="err">{error}</div>}
    </div>
  );
}
