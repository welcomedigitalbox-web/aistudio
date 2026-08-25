import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planScenes, writeScene } from "@/lib/agents/scene";

// Each call is one small pass, so this stays well inside the function limit.
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { action, episodeId, sceneId, note } = await req.json();

  try {
    if (action === "plan") {
      if (!episodeId) return NextResponse.json({ error: "episodeId is required." }, { status: 400 });
      const result = await planScenes(episodeId, note);
      return NextResponse.json({ ...result, costUsd: Number(result.costUsd.toFixed(4)) });
    }

    if (action === "write") {
      if (!sceneId) return NextResponse.json({ error: "sceneId is required." }, { status: 400 });
      const result = await writeScene(sceneId, note);
      return NextResponse.json({ ...result, costUsd: Number(result.costUsd.toFixed(4)) });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
