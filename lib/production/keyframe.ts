import * as fal from "@fal-ai/serverless-client";
import { createServiceClient } from "@/lib/supabase/server";
import { styleFragment } from "@/lib/stages";
import { KEYFRAME_MODELS, type KeyframeModel } from "./models";

fal.config({ credentials: process.env.FAL_KEY! });

/**
 * Generate the still for one shot.
 *
 * The prompt is assembled the same way reference art is: style first, then the
 * subjects verbatim from their reference descriptions, then the shot's own
 * composition. Characters keep the exact wording that produced their reference
 * sheet, because rewording it is what makes a face drift.
 */
export async function generateKeyframe(
  shotId: string,
  model: KeyframeModel,
  userId: string
) {
  const db = createServiceClient();
  const spec = KEYFRAME_MODELS[model];

  const { data: shot } = await db.from("shots").select("*").eq("id", shotId).single();
  if (!shot) throw new Error("Shot not found.");
  if (!shot.visual) throw new Error("This shot has no visual prompt.");

  const { data: episode } = await db
    .from("episodes").select("series_id").eq("id", shot.episode_id).single();
  if (!episode) throw new Error("Episode not found.");

  const { data: series } = await db
    .from("series").select("*").eq("id", episode.series_id).single();
  if (!series) throw new Error("Show not found.");

  // The refs this shot names, with their chosen art.
  const { data: refs } = await db
    .from("refs")
    .select("id, kind, name, description, chosen_image_id")
    .in("id", shot.ref_ids ?? []);

  const chosenIds = (refs ?? []).map((r) => r.chosen_image_id).filter(Boolean) as string[];
  const { data: images } = chosenIds.length
    ? await db.from("ref_images").select("id, storage_key").in("id", chosenIds)
    : { data: [] };

  const base = process.env.R2_PUBLIC_BASE_URL ?? "";
  const refUrls = (images ?? [])
    .filter((i) => i.storage_key)
    .map((i) => `${base}/${i.storage_key}`);

  const subjects = (refs ?? [])
    .map((r) => `${r.name}: ${r.description ?? ""}`)
    .join(". ");

  const prompt = [
    styleFragment(series.render_style),
    subjects,
    shot.visual,
    shot.framing ? `${shot.framing} shot` : "",
    "no text, no watermark, no subtitles",
  ]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");

  await db
    .from("shots")
    .update({
      keyframe_state: "running",
      keyframe_model: spec.id,
      keyframe_error: null,
      created_by: shot.created_by ?? userId,
    })
    .eq("id", shotId);

  const input: Record<string, unknown> = {
    prompt,
    image_size: series.aspect_ratio === "9:16" ? "portrait_16_9" : "landscape_16_9",
    num_images: 1,
  };

  // Reference-aware endpoints anchor on the chosen art; the rest have to make
  // do with the description, which is why a model that takes references is
  // worth the extra cent once a show has a cast.
  if (spec.refs && refUrls.length > 0) {
    input.image_urls = refUrls.slice(0, 4);
  }

  try {
    const { request_id } = await fal.queue.submit(spec.id, {
      input,
      webhookUrl: `${process.env.APP_URL}/api/webhooks/fal-shot?shot=${shotId}&kind=keyframe`,
    });

    await db
      .from("shots")
      .update({
        keyframe_job_id: request_id,
        cost_usd: Number(shot.cost_usd) + spec.usd,
      })
      .eq("id", shotId);

    return { shotId, estimatedCostUsd: spec.usd, usedRefs: refUrls.length };
  } catch (e) {
    await db
      .from("shots")
      .update({ keyframe_state: "failed", keyframe_error: (e as Error).message })
      .eq("id", shotId);
    throw e;
  }
}
