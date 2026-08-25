import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildShots } from "@/lib/agents/shots";

export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json();
  const db = createServiceClient();

  try {
    switch (body.action) {
      case "build":
        if (!body.sceneId) {
          return NextResponse.json({ error: "sceneId is required." }, { status: 400 });
        }
        return NextResponse.json(await buildShots(body.sceneId, body.note));

      case "update": {
        const { shotId, visual, motion, framing, targetSeconds, approved } = body;
        if (!shotId) return NextResponse.json({ error: "shotId is required." }, { status: 400 });

        const patch: Record<string, unknown> = {};
        if (visual !== undefined) patch.visual = visual;
        if (motion !== undefined) patch.motion = motion;
        if (framing !== undefined) patch.framing = framing;
        if (targetSeconds !== undefined) patch.target_seconds = targetSeconds;
        if (approved !== undefined) {
          patch.approved = approved;
          patch.approved_at = approved ? new Date().toISOString() : null;
        }

        const { error } = await db.from("shots").update(patch).eq("id", shotId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      case "update-line": {
        const { lineId, line, speaker, onScreen } = body;
        if (!lineId) return NextResponse.json({ error: "lineId is required." }, { status: 400 });

        const patch: Record<string, unknown> = {};
        if (line !== undefined) patch.line = line;
        if (speaker !== undefined) patch.speaker = speaker;
        if (onScreen !== undefined) patch.on_screen = onScreen;

        const { error } = await db.from("shot_lines").update(patch).eq("id", lineId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      case "delete": {
        if (!body.shotId) return NextResponse.json({ error: "shotId is required." }, { status: 400 });
        await db.from("shots").delete().eq("id", body.shotId);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
