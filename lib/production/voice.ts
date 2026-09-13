import * as fal from "@fal-ai/serverless-client";
import { createServiceClient } from "@/lib/supabase/server";
import { putFromUrl } from "@/lib/storage/r2";

fal.config({ credentials: process.env.FAL_KEY! });

/**
 * Voice, through fal.
 *
 * The gateway routed each provider differently and none of it was documented.
 * fal serves ElevenLabs and MiniMax behind the same submit-and-result shape
 * the video models already use, and — the reason that matters here — it
 * serves voice cloning, which is the only way to get Burmese.
 *
 * A voice belongs to a character, not to a line: the same actor reads every
 * line that character speaks, in every episode.
 */

export const VOICE_MODELS = {
  eleven: {
    label: "ElevenLabs v3 — 70+ languages, expressive",
    id: "fal-ai/elevenlabs/tts/eleven-v3",
    usdPer1k: 0.1,
    /** Whether the endpoint takes a cloned voice id. */
    cloned: false,
  },
  eleven_multi: {
    label: "ElevenLabs Multilingual v2 — stable narration",
    id: "fal-ai/elevenlabs/tts/multilingual-v2",
    usdPer1k: 0.1,
    cloned: false,
  },
  minimax_hd: {
    label: "MiniMax Speech 2.8 HD — 30+ languages",
    id: "fal-ai/minimax/speech-2.8-hd",
    usdPer1k: 0.1,
    cloned: false,
  },
  /**
   * The cloned path. Point a character's voice_id at a clone made from a real
   * recording and read every line in that voice — which is how Burmese gets
   * done, since no stock voice speaks it well.
   */
  minimax_clone: {
    label: "MiniMax cloned voice",
    id: "fal-ai/minimax/speech-2.8-hd",
    usdPer1k: 0.1,
    cloned: true,
  },
} as const;

export type VoiceModel = keyof typeof VOICE_MODELS;

/** Stock voices. None speak Burmese — clone for that. */
export const STOCK_VOICES = [
  { id: "", label: "unassigned" },
  { id: "Rachel", label: "Woman — warm (Eleven)" },
  { id: "Adam", label: "Man — steady (Eleven)" },
  { id: "Antoni", label: "Man — light (Eleven)" },
  { id: "Bella", label: "Young woman (Eleven)" },
  { id: "male-qn-jingying", label: "Man — steady (MiniMax)" },
  { id: "female-yujie", label: "Woman — warm (MiniMax)" },
  { id: "audiobook_male_1", label: "Man — narrator (MiniMax)" },
  { id: "audiobook_female_1", label: "Woman — narrator (MiniMax)" },
];

/**
 * Clone a voice from a recording.
 *
 * One minute of clean speech is enough. $1.50 once, then every line that
 * character ever speaks reads in it — across episodes, across seasons.
 */
export async function cloneVoice(audioUrl: string, refId: string) {
  const db = createServiceClient();

  const result: any = await fal.subscribe("fal-ai/minimax/voice-clone", {
    input: { audio_url: audioUrl },
  });

  const voiceId = result?.data?.custom_voice_id ?? result?.custom_voice_id;
  if (!voiceId) throw new Error("The clone returned no voice id.");

  await db
    .from("refs")
    .update({ voice_id: voiceId, voice_label: "cloned" })
    .eq("id", refId);

  return { voiceId, costUsd: 1.5 };
}

/**
 * Read one line.
 *
 * Speech is fast enough to wait for, unlike video — no polling, no background
 * function.
 */
export async function speakLine(lineId: string, model: VoiceModel, userId: string) {
  const db = createServiceClient();
  const spec = VOICE_MODELS[model];

  const { data: line } = await db
    .from("shot_lines")
    .select("*, shots(id, episode_id)")
    .eq("id", lineId)
    .single();

  if (!line) throw new Error("Line not found.");
  if (!line.line?.trim()) throw new Error("This line has no text.");

  const shot = line.shots as any;
  const { data: episode } = await db
    .from("episodes").select("series_id").eq("id", shot.episode_id).single();

  // The character's assigned voice, matched by the speaker's name. Unassigned
  // falls back to a narrator rather than failing — a placeholder read is more
  // useful than silence while casting is still open.
  const { data: ref } = await db
    .from("refs")
    .select("voice_id")
    .eq("series_id", episode!.series_id)
    .eq("kind", "character")
    .ilike("name", line.speaker)
    .maybeSingle();

  await db
    .from("shot_lines")
    .update({ voice_state: "running", voice_model: spec.id, error: null })
    .eq("id", lineId);

  try {
    const input: Record<string, unknown> = { text: line.line };

    if (spec.cloned) {
      if (!ref?.voice_id) {
        throw new Error(
          "This character has no cloned voice. Clone one, or pick a stock model."
        );
      }
      input.voice_setting = { custom_voice_id: ref.voice_id };
    } else {
      input.voice = ref?.voice_id || "audiobook_male_1";
    }

    const result: any = await fal.subscribe(spec.id, { input });

    const url =
      result?.data?.audio?.url ?? result?.audio?.url ?? result?.data?.audio_url;
    if (!url) throw new Error("No audio in the response.");

    const key = `voice/${shot.episode_id}/${lineId}.mp3`;
    await putFromUrl(key, url, "audio/mpeg");

    // Length matters: the clip has to be at least as long as the line.
    // Rather than decode the file, estimate from the text at roughly fifteen
    // characters a second. Wrong by a beat is fine — shot length rounds to
    // five or ten seconds anyway.
    const seconds = Math.max(2, Math.round(line.line.length / 15));
    const cost = (line.line.length / 1000) * spec.usdPer1k;

    await db
      .from("shot_lines")
      .update({
        storage_key: key,
        seconds,
        voice_state: "ready",
        error: null,
        cost_usd: Number(line.cost_usd) + cost,
        created_by: line.created_by ?? userId,
      })
      .eq("id", lineId);

    return { lineId, seconds, costUsd: Number(cost.toFixed(4)) };
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
 * A seven-second line under a five-second clip is a cut-off word.
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
