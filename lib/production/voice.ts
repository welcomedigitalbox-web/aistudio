import { createServiceClient } from "@/lib/supabase/server";
import { putFromUrl } from "@/lib/storage/r2";

const BASE = "https://api.openlux.ai";

/**
 * Voice, through the same gateway as video.
 *
 * A voice belongs to a character, not to a line: the same actor reads every
 * line that character speaks, in every episode. That is the whole reason
 * `refs.voice_id` exists rather than a setting on each line.
 */

export const VOICE_MODELS = {
  turbo: {
    label: "MiniMax Speech 2.6 Turbo",
    model: "speech-2.6-turbo",
    usd: 0.012,
  },
  hd: {
    label: "MiniMax Speech 2.8 HD",
    model: "speech-2.8-hd",
    usd: 0.021,
  },
  gpt_mini: {
    label: "GPT-4o mini TTS",
    model: "gpt-4o-mini-tts",
    usd: 0.013,
  },
} as const;

export type VoiceModel = keyof typeof VOICE_MODELS;

/**
 * Stock voices, as a starting point.
 *
 * None of these speak Burmese. For Burmese the answer is a cloned voice —
 * record a minute of someone reading, clone it, and set the id on the
 * character. These are for English dialogue and for testing the pipeline
 * before anyone has recorded anything.
 */
export const STOCK_VOICES = [
  { id: "male-qn-qingse", label: "Young man — light" },
  { id: "male-qn-jingying", label: "Man — steady" },
  { id: "male-qn-badao", label: "Man — hard" },
  { id: "audiobook_male_1", label: "Man — narrator" },
  { id: "female-shaonv", label: "Young woman — light" },
  { id: "female-yujie", label: "Woman — warm" },
  { id: "female-chengshu", label: "Woman — older" },
  { id: "audiobook_female_1", label: "Woman — narrator" },
];

function key() {
  const k = process.env.OPENLUX_API_KEY;
  if (!k) throw new Error("OPENLUX_API_KEY is not set.");
  return k;
}

/**
 * Read one line.
 *
 * Speech is fast enough to be synchronous, unlike video — no polling, no
 * background function. It returns audio, its length, and what it cost.
 */
export async function speakLine(lineId: string, model: VoiceModel, userId: string) {
  const db = createServiceClient();
  const spec = VOICE_MODELS[model];

  const { data: line } = await db
    .from("shot_lines")
    .select("*, shots(id, episode_id, ref_ids)")
    .eq("id", lineId)
    .single();

  if (!line) throw new Error("Line not found.");
  if (!line.line?.trim()) throw new Error("This line has no text.");

  // The character's assigned voice, matched by the speaker's name. An
  // unassigned character falls back to a narrator rather than failing — a
  // placeholder read is more useful than silence while you decide.
  const shot = line.shots as any;
  const { data: episode } = await db
    .from("episodes").select("series_id").eq("id", shot.episode_id).single();

  const { data: ref } = await db
    .from("refs")
    .select("voice_id")
    .eq("series_id", episode!.series_id)
    .eq("kind", "character")
    .ilike("name", line.speaker)
    .maybeSingle();

  const voiceId = ref?.voice_id ?? "audiobook_male_1";

  await db
    .from("shot_lines")
    .update({ voice_state: "running", voice_model: spec.model, error: null })
    .eq("id", lineId);

  try {
    const res = await fetch(`${BASE}/v1/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: spec.model,
        input: line.line,
        voice: voiceId,
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Voice failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const type = res.headers.get("content-type") ?? "";

    // Some gateways return the audio itself, some return a URL to it.
    let stored: string;
    const storageKey = `voice/${shot.episode_id}/${lineId}.mp3`;

    if (type.includes("application/json")) {
      const json = await res.json();
      const url = json?.data?.audio ?? json?.audio_url ?? json?.url;
      if (!url) throw new Error("No audio in the response.");
      await putFromUrl(storageKey, url, "audio/mpeg");
      stored = storageKey;
    } else {
      const bytes = Buffer.from(await res.arrayBuffer());
      const { putBuffer } = await import("@/lib/storage/r2");
      await putBuffer(storageKey, bytes, "audio/mpeg");
      stored = storageKey;
    }

    // Length matters: the clip has to be at least as long as the line. Rather
    // than decode the file, estimate from the text — roughly fifteen
    // characters a second at a natural pace. Wrong by a beat is fine; the
    // shot length rounds to five or ten seconds anyway.
    const seconds = Math.max(2, Math.round(line.line.length / 15));

    await db
      .from("shot_lines")
      .update({
        storage_key: stored,
        seconds,
        voice_state: "ready",
        error: null,
        cost_usd: Number(line.cost_usd) + spec.usd,
        created_by: line.created_by ?? userId,
      })
      .eq("id", lineId);

    return { lineId, seconds, costUsd: spec.usd };
  } catch (e) {
    await db
      .from("shot_lines")
      .update({ voice_state: "failed", error: (e as Error).message })
      .eq("id", lineId);
    throw e;
  }
}

/**
 * Stretch a shot to fit the lines it carries.
 *
 * A seven-second line under a five-second clip is a cut-off word. Called
 * after a batch so the shot list reflects what the audio actually needs.
 */
export async function fitShotsToVoice(episodeId: string) {
  const db = createServiceClient();

  const { data: shots } = await db
    .from("shots")
    .select("id, target_seconds, shot_lines(seconds)")
    .eq("episode_id", episodeId);

  let changed = 0;

  for (const shot of shots ?? []) {
    const lines = (shot.shot_lines as any[]) ?? [];
    if (lines.length === 0) continue;

    const spoken = lines.reduce((t, l) => t + Number(l.seconds ?? 0), 0);
    // A beat of air at each end, or the line starts on the cut.
    const needed = Math.ceil(spoken + 1);

    if (needed > Number(shot.target_seconds)) {
      await db
        .from("shots")
        .update({ target_seconds: Math.min(needed, 10) })
        .eq("id", shot.id);
      changed++;
    }
  }

  return { changed };
}
