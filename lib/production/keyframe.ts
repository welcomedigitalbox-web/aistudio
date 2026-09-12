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

  if (spec.refs && refUrls.length > 0) {
    input.image_urls = refUrls.slice(0, spec.maxRefs ?? 4);
  }

  // Choosing a reference-aware model and then having no references is a silent
  // downgrade to plain text-to-image, which is the failure this stage exists
  // to prevent. Say so rather than quietly producing a stranger.
  const warning =
    spec.refs && refUrls.length === 0
      ? "No chosen reference art for this shot's characters — generated from the description alone."
      : null;

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
