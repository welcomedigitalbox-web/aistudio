import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agents/run";
import { styleFragment } from "@/lib/stages";

export const maxDuration = 60;

/**
 * Runs one pipeline stage. The caller picks the stage; everything the agent
 * reads is assembled here from the show itself. Letting a person choose which
 * documents to feed in was the easiest way to get incoherent output.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { episodeId, seriesId, agent, note } = await req.json();
  if (!episodeId || !seriesId || !agent) {
    return NextResponse.json({ error: "episodeId, seriesId and agent are required." }, { status: 400 });
  }

  const db = createServiceClient();

  const [{ data: series }, { data: episode }, { data: refs }, { data: sources }, { data: earlier }] =
    await Promise.all([
      db.from("series").select("*, projects(id)").eq("id", seriesId).single(),
      db.from("episodes").select("*").eq("id", episodeId).single(),
      db.from("refs").select("kind, name, description").eq("series_id", seriesId),
      db.from("sources").select("id").eq("series_id", seriesId).eq("state", "ready"),
      db.from("episodes").select("n, title, premise").eq("series_id", seriesId).order("n"),
    ]);

  if (!series || !episode) {
    return NextResponse.json({ error: "Show or episode not found." }, { status: 404 });
  }

  const cast = (refs ?? [])
    .filter((r) => r.kind === "character")
    .map((r) => `- ${r.name}: ${r.description ?? ""}`)
    .join("\n");

  const places = (refs ?? [])
    .filter((r) => r.kind === "location")
    .map((r) => `- ${r.name}: ${r.description ?? ""}`)
    .join("\n");

  const previous = (earlier ?? [])
    .filter((e) => e.n < episode.n)
    .map((e) => `${e.n}. ${e.title} — ${e.premise ?? ""}`)
    .join("\n");

  // The stage's own parent documents, resolved from the episode rather than
  // chosen in the UI.
  const parentIds: string[] = [];
  if (agent === "scene_plan" && episode.script_id) parentIds.push(episode.script_id);

  const brief = [
    `# ${series.title}`,
    series.premise && `Premise: ${series.premise}`,
    `\n## Bible\n${series.bible ?? ""}`,
    `\nVisual style: ${styleFragment(series.render_style)}`,
    `Target runtime: ${series.target_minutes} minutes. Language: ${series.language}.`,
    cast && `\n## Cast\n${cast}`,
    places && `\n## Locations\n${places}`,
    previous && `\n## Earlier episodes\n${previous}`,
    `\n## This episode\n${episode.n}. ${episode.title}\n${episode.premise ?? ""}`,
    note && `\n## Note from the writer\n${note}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await runAgent({
      projectId: (series.projects as any).id,
      agent,
      title: agent === "script" ? `Script — ep ${episode.n}` : `Scene plan — ep ${episode.n}`,
      brief,
      parentIds,
      sourceIds: (sources ?? []).map((s) => s.id),
      userId: user.id,
    });

    // Bind the document to the episode and record it on the right slot.
    await db.from("story_docs").update({ episode_id: episodeId }).eq("id", result.id);

    const slot = agent === "script" ? "script_id" : "plan_id";
    await db
      .from("episodes")
      .update({ [slot]: result.id, updated_at: new Date().toISOString() })
      .eq("id", episodeId);

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
