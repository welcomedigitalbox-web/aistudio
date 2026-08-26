import * as fal from "@fal-ai/serverless-client";
import { createServiceClient } from "@/lib/supabase/server";
import { clipEndpoint, type ClipModel } from "./models";

fal.config({ credentials: process.env.FAL_KEY! });

/**
 * Turn a shot's keyframe into a clip.
 *
 * Image-to-video, never text-to-video: the keyframe is what holds the
 * character's face and the scene's light steady from one shot to the next.
 * A text-to-video call would invent both afresh every time.
 */
export async function generateClip(shotId: string, model: ClipModel, userId: string) {
  const db = createServiceClient();

  const { data: shot } = await db.from("shots").select("*").eq("id", shotId).single();
  if (!shot) throw new Error("Shot not found.");
  if (!shot.keyframe_storage_key) throw new Error("Generate the keyframe first.");
  if (!shot.keyframe_approved) {
    throw new Error("Approve the keyframe first — a clip from a bad still is a wasted clip.");
  }

  const base = process.env.R2_PUBLIC_BASE_URL ?? "";

  /**
   * Chaining: start from the previous shot's last frame instead of this
   * shot's own keyframe. Only within a scene — across a cut the jump is the
   * point — and only if that frame exists.
   */
  let startFrame = `${base}/${shot.keyframe_storage_key}`;

  if (shot.chain_from_shot_id) {
    const { data: prev } = await db
      .from("shots")
      .select("last_frame_storage_key, scene_id")
      .eq("id", shot.chain_from_shot_id)
      .single();

    if (prev?.last_frame_storage_key && prev.scene_id === shot.scene_id) {
      startFrame = `${base}/${prev.last_frame_storage_key}`;
    }
  }

  const { endpoint, duration, usd } = clipEndpoint(model, Number(shot.target_seconds));

  await db
    .from("shots")
    .update({
      clip_state: "running",
      clip_model: endpoint,
      clip_error: null,
      created_by: shot.created_by ?? userId,
    })
    .eq("id", shotId);

  try {
    const { request_id } = await fal.queue.submit(endpoint, {
      input: {
        prompt: shot.motion || shot.visual,
        image_url: startFrame,
        duration: String(duration),
        negative_prompt: "text, watermark, subtitles, distorted face, extra limbs",
      },
      webhookUrl: `${process.env.APP_URL}/api/webhooks/fal-shot?shot=${shotId}&kind=clip`,
    });

    await db
      .from("shots")
      .update({
        clip_job_id: request_id,
        clip_seconds: duration,
        cost_usd: Number(shot.cost_usd) + usd,
      })
      .eq("id", shotId);

    return { shotId, seconds: duration, estimatedCostUsd: usd, chained: startFrame !== `${base}/${shot.keyframe_storage_key}` };
  } catch (e) {
    await db
      .from("shots")
      .update({ clip_state: "failed", clip_error: (e as Error).message })
      .eq("id", shotId);
    throw e;
  }
}

/**
 * Link every shot in a scene to the one before it, so clips generate from the
 * running last frame rather than each starting cold.
 */
export async function chainScene(sceneId: string, on: boolean) {
  const db = createServiceClient();

  const { data: shots } = await db
    .from("shots")
    .select("id, n")
    .eq("scene_id", sceneId)
    .order("n");

  const list = shots ?? [];
  for (let i = 0; i < list.length; i++) {
    await db
      .from("shots")
      .update({ chain_from_shot_id: on && i > 0 ? list[i - 1].id : null })
      .eq("id", list[i].id);
  }

  return { shots: list.length };
}
