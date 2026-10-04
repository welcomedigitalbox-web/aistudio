import * as fal from "@fal-ai/serverless-client";
import { createServiceClient } from "@/lib/supabase/server";
import { styleFragment } from "@/lib/stages";
import { clipEndpoint, CLIP_MODELS, type ClipModel } from "./models";

/**
 * The video model sees the start frame plus this text and nothing else, so the
 * text has to carry the whole shot: who, where, the light, the lens, then the
 * change. A bare motion line ("a head turning") makes the model guess at all of
 * it, and image-to-video models guess towards stock footage.
 */
function clipPrompt(opts: {
  style: string;
  subjects: string;
  visual: string;
  framing: string | null;
  motion: string | null;
  liveAction: boolean;
  audio: boolean;
}) {
  const camera = opts.liveAction
    ? "Cinematic film still in motion, anamorphic lens, natural motion blur, realistic skin texture and micro-expressions, physically accurate light, 24fps film look, subtle handheld camera"
    : "Cinematic camera, smooth motion, consistent lighting";
  return [
    opts.style,
    opts.subjects,
    `Scene: ${opts.visual}`,
    opts.framing ? `${opts.framing} shot` : "",
    opts.motion ? `Action: ${opts.motion}` : "Action: subtle natural movement, the frame stays alive",
    camera,
    "Keep faces, wardrobe and setting exactly as in the start frame",
    opts.audio ? "Audio: ambient sound and foley only, nobody speaks" : "",
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(". ");
}

const NEGATIVE_BASE =
  "text, watermark, subtitles, logo, distorted face, morphing face, extra fingers, extra limbs, warped hands, flicker, low quality";
// Only for live action: an anime show must not be told to avoid cartoons.
const NEGATIVE_LIVE = `${NEGATIVE_BASE}, cartoon, illustration, CGI, 3D render, plastic skin, waxy skin, oversaturated`;

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

  const { endpoint, duration, durationValue, usd } = clipEndpoint(model, Number(shot.target_seconds));
  const spec = CLIP_MODELS[model];

  const { data: episode } = await db
    .from("episodes").select("series_id").eq("id", shot.episode_id).single();
  const { data: series } = episode
    ? await db.from("series").select("render_style, aspect_ratio").eq("id", episode.series_id).single()
    : { data: null };
  const { data: refs } = await db
    .from("refs").select("name, description").in("id", shot.ref_ids ?? []);

  const liveAction = series?.render_style === "live_action";
  const aspect = series?.aspect_ratio === "9:16" ? "9:16" : "16:9";
  /**
   * Native audio is off. Voice and music are made separately and laid in at
   * the edit, so model audio is never used — and it is not free: Veo 3.1 bills
   * $0.40/s with audio against $0.20/s without, Kling 3.0 Pro $0.168 against
   * $0.112. Off also stops a model inventing English speech over a shot.
   */
  const hasAudio = false;

  const prompt = clipPrompt({
    style: styleFragment(series?.render_style ?? "live_action"),
    subjects: (refs ?? []).map((r) => `${r.name}: ${r.description ?? ""}`).join("; "),
    visual: shot.visual,
    framing: shot.framing,
    motion: shot.motion,
    liveAction,
    audio: hasAudio,
  });

  // Provider-specific quality switches. Veo and Seedance default to 720p.
  const extra: Record<string, unknown> = {};
  if (spec.durationKind === "veo") {
    extra.resolution = "1080p";
    extra.aspect_ratio = aspect;
    extra.generate_audio = false;
  }
  if (spec.durationKind === "kling3") {
    extra.generate_audio = false;
  }
  if (spec.durationKind === "seedance") {
    extra.resolution = "1080p";
    extra.aspect_ratio = aspect;
    extra.generate_audio = false;
  }

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
        prompt,
        // Kling v3 calls it start_image_url; most others image_url.
        [spec.imageField]: startFrame,
        duration: durationValue,
        // Seedance has no negative prompt field; the others honour it.
        ...(spec.durationKind === "seedance" ? {} : { negative_prompt: liveAction ? NEGATIVE_LIVE : NEGATIVE_BASE }),
        ...extra,
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
