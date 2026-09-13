import * as fal from "@fal-ai/serverless-client";
import { createServiceClient } from "@/lib/supabase/server";
import { putFromUrl } from "@/lib/storage/r2";

fal.config({ credentials: process.env.FAL_KEY! });

/**
 * One music cue per episode.
 *
 * Not per scene and never per shot: a different mood every eight seconds is
 * how an edit stops feeling like a film. One cue under three minutes is what
 * a composer would actually deliver.
 */
export async function requestMusic(episodeId: string, prompt: string, userId: string) {
  const db = createServiceClient();

  const { data: row, error } = await db
    .from("episode_music")
    .insert({ episode_id: episodeId, prompt, state: "running", created_by: userId })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  try {
    const result: any = await fal.subscribe("CassetteAI/music-generator", {
      input: { prompt, duration: 180 },
    });

    const url = result?.data?.audio_file?.url ?? result?.audio_file?.url ?? result?.data?.audio?.url;
    if (!url) throw new Error("No audio in the response.");

    const key = `music/${episodeId}/${row.id}.mp3`;
    await putFromUrl(key, url, "audio/mpeg");

    await db
      .from("episode_music")
      .update({ storage_key: key, state: "ready", error: null, seconds: 180, cost_usd: 0.05 })
      .eq("id", row.id);

    return { musicId: row.id, costUsd: 0.05 };
  } catch (e) {
    await db
      .from("episode_music")
      .update({ state: "failed", error: (e as Error).message })
      .eq("id", row.id);
    throw e;
  }
}
