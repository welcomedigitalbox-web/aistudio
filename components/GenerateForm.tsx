"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MODELS = {
  script: [{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" }],
  image: [
    { id: "fal-ai/flux/schnell", label: "Flux Schnell — fast, cheap" },
    { id: "fal-ai/flux/dev", label: "Flux Dev — higher quality" },
  ],
  video: [
    { id: "fal-ai/kling-video/v1/standard/text-to-video", label: "Kling v1 Standard" },
    { id: "fal-ai/minimax/video-01", label: "MiniMax Video-01" },
  ],
} as const;

type Kind = keyof typeof MODELS;

export function GenerateForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("script");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(MODELS.script[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pickKind(k: Kind) {
    setKind(k);
    setModel(MODELS[k][0].id);
  }

  async function run() {
    setBusy(true);
    setError("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .insert({ project_id: projectId, kind, title: title || "Untitled", created_by: user?.id })
      .select("id")
      .single();

    if (assetError) {
      setError(assetError.message);
      setBusy(false);
      return;
    }

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: asset.id,
        model,
        prompt,
        params: kind === "video" ? { duration: 5, aspect_ratio: "9:16" } : {},
      }),
    });

    const json = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(json.error ?? "Generation could not start.");
      return;
    }
    router.push(`/assets/${asset.id}`);
  }

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <div className="row">
        {(Object.keys(MODELS) as Kind[]).map((k) => (
          <button key={k} className={kind === k ? "" : "ghost"} onClick={() => pickKind(k)}>
            {k}
          </button>
        ))}
      </div>

      <input placeholder="Asset title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <select value={model} onChange={(e) => setModel(e.target.value)}>
        {MODELS[kind].map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>

      <textarea
        placeholder={kind === "script" ? "What should the script cover?" : "Describe the shot."}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="row between">
        <span className="note">
          {kind === "video"
            ? "Video counts against the project quota. Renders take a few minutes."
            : "Runs immediately."}
        </span>
        <button onClick={run} disabled={busy || !prompt}>
          {busy ? "Starting…" : "Generate"}
        </button>
      </div>

      {error && <div className="err">{error}</div>}
    </div>
  );
}
