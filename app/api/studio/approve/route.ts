import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Every gate in the pipeline goes through here.
 *
 * Approval is a reviewer's job. A creator can make and remake the work as much
 * as they like; signing it off is a separate act by a separate person, and the
 * name goes on the row.
 */
const SERIES_GATES = ["bible_approved", "refs_approved"] as const;
const EPISODE_GATES = ["script_approved", "plan_approved", "shots_approved"] as const;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (me?.role !== "admin" && me?.role !== "reviewer") {
    return NextResponse.json(
      { error: "Approving is a reviewer's job. Ask one to take a look." },
      { status: 403 }
    );
  }

  const { seriesId, episodeId, gate, value = true } = await req.json();

  if (seriesId && (SERIES_GATES as readonly string[]).includes(gate)) {
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

    const by = gate === "bible_approved" ? "bible_approved_by" : "refs_approved_by";
    const { error } = await supabase
      .from("series")
      .update({ [gate]: value, [by]: value ? user.id : null })
      .eq("id", seriesId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (episodeId && (EPISODE_GATES as readonly string[]).includes(gate)) {
    const by = gate.replace("_approved", "_approved_by");
    const { error } = await supabase
      .from("episodes")
      .update({
        [gate]: value,
        [by]: value ? user.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", episodeId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown gate." }, { status: 400 });
}
