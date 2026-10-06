import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateKeyframe, editKeyframe } from "@/lib/production/keyframe";
import { generateClip, chainScene } from "@/lib/production/clip";
import { KEYFRAME_MODELS, CLIP_MODELS, clipEndpoint } from "@/lib/production/models";
import { OPENLUX_MODELS } from "@/lib/production/openlux";
import { inngest } from "@/lib/inngest/client";
import { rememberKeyframe } from "@/lib/production/history";

export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json();
  const db = createServiceClient();

  try {
    switch (body.action) {
      case "keyframe": {
        const { shotId, model, note, keepRest } = body;
        if (!shotId || !(model in KEYFRAME_MODELS)) {
          return NextResponse.json({ error: "shotId and a valid model are required." }, { status: 400 });
        }
        // Change one thing on the current still and keep the rest.
        if (keepRest) {
          return NextResponse.json(
            await editKeyframe(shotId, model, user.id, String(note ?? "").slice(0, 600))
          );
        }
        return NextResponse.json(
          await generateKeyframe(shotId, model, user.id, typeof note === "string" ? note.slice(0, 600) : undefined)
        );
      }

      case "upload-keyframe": {
        // The creator's own picture as the still. Same reset as a new
        // generation: an old clip was made from the old still.
        const { shotId, storageKey } = body;
        if (!shotId || typeof storageKey !== "string" || !storageKey.startsWith(`shots/uploads/${shotId}/`)) {
          return NextResponse.json({ error: "shotId and the uploaded file are required." }, { status: 400 });
        }
        const { data: before } = await db.from("shots").select("keyframe_storage_key").eq("id", shotId).single();
        await rememberKeyframe(db, shotId, before?.keyframe_storage_key);
        const { error } = await db
          .from("shots")
          .update({
            keyframe_storage_key: storageKey,
            keyframe_state: "ready",
            keyframe_error: null,
            keyframe_job_id: null,
            keyframe_model: "upload",
            keyframe_approved: false,
            clip_storage_key: null,
            clip_state: "idle",
            last_frame_storage_key: null,
          })
          .eq("id", shotId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      case "restore-keyframe": {
        // Put an earlier still back. The one on screen goes onto the list.
        const { shotId, key } = body;
        const { data: s, error: e1 } = await db
          .from("shots").select("keyframe_storage_key, keyframe_history").eq("id", shotId).single();
        if (e1 || !s) throw new Error(e1?.message ?? "Shot not found.");
        const history: string[] = s.keyframe_history ?? [];
        if (!history.includes(key)) {
          return NextResponse.json({ error: "That picture is not in this shot's history." }, { status: 400 });
        }
        const rest = history.filter((k) => k !== key && k !== s.keyframe_storage_key);
        const { error } = await db
          .from("shots")
          .update({
            keyframe_storage_key: key,
            keyframe_history: (s.keyframe_storage_key ? [s.keyframe_storage_key, ...rest] : rest).slice(0, 12),
            keyframe_state: "ready",
            keyframe_error: null,
            keyframe_job_id: null,
            keyframe_approved: false,
            clip_storage_key: null,
            clip_state: "idle",
            last_frame_storage_key: null,
          })
          .eq("id", shotId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      case "clip": {
        const { shotId, model } = body;

        // Gateway models have no webhook, so the waiting happens in a
        // background function rather than this request.
        if (model in OPENLUX_MODELS) {
          if (!shotId) {
            return NextResponse.json({ error: "shotId is required." }, { status: 400 });
          }
          await inngest.send({
            name: "openlux/clip.requested",
            data: { shotId, model },
          });
          await db.from("shots").update({ clip_state: "running" }).eq("id", shotId);
          return NextResponse.json({ queued: true, shotId });
        }

        if (!shotId || !(model in CLIP_MODELS)) {
          return NextResponse.json({ error: "shotId and a valid model are required." }, { status: 400 });
        }
        return NextResponse.json(await generateClip(shotId, model, user.id));
      }

      case "approve-keyframe": {
        const { shotId, approved } = body;
        const { error } = await db
          .from("shots")
          .update({ keyframe_approved: approved })
          .eq("id", shotId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      case "chain": {
        const { sceneId, on } = body;
        if (!sceneId) return NextResponse.json({ error: "sceneId is required." }, { status: 400 });
        return NextResponse.json(await chainScene(sceneId, !!on));
      }

      /**
       * What the next batch would cost, before anyone commits to it. Video is
       * the one stage where the bill outruns the intuition.
       */
      case "estimate": {
        const { episodeId, stage, model } = body;
        const { data: shots } = await db
          .from("shots")
          .select("id, target_seconds, keyframe_storage_key, keyframe_approved, clip_storage_key, keyframe_state, clip_state")
          .eq("episode_id", episodeId);

        const list = shots ?? [];

        if (stage === "keyframe") {
          const pending = list.filter((s) => !s.keyframe_storage_key && s.keyframe_state !== "running");
          const usd = KEYFRAME_MODELS[model as keyof typeof KEYFRAME_MODELS]?.usd ?? 0;
          return NextResponse.json({
            count: pending.length,
            estimatedCostUsd: Number((pending.length * usd).toFixed(2)),
          });
        }

        const pending = list.filter(
          (s) => s.keyframe_approved && !s.clip_storage_key && s.clip_state !== "running"
        );

        const total =
          model in OPENLUX_MODELS
            ? pending.length * OPENLUX_MODELS[model as keyof typeof OPENLUX_MODELS].usd
            : pending.reduce(
                (t, s) => t + clipEndpoint(model, Number(s.target_seconds)).usd,
                0
              );
        return NextResponse.json({
          count: pending.length,
          estimatedCostUsd: Number(total.toFixed(2)),
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
