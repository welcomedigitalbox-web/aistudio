import { createServiceClient } from "@/lib/supabase/server";
import { putFromUrl } from "@/lib/storage/r2";

const BASE = "https://api.openlux.ai";

/**
 * One music cue per episode.
 *
 * Not per scene and never per shot: a different mood every eight seconds is
 * how an edit stops feeling like a film. One cue, laid under the whole
 * episode, is what a composer would actually deliver for three minutes.
 */
export async function requestMusic(episodeId: string, prompt: string, userId: string) {
  const k = process.env.OPENLUX_API_KEY;
  if (!k) throw new Error("OPENLUX_API_KEY is not set.");

  const db = createServiceClient();

  const { data: row, error } = await db
    .from("episode_music")
    .insert({ episode_id: episodeId, prompt, state: "running", created_by: userId })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  try {
    const res = await fetch(`${BASE}/suno/submit/music`, {
      method: "POST",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        gpt_description_prompt: prompt,
        make_instrumental: true,
        mv: "chirp-v3-5",
      }),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Music failed (${res.status}): ${text.slice(0, 200)}`);

    const json = JSON.parse(text);
    const taskId = json?.data ?? json?.data?.task_id ?? json?.id;
    if (!taskId) throw new Error(`No task id: ${text.slice(0, 200)}`);

    await db
      .from("episode_music")
      .update({ job_id: String(taskId), cost_usd: 0.0176 })
      .eq("id", row.id);

    return { musicId: row.id, taskId: String(taskId) };
  } catch (e) {
    await db
      .from("episode_music")
      .update({ state: "failed", error: (e as Error).message })
      .eq("id", row.id);
    throw e;
  }
}

/** Ask once whether a music job is done, and store it if so. */
export async function pollMusic(musicId: string) {
  const k = process.env.OPENLUX_API_KEY;
  if (!k) throw new Error("OPENLUX_API_KEY is not set.");

  const db = createServiceClient();
  const { data: row } = await db
    .from("episode_music").select("*").eq("id", musicId).single();

  if (!row?.job_id) return { state: "failed", error: "No job id." };

  const res = await fetch(
    `${BASE}/suno/fetch/${encodeURIComponent(row.job_id)}`,
    { headers: { Authorization: `Bearer ${k}` } }
  );

  const text = await res.text();
  if (!res.ok) return { state: "pending" as const };

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { state: "pending" as const };
  }

  const item = Array.isArray(json?.data) ? json.data[0] : json?.data;
  const url = item?.audio_url ?? item?.data?.[0]?.audio_url;

  if (!url) return { state: "pending" as const };

  const key = `music/${row.episode_id}/${musicId}.mp3`;
  await putFromUrl(key, url, "audio/mpeg");

  await db
    .from("episode_music")
    .update({ storage_key: key, state: "ready", error: null })
    .eq("id", musicId);

  return { state: "ready" as const, key };
}
