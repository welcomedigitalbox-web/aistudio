"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Line {
  id: string;
  n: number;
  speaker: string;
  line: string;
  on_screen: boolean;
  seconds: number | null;
  storage_key: string | null;
  voice_state: string;
  error: string | null;
  cost_usd: number;
}

interface Shot {
  id: string;
  n: number;
  scene_n: number | null;
  target_seconds: number;
  shot_lines: Line[];
}

interface Character {
  id: string;
  name: string;
  voice_id: string | null;
  voice_label: string | null;
}

interface Music {
  id: string;
  prompt: string;
  storage_key: string | null;
  state: string;
  error: string | null;
}

const VOICE_MODELS = [
  { id: "turbo", label: "Speech 2.6 Turbo — ~$0.012" },
  { id: "hd", label: "Speech 2.8 HD — ~$0.021" },
  { id: "gpt_mini", label: "GPT-4o mini TTS — ~$0.013" },
];

const STOCK_VOICES = [
  { id: "", label: "unassigned" },
  { id: "male-qn-qingse", label: "Young man — light" },
  { id: "male-qn-jingying", label: "Man — steady" },
  { id: "male-qn-badao", label: "Man — hard" },
  { id: "audiobook_male_1", label: "Man — narrator" },
  { id: "female-shaonv", label: "Young woman — light" },
  { id: "female-yujie", label: "Woman — warm" },
  { id: "female-chengshu", label: "Woman — older" },
  { id: "audiobook_female_1", label: "Woman — narrator" },
];

export function Audio({
  episodeId,
  shots,
  characters,
  music,
}: {
  episodeId: string;
  shots: Shot[];
  characters: Character[];
  music: Music[];
}) {
  const router = useRouter();
  const [model, setModel] = useState("turbo");
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [musicPrompt, setMusicPrompt] = useState("");

  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "";

  const lines = shots.flatMap((s) =>
    (s.shot_lines ?? []).map((l) => ({ ...l, shot: s }))
  );
  const pending = lines.filter((l) => !l.storage_key);
  const spent = lines.reduce((t, l) => t + Number(l.cost_usd), 0);
  const runtime = lines.reduce((t, l) => t + Number(l.seconds ?? 0), 0);

  const unassigned = characters.filter(
    (c) => !c.voice_id && lines.some((l) => l.speaker.toLowerCase() === c.name.toLowerCase())
  );

  const latestMusic = music[0];

  async function call(payload: Record<string, unknown>, keyName: string) {
    setBusy(keyName);
    setError("");
    const res = await fetch("/api/studio/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(json.error ?? "That did not run.");
      return null;
    }
    return json;
  }

  /** One at a time: the gateway queues, and a burst earns rate limits. */
  async function speakAll() {
    setRunning(true);
    setError("");
    for (const [i, line] of pending.entries()) {
      setProgress(`${i + 1} of ${pending.length}`);
      const ok = await call({ action: "speak", lineId: line.id, model }, line.id);
      if (!ok) break;
    }
    // Once the lines have lengths, the shots that carry them may be too short.
    await call({ action: "fit", episodeId }, "fit");
    setRunning(false);
    setProgress("");
    router.refresh();
  }

  const noDialogue = lines.length === 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div className="row between">
          <div>
            <span className="eyebrow" style={{ margin: 0 }}>Voice</span>
            <div className="note mono" style={{ marginTop: 4 }}>
              {lines.length - pending.length}/{lines.length} lines ·{" "}
              {Math.round(runtime)}s spoken
            </div>
          </div>
          <span className="cost">${spent.toFixed(3)}</span>
        </div>
      </div>

      {error && <div className="err">{error}</div>}
      {running && <div className="note">Recording {progress}…</div>}

      {unassigned.length > 0 && (
        <div className="card" style={{ borderColor: "var(--amber)" }}>
          <strong>{unassigned.length} speaking characters have no voice.</strong>
          <div className="note" style={{ marginTop: 4 }}>
            They will read in the narrator voice until you assign one. A voice
            belongs to the character, so it carries across every episode.
          </div>
        </div>
      )}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>Casting</strong>
        <div className="note">
          For Burmese, clone a voice from a recording and paste its id here —
          none of the stock voices speak it.
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {characters
            .filter((c) => lines.some((l) => l.speaker.toLowerCase() === c.name.toLowerCase()))
            .map((c) => (
              <div key={c.id} className="row between" style={{ gap: 10 }}>
                <span style={{ minWidth: 120 }}>{c.name}</span>
                <select
                  value={c.voice_id ?? ""}
                  onChange={(e) => {
                    const v = STOCK_VOICES.find((x) => x.id === e.target.value);
                    call(
                      {
                        action: "assign-voice",
                        refId: c.id,
                        voiceId: e.target.value,
                        voiceLabel: v?.label ?? null,
                      },
                      c.id
                    ).then(() => router.refresh());
                  }}
                  disabled={busy !== null || running}
                  style={{ flex: 1, maxWidth: 280 }}
                >
                  {STOCK_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
            ))}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div className="note">
          Voice comes before the clips: a spoken line has a length, and the clip
          has to fit it. Recording afterwards means paying for clips twice.
        </div>
        <div className="row between" style={{ gap: 10 }}>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ maxWidth: 280 }}
          >
            {VOICE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button onClick={speakAll} disabled={running || busy !== null || pending.length === 0}>
            {pending.length === 0 ? "All recorded" : `Record ${pending.length}`}
          </button>
        </div>
      </div>

      {shots
        .filter((s) => (s.shot_lines ?? []).length > 0)
        .map((shot) => (
          <div key={shot.id} className="card" style={{ display: "grid", gap: 8 }}>
            <div className="row between">
              <span className="mono" style={{ fontSize: 12 }}>
                Scene {shot.scene_n} · shot {shot.n} · {shot.target_seconds}s
              </span>
            </div>

            {shot.shot_lines.map((l) => {
              const url = l.storage_key ? base + "/" + l.storage_key : null;
              return (
                <div key={l.id} style={{ display: "grid", gap: 6 }}>
                  <div className="row between" style={{ gap: 10 }}>
                    <div style={{ minWidth: 0, fontSize: 13 }}>
                      <span className="mono" style={{ fontSize: 12 }}>{l.speaker}</span>{" "}
                      {l.line}
                    </div>
                    <div className="row" style={{ gap: 6, whiteSpace: "nowrap" }}>
                      {l.seconds && (
                        <span className="rail-label">{l.seconds}s</span>
                      )}
                      <button
                        className="ghost"
                        onClick={() =>
                          call({ action: "speak", lineId: l.id, model }, l.id).then(() =>
                            router.refresh()
                          )
                        }
                        disabled={busy !== null || running}
                        style={{ fontSize: 11, padding: "2px 8px" }}
                      >
                        {busy === l.id ? "…" : url ? "redo" : "record"}
                      </button>
                    </div>
                  </div>

                  {url && <audio src={url} controls style={{ width: "100%", height: 32 }} />}
                  {l.voice_state === "failed" && (
                    <div className="err" style={{ fontSize: 11 }}>{l.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div>
          <strong>Music</strong>
          <div className="note" style={{ marginTop: 4 }}>
            One cue for the episode. Not per scene — a different mood every eight
            seconds is how an edit stops feeling like a film.
          </div>
        </div>

        {latestMusic?.storage_key ? (
          <audio
            src={base + "/" + latestMusic.storage_key}
            controls
            style={{ width: "100%" }}
          />
        ) : latestMusic?.state === "running" ? (
          <div className="row between">
            <span className="note">Composing — a minute or two.</span>
            <button
              className="ghost"
              onClick={() =>
                call({ action: "poll-music", musicId: latestMusic.id }, "poll").then(() =>
                  router.refresh()
                )
              }
              disabled={busy !== null}
            >
              Check
            </button>
          </div>
        ) : null}

        <textarea
          placeholder="Sparse solo piano, slow, unresolved. No drums. Sad but restrained."
          value={musicPrompt}
          onChange={(e) => setMusicPrompt(e.target.value)}
          style={{ minHeight: 60 }}
        />

        <div className="row between">
          <span className="note">Roughly $0.02.</span>
          <button
            onClick={() =>
              call({ action: "music", episodeId, prompt: musicPrompt }, "music").then(() => {
                setMusicPrompt("");
                router.refresh();
              })
            }
            disabled={busy !== null || !musicPrompt.trim()}
          >
            {busy === "music" ? "Composing…" : "Compose"}
          </button>
        </div>

        {latestMusic?.error && <div className="err">{latestMusic.error}</div>}
      </div>
    </div>
  );
}
