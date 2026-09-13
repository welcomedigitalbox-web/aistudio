import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { suggestModels } from "@/lib/agents/castmodel";
import { CLIP_MODELS } from "@/lib/production/models";

export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json();
  const db = createServiceClient();

  try {
    switch (body.action) {
      case "cast":
        if (!body.episodeId) {
          return NextResponse.json({ error: "episodeId is required." }, { status: 400 });
        }
        return NextResponse.json(await suggestModels(body.episodeId, body.note));

      /** Override one shot's model by hand. */
      case "set": {
        const { shotId, model } = body;
        if (!shotId || !(model in CLIP_MODELS)) {
          return NextResponse.json(
            { error: "shotId and a valid model are required." },
            { status: 400 }
          );
        }
        const { error } = await db
          .from("shots")
          .update({ suggested_model: model, suggested_reason: "chosen by hand" })
          .eq("id", shotId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      /**
       * Sign off the whole cast. Nothing generates until this happens — the
       * point of the suggestion is that a person looks at it first.
       */
      case "approve": {
        const { episodeId, approved } = body;
        if (!episodeId) {
          return NextResponse.json({ error: "episodeId is required." }, { status: 400 });
        }
        const { error } = await db
          .from("shots")
          .update({ model_approved: approved !== false })
          .eq("episode_id", episodeId)
          .not("suggested_model", "is", null);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
