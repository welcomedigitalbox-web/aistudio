import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { styleFragment } from "@/lib/stages";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";

/**
 * Plan the episode's scenes. Structure only -- no dialogue, so the response
 * stays small enough to finish inside a 60s function.
 */
export async function planScenes(episodeId: string, note?: string) {
  const db = createServiceClient();

  const { data: episode } = await db
    .from("episodes")
    .select("id, n, title, premise, series_id, project_id:series(project_id)")
    .eq("id", episodeId)
    .single();
  if (!episode) throw new Error("Episode not found.");

  const [{ data: series }, { data: refs }, { data: earlier }] = await Promise.all([
    db.from("series").select("*, projects(id)").eq("id", episode.series_id).single(),
    db.from("refs").select("kind, name, description").eq("series_id", episode.series_id),
    db
      .from("episodes")
      .select("n, title, premise")
      .eq("series_id", episode.series_id)
      .lt("n", episode.n)
      .order("n"),
  ]);
  if (!series) throw new Error("Show not found.");

  const cast = (refs ?? [])
    .filter((r) => r.kind === "character")
    .map((r) => `- ${r.name}: ${r.description ?? ""}`)
    .join("\n");
  const places = (refs ?? [])
    .filter((r) => r.kind === "location")
    .map((r) => `- ${r.name}: ${r.description ?? ""}`)
    .join("\n");

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: `You are the structure lead in a screenwriting room, planning one
episode.

Every scene must do a job: change a character's situation, reveal information,
or turn the story. State each scene's value shift -- what state it opens on,
what state it closes on. A scene that opens and closes on the same state is not
a scene; cut it and say so.

Use only the locations you are given. If a scene needs somewhere new, name it in
"new_locations" rather than inventing it silently -- the art has to exist before
it can be shot.

Target runtime is ${series.target_minutes} minutes, which is roughly 12 to 15
scenes. Write no dialogue here; this is structure.

Return JSON only, no fences, no commentary:
{
  "logline": "",
  "new_locations": ["names of places the episode needs that are not in the list"],
  "scenes": [{
    "n": 1,
    "slug": "INT. PLACE - NIGHT",
    "job": "",
    "opens_on": "", "closes_on": "",
    "characters": [],
    "conflict": "",
    "est_seconds": 0
  }],
  "cuts": ["scenes considered and rejected, with the reason"]
}`,
    messages: [
      {
        role: "user",
        content: `Show: ${series.title}

Bible:
${series.bible ?? ""}

Visual style: ${styleFragment(series.render_style)}

Cast:
${cast}

Locations:
${places}

${(earlier ?? []).length ? `Earlier episodes:\n${(earlier ?? []).map((e) => `${e.n}. ${e.title} — ${e.premise ?? ""}`).join("\n")}` : ""}

This episode:
${episode.n}. ${episode.title}
${episode.premise ?? ""}

${note ? `Note from the writer:\n${note}` : ""}`,
      },
    ],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    throw new Error("The planner did not return valid JSON. Try again.");
  }

  const scenes = parsed.scenes ?? [];
  if (scenes.length === 0) throw new Error("The planner returned no scenes.");

  const costUsd =
    (msg.usage.input_tokens / 1_000_000) * 3 + (msg.usage.output_tokens / 1_000_000) * 15;

  // Store the plan document for the record, then materialise the scene rows.
  const { data: doc } = await db
    .from("story_docs")
    .insert({
      project_id: (series.projects as any).id,
      episode_id: episodeId,
      agent: "scene_plan",
      title: `Scene plan — ep ${episode.n}`,
      body: parsed,
      model: MODEL,
      cost_usd: Number(costUsd.toFixed(4)),
    })
    .select("id")
    .single();

  await db.from("scenes").delete().eq("episode_id", episodeId);

  const rows = scenes.map((s: any, i: number) => ({
    episode_id: episodeId,
    n: i + 1,
    slug: s.slug ?? null,
    job: s.job ?? null,
    opens_on: s.opens_on ?? null,
    closes_on: s.closes_on ?? null,
    characters: s.characters ?? [],
    conflict: s.conflict ?? null,
    est_seconds: s.est_seconds ?? null,
  }));

  const { error } = await db.from("scenes").insert(rows);
  if (error) throw new Error(`Could not save the scenes: ${error.message}`);

  await db
    .from("episodes")
    .update({ plan_id: doc!.id, scenes_planned: true, updated_at: new Date().toISOString() })
    .eq("id", episodeId);

  return {
    scenes: rows.length,
    newLocations: parsed.new_locations ?? [],
    costUsd,
  };
}

/**
 * Write one scene. Gets the neighbours for continuity, not the whole plan --
 * a fifteen-scene plan sent fifteen times costs fifteen times more and writes
 * worse, because the model loses the thread of which scene it is on.
 */
export async function writeScene(sceneId: string, note?: string) {
  const db = createServiceClient();

  const { data: scene } = await db.from("scenes").select("*").eq("id", sceneId).single();
  if (!scene) throw new Error("Scene not found.");

  const { data: episode } = await db
    .from("episodes")
    .select("id, n, title, premise, series_id")
    .eq("id", scene.episode_id)
    .single();
  if (!episode) throw new Error("Episode not found.");

  const [{ data: series }, { data: refs }, { data: neighbours }] = await Promise.all([
    db.from("series").select("*, projects(id)").eq("id", episode.series_id).single(),
    db.from("refs").select("kind, name, description").eq("series_id", episode.series_id),
    db
      .from("scenes")
      .select("n, slug, job, opens_on, closes_on, conflict")
      .eq("episode_id", scene.episode_id)
      .in("n", [scene.n - 1, scene.n + 1]),
  ]);
  if (!series) throw new Error("Show not found.");

  // Only the characters in this scene. Handing the writer the whole cast for a
  // two-hander invites walk-ons nobody asked for.
  const present = (refs ?? []).filter(
    (r) => r.kind === "character" && (scene.characters ?? []).includes(r.name)
  );
  const voices = present.map((r) => `- ${r.name}: ${r.description ?? ""}`).join("\n");

  const before = (neighbours ?? []).find((s) => s.n === scene.n - 1);
  const after = (neighbours ?? []).find((s) => s.n === scene.n + 1);

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `You are the writer in a screenwriting room, writing ONE scene.

Action lines are present tense and describe only what a camera can record. No
interior states, no "he realises" -- let behaviour carry it.

Dialogue is shorter than feels natural on the first pass. Cut the first line of
every exchange; conversations rarely need their own opening. Characters talk
past each other more often than they answer directly.

The neighbouring scenes are context for continuity. Do not write them, and do
not resolve what a later scene is meant to resolve.

Respect the show bible, especially what the show never does.

Return JSON only, no fences, no commentary:
{
  "slug": "INT. PLACE - NIGHT",
  "elements": [
    { "type": "action", "text": "" },
    { "type": "dialogue", "character": "", "parenthetical": "", "text": "" }
  ]
}`,
    messages: [
      {
        role: "user",
        content: `Show: ${series.title}
Episode ${episode.n}: ${episode.title}

Bible:
${series.bible ?? ""}

Characters in this scene:
${voices || "(none listed — write it as action only)"}

${before ? `Previous scene:\n${JSON.stringify(before)}\n` : "This is the opening scene.\n"}
Scene to write:
${JSON.stringify({
  n: scene.n,
  slug: scene.slug,
  job: scene.job,
  opens_on: scene.opens_on,
  closes_on: scene.closes_on,
  conflict: scene.conflict,
  est_seconds: scene.est_seconds,
})}

${after ? `Next scene:\n${JSON.stringify(after)}` : "This is the final scene."}

${note ? `Note from the writer:\n${note}` : ""}`,
      },
    ],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    throw new Error(`Scene ${scene.n} did not come back as valid JSON.`);
  }

  const costUsd =
    (msg.usage.input_tokens / 1_000_000) * 3 + (msg.usage.output_tokens / 1_000_000) * 15;

  const { error } = await db
    .from("scenes")
    .update({ script: parsed, cost_usd: Number(costUsd.toFixed(4)) })
    .eq("id", sceneId);
  if (error) throw new Error(error.message);

  return { n: scene.n, costUsd };
}
