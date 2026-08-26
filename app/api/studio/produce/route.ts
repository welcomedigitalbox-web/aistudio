import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateKeyframe } from "@/lib/production/keyframe";
import { generateClip, chainScene } from "@/lib/production/clip";
import { KEYFRAME_MODELS, CLIP_MODELS, clipEndpoint } from "@/lib/production/models";

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
        const { shotId, model } = body;
        if (!shotId || !(model in KEYFRAME_MODELS)) {
          return NextResponse.json({ error: "shotId and a valid model are required." }, { status: 400 });
        }
        return NextResponse.json(await generateKeyframe(shotId, model, user.id));
      }

      case "clip": {
        const { shotId, model } = body;
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
          .select("id, target_seconds, keyframe_storage_key, keyframe_approved, clip_storage_key")
          .eq("episode_id", episodeId);

        const list = shots ?? [];

        if (stage === "keyframe") {
          const pending = list.filter((s) => !s.keyframe_storage_key);
          const usd = KEYFRAME_MODELS[model as keyof typeof KEYFRAME_MODELS]?.usd ?? 0;
          return NextResponse.json({
            count: pending.length,
            estimatedCostUsd: Number((pending.length * usd).toFixed(2)),
          });
        }

        const pending = list.filter((s) => s.keyframe_approved && !s.clip_storage_key);
        const total = pending.reduce(
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
