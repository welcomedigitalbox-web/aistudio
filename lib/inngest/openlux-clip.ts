import { inngest } from "@/lib/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { putFromUrl } from "@/lib/storage/r2";
import { submitClip, pollClip, OPENLUX_MODELS, type OpenluxModel } from "@/lib/production/openlux";

/**
 * Generate a clip through the OpenLux gateway.
 *
 * fal calls us back when a job finishes; OpenLux does not, so the waiting has
 * to live somewhere. A browser tab is the wrong place — a fifty-shot batch
 * would be fifty tabs held open for ten minutes each — so it lives here, where
 * a step can sleep without holding a request open.
 */
export const openluxClip = inngest.createFunction(
  {
    id: "openlux-clip",
    // The gateway queues; hammering it with fifty at once earns rate limits
    // that still cost a retry.
    concurrency: { limit: 4 },
    retries: 1,
  },
  { event: "openlux/clip.requested" },
  async ({ event, step }) => {
    const { shotId, model } = event.data as { shotId: string; model: OpenluxModel };
    const db = createServiceClient();

    const submitted = await step.run("submit", async () => {
      const { data: shot } = await db.from("shots").select("*").eq("id", shotId).single();
      if (!shot) throw new Error("Shot not found.");
      if (!shot.keyframe_storage_key) throw new Error("Generate the keyframe first.");
      if (!shot.keyframe_approved) throw new Error("Approve the keyframe first.");

      const { data: episode } = await db
        .from("episodes").select("series_id").eq("id", shot.episode_id).single();
      const { data: series } = await db
        .from("series").select("aspect_ratio").eq("id", episode!.series_id).single();

      const base = process.env.R2_PUBLIC_BASE_URL ?? "";

      // Chaining, same rule as the fal path: within a scene only.
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

      const result = await submitClip({
        model,
        imageUrl: startFrame,
        prompt: shot.motion || shot.visual,
        seconds: Number(shot.target_seconds),
        aspect: series?.aspect_ratio ?? "16:9",
      });

      await db
        .from("shots")
        .update({
          clip_state: "running",
          clip_model: OPENLUX_MODELS[model].model,
          clip_job_id: result.taskId,
          clip_seconds: result.seconds,
          clip_error: null,
          cost_usd: Number(shot.cost_usd) + result.usd,
        })
        .eq("id", shotId);

      return result;
    });

    // Poll. Twenty minutes is generous for an eight-second clip; past that
    // the job is stuck and saying so beats waiting forever.
    let url: string | null = null;

    for (let attempt = 0; attempt < 60; attempt++) {
      await step.sleep(`wait-${attempt}`, attempt < 4 ? "15s" : "20s");

      const result = await step.run(`poll-${attempt}`, () => pollClip(submitted.taskId));

      if (result.state === "ready") {
        url = result.url;
        break;
      }

      if (result.state === "failed") {
        await step.run(`fail-${attempt}`, async () => {
          await db
            .from("shots")
            .update({ clip_state: "failed", clip_error: result.error })
            .eq("id", shotId);
        });
        return { shotId, failed: result.error };
      }
    }

    if (!url) {
      await step.run("timeout", async () => {
        await db
          .from("shots")
          .update({
            clip_state: "failed",
            clip_error: "The provider did not finish within twenty minutes.",
          })
          .eq("id", shotId);
      });
      return { shotId, failed: "timeout" };
    }

    // The gateway's URLs expire. Copy the file into R2 before that happens.
    await step.run("store", async () => {
      const { data: shot } = await db
        .from("shots").select("episode_id").eq("id", shotId).single();

      const key = `shots/${shot!.episode_id}/${shotId}-clip.mp4`;
      await putFromUrl(key, url!, "video/mp4");

      await db
        .from("shots")
        .update({ clip_storage_key: key, clip_state: "ready", clip_error: null })
        .eq("id", shotId);
    });

    return { shotId, ok: true };
  }
);
