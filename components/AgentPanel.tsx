"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const AGENTS = [
  { id: "research", label: "Research", blurb: "Period, place, and domain detail." },
  { id: "character", label: "Characters", blurb: "Want, need, flaw, voice, arc." },
  { id: "scene_plan", label: "Scene plan", blurb: "Beats broken into scenes." },
  { id: "script", label: "Script", blurb: "Dialogue and action." },
] as const;

interface Doc { id: string; agent: string; title: string }
interface Source { id: string; title: string; state: string }

export function AgentPanel({
  projectId,
  docs,
  sources,
}: {
  projectId: string;
  docs: Doc[];
  sources: Source[];
}) {
  const router = useRouter();
  const [agent, setAgent] = useState<string>("research");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [parentIds, setParentIds] = useState<string[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(list: string[], set: (v: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function run() {
    setBusy(true);
    setError("");

    const res = await fetch("/api/agents/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, agent, title, brief, parentIds, sourceIds }),
    });
    const json = await res.json();
    setBusy(false);

    if (!res.ok) return setError(json.error ?? "The agent could not run.");
    setBrief("");
    setTitle("");
    router.refresh();
  }

  const readySources = sources.filter((s) => s.state === "ready");

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {AGENTS.map((a) => (
          <button key={a.id} className={agent === a.id ? "" : "ghost"} onClick={() => setAgent(a.id)}>
            {a.label}
          </button>
        ))}
      </div>

      <p className="note" style={{ margin: 0 }}>
        {AGENTS.find((a) => a.id === agent)?.blurb}
      </p>

      <input placeholder="Document title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <textarea
        placeholder="What are you after? Describe the story, the problem, or what you want this pass to solve."
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        style={{ minHeight: 120 }}
      />

      {docs.length > 0 && (
        <div>
          <span className="eyebrow">Feed in earlier work</span>
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {docs.map((d) => (
              <button
                key={d.id}
                className={parentIds.includes(d.id) ? "" : "ghost"}
                onClick={() => toggle(parentIds, setParentIds, d.id)}
                style={{ fontSize: 13, padding: "4px 10px" }}
              >
                {d.agent} · {d.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {readySources.length > 0 && (
        <div>
          <span className="eyebrow">Sources</span>
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {readySources.map((s) => (
              <button
                key={s.id}
                className={sourceIds.includes(s.id) ? "" : "ghost"}
                onClick={() => toggle(sourceIds, setSourceIds, s.id)}
                style={{ fontSize: 13, padding: "4px 10px" }}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="row between">
        <span className="note">Runs immediately. Longer passes cost a few cents.</span>
        <button onClick={run} disabled={busy || !brief}>
          {busy ? "Thinking…" : "Run"}
        </button>
      </div>

      {error && <div className="err">{error}</div>}
    </div>
  );
}
