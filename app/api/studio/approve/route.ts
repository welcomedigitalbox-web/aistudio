import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Every gate in the pipeline goes through here. Approval is always a person
 * clicking, never a job marking its own work as done.
 */
const SERIES_GATES = ["bible_approved", "refs_approved"] as const;
const EPISODE_GATES = ["script_approved", "plan_approved", "shots_approved"] as const;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { seriesId, episodeId, gate, value = true } = await req.json();

  if (seriesId && (SERIES_GATES as readonly string[]).includes(gate)) {
    // Approving the cast is only meaningful once every character has a face.
    if (gate === "refs_approved" && value) {
      const { data: refs } = await supabase
        .from("refs")
        .select("id, chosen_image_id")
        .eq("series_id", seriesId)
        .eq("kind", "character");

      const missing = (refs ?? []).filter((r) => !r.chosen_image_id).length;
      if (missing > 0) {
        return NextResponse.json(
          { error: `${missing} character${missing > 1 ? "s have" : " has"} no chosen image yet.` },
          { status: 409 }
        );
      }
    }

    const { error } = await supabase.from("series").update({ [gate]: value }).eq("id", seriesId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (episodeId && (EPISODE_GATES as readonly string[]).includes(gate)) {
    const { error } = await supabase
      .from("episodes")
      .update({ [gate]: value, updated_at: new Date().toISOString() })
      .eq("id", episodeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown gate." }, { status: 400 });
}
