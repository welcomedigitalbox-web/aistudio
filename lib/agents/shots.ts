import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { styleFragment } from "@/lib/stages";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";

/**
 * Break one scene into shots.
 *
 * Per scene, not per episode: a thirteen-scene episode in one call runs long
 * and drifts, and a bad scene costs one rebuild instead of thirteen.
 *
 * Dialogue is carried as voice over shots that are not talking mouths. That
 * removes lip sync from the pipeline entirely, cuts the cost of every dialogue
 * beat, and is how this kind of drama is cut anyway -- the listening face is
 * usually the better shot.
 */
export async function buildShots(sceneId: string, note?: string) {
  const db = createServiceClient();

  const { data: scene } = await db.from("scenes").select("*").eq("id", sceneId).single();
  if (!scene) throw new Error("Scene not found.");
  if (!scene.script) throw new Error("Write the scene first.");

  const { data: episode } = await db
    .from("episodes")
    .select("id, n, series_id")
    .eq("id", scene.episode_id)
    .single();
  if (!episode) throw new Error("Episode not found.");

  const [{ data: series }, { data: refs }] = await Promise.all([
    db.from("series").select("*").eq("id", episode.series_id).single(),
    db.from("refs").select("id, kind, name, description").eq("series_id", episode.series_id),
  ]);
  if (!series) throw new Error("Show not found.");

  const byName = new Map((refs ?? []).map((r) => [r.name.toLowerCase(), r]));

  const cast = (refs ?? [])
    .filter((r) => r.kind === "character")
    .map((r) => `- ${r.name}: ${r.description ?? ""}`)
    .join("\n");
  const places = (refs ?? [])
    .filter((r) => r.kind === "location")
    .map((r) => `- ${r.name}: ${r.description ?? ""}`)
    .join("\n");

  const scriptText = (scene.script.elements ?? [])
    .map((el: any) =>
      el.type === "dialogue"
        ? `${el.character}${el.parenthetical ? ` (${el.parenthetical})` : ""}: ${el.text}`
        : el.text
    )
    .join("\n\n");

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: `You are the director breaking one scene into shots.

A shot is one continuous image with one motion. It becomes a still frame first
and a short clip second, so write two prompts for each:

VISUAL — the still. Composition, framing, what is in the frame, the light. This
is an image prompt, so be concrete and physical. Name the characters and
locations exactly as they appear in the reference list; those names resolve to
reference art and must match character for character.

MOTION — what moves, over 5 to 10 seconds. Small and specific: a head turning,
rain on glass, someone sitting down. Camera moves are allowed but sparingly.
Not a description of the shot; a description of the change in it.

Length is per shot, not fixed. A held silence wants 8 to 10 seconds; a cut
reaction wants 4. Set est_seconds honestly — the voice line, if any, has to fit.

DIALOGUE IS VOICE OVER, NOT LIP SYNC. Do not write shots of a character
speaking on camera. Put the line over the listening face, the hands, the window,
the object being discussed. Set on_screen false. Use on_screen true only where a
character speaking must be seen, and expect to justify it — those shots are the
ones that fail. Most scenes should have none.

Shots per scene: usually 3 to 6. A scene of pure stillness may want 2. Do not
pad — a shot that shows nothing new is a cut, not a shot.

Return JSON only, no fences:
{
  "shots": [{
    "n": 1,
    "framing": "wide | medium | close | insert | over-shoulder",
    "visual": "",
    "motion": "",
    "refs": ["exact names from the reference list that appear in this shot"],
    "est_seconds": 6,
    "lines": [{ "speaker": "", "line": "", "on_screen": false }]
  }]
}`,
    messages: [
      {
        role: "user",
        content: `Show: ${series.title}
Visual style: ${styleFragment(series.render_style)}
Aspect: ${series.aspect_ratio}

Bible:
${series.bible ?? ""}

Characters (use these names exactly):
${cast}

Locations (use these names exactly):
${places}

Scene ${scene.n}: ${scene.slug ?? ""}
Job: ${scene.job ?? ""}
${scene.opens_on} → ${scene.closes_on}

Script:

${scriptText}

${note ? `\nNote for this pass:\n${note}` : ""}`,
      },
    ],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    const truncated = msg.stop_reason === "max_tokens";
    throw new Error(
      truncated
        ? "The shot list ran past the token limit. Try again, or ask for fewer shots."
        : "The director did not return valid JSON. Try again."
    );
  }

  const shots = parsed.shots ?? [];
  if (shots.length === 0) throw new Error("No shots came back for that scene.");

  const costUsd =
    (msg.usage.input_tokens / 1_000_000) * 3 + (msg.usage.output_tokens / 1_000_000) * 15;

  // Replacing a scene's shots discards its generated art with them. That is
  // intended: the prompts changed, so the frames are stale.
  await db.from("shots").delete().eq("scene_id", sceneId);

  // Numbering continues across the episode so the cut reads in order.
  const { data: last } = await db
    .from("shots")
    .select("n")
    .eq("episode_id", scene.episode_id)
    .order("n", { ascending: false })
    .limit(1)
    .maybeSingle();

  let n = (last?.n ?? 0) + 1;
  const unknownRefs = new Set<string>();

  for (const shot of shots) {
    // Resolve names to reference ids. An unresolved name means the shot points
    // at art that does not exist, so surface it rather than generating a
    // stranger.
    const refIds: string[] = [];
    for (const name of shot.refs ?? []) {
      const ref = byName.get(String(name).toLowerCase());
      if (ref) refIds.push(ref.id);
      else unknownRefs.add(String(name));
    }

    const { data: row, error } = await db
      .from("shots")
      .insert({
        episode_id: scene.episode_id,
        scene_id: sceneId,
        n,
        scene_n: scene.n,
        slug: scene.slug,
        framing: shot.framing ?? null,
        visual: shot.visual,
        motion: shot.motion ?? null,
        ref_ids: refIds,
        target_seconds: shot.est_seconds ?? 6,
        cost_usd: 0,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Could not save shot ${n}: ${error.message}`);

    const lines = shot.lines ?? [];
    if (lines.length > 0) {
      const { error: lineError } = await db.from("shot_lines").insert(
        lines.map((l: any, i: number) => ({
          shot_id: row.id,
          n: i + 1,
          speaker: l.speaker,
          line: l.line,
          on_screen: l.on_screen ?? false,
        }))
      );
      if (lineError) throw new Error(`Could not save lines for shot ${n}: ${lineError.message}`);
    }

    n++;
  }

  // The scene's share of the planning cost.
  await db
    .from("scenes")
    .update({ cost_usd: Number(scene.cost_usd) + costUsd })
    .eq("id", sceneId);

  return {
    shots: shots.length,
    unknownRefs: [...unknownRefs],
    onScreenLines: shots.reduce(
      (t: number, s: any) => t + (s.lines ?? []).filter((l: any) => l.on_screen).length,
      0
    ),
    costUsd,
  };
}
