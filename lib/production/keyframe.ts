import * as fal from "@fal-ai/serverless-client";
import { createServiceClient } from "@/lib/supabase/server";
import { styleFragment } from "@/lib/stages";
import { KEYFRAME_MODELS, type KeyframeModel } from "./models";

fal.config({ credentials: process.env.FAL_KEY! });

/**
 * Generate the still for one shot.
 *
 * Where a reference-aware model is chosen and the shot's characters have
 * chosen art, that art is passed through as an image reference. This is the
 * difference between a character who looks like themselves in shot 40 and one
 * who does not: a description is a hope, a reference is a constraint.
 *
 * The description still goes in the prompt verbatim — the same words that
 * produced the reference sheet. Rewording them pulls the model away from the
 * image it was given.
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

  const { data: refs } = await db
    .from("refs")
    .select("id, kind, name, description, chosen_image_id")
    .in("id", shot.ref_ids ?? []);

  // Characters first: when a model accepts only a few references, a face
  // matters more than a wall.
  const ordered = (refs ?? []).sort((a, b) =>
    a.kind === "character" ? -1 : b.kind === "character" ? 1 : 0
  );

  const chosenIds = ordered.map((r) => r.chosen_image_id).filter(Boolean) as string[];
  const { data: images } = chosenIds.length
    ? await db.from("ref_images").select("id, storage_key").in("id", chosenIds)
    : { data: [] };

  const byId = new Map((images ?? []).map((i) => [i.id, i.storage_key]));
  const base = process.env.R2_PUBLIC_BASE_URL ?? "";

  const refUrls = ordered
    .map((r) => (r.chosen_image_id ? byId.get(r.chosen_image_id) : null))
    .filter(Boolean)
    .map((key) => `${base}/${key}`);

  const subjects = ordered.map((r) => `${r.name}: ${r.description ?? ""}`).join(". ");

  const prompt = [
    styleFragment(series.render_style),
    subjects,
    shot.visual,
    shot.framing ? `${shot.framing} shot` : "",
    series.render_style === "live_action"
      ? "shot on ARRI Alexa, 35mm anamorphic lens, motivated practical lighting, realistic skin pores and texture, film colour grade"
      : "",
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

  const input: Record<string, unknown> = { prompt, num_images: 1 };
  const portrait = series.aspect_ratio === "9:16";
  const ratio = portrait ? "9:16" : "16:9";

  /**
   * Size the still for the clip it will become. Video models want 720p or
   * better at 16:9 or 9:16; anything else is cropped or upscaled into mush.
   * Each provider names the setting differently:
   *  - Seedream edit defaults to 512x512 if not told otherwise.
   *  - Nano Banana defaults to the reference image's shape (a square sheet).
   *  - Flux Ultra ignores image_size; it reads aspect_ratio.
   */
  if (spec.id.includes("seedream")) {
    input.image_size = portrait ? { width: 1440, height: 2560 } : { width: 2560, height: 1440 };
  } else if (spec.id.includes("nano-banana")) {
    input.aspect_ratio = ratio;
    if (spec.id.includes("pro")) input.resolution = "2K";
  } else if (spec.id.includes("flux-pro/v1.1-ultra")) {
    input.aspect_ratio = ratio;
    // raw mode drops the glossy AI look — the single biggest win for live action.
    if (series.render_style === "live_action") input.raw = true;
  } else if (spec.id.startsWith("xai/")) {
    input.aspect_ratio = ratio;
  } else {
    input.image_size = portrait ? "portrait_16_9" : "landscape_16_9";
  }

  if (spec.refs && refUrls.length > 0) {
    input.image_urls = refUrls.slice(0, spec.maxRefs ?? 4);
  }

  if (spec.refs && refUrls.length === 0) {
    await db
      .from("shots")
      .update({
        keyframe_state: "failed",
        keyframe_error:
          "This shot has no reference art, and this model edits references rather than generating from text. Use Flux Pro or Seedream for shots with no characters in them.",
      })
      .eq("id", shotId);

    throw new Error(
      "No reference art for this shot. Pick a model that generates from text."
    );
  }

  const warning = null;

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

    return {
      shotId,
      estimatedCostUsd: spec.usd,
      usedRefs: refUrls.length,
      warning,
    };
  } catch (e) {
    await db
      .from("shots")
      .update({ keyframe_state: "failed", keyframe_error: (e as Error).message })
      .eq("id", shotId);
    throw e;
  }
}
