import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";

/**
 * Break the novel into episodes.
 *
 * The count is derived, not configured. How many episodes a book wants depends
 * on how many turns it has -- forcing a ten-episode shape onto a book with six
 * turns gives you four episodes of filler, and the reverse crushes two good
 * turns into one.
 */
export async function planSeason(seriesId: string) {
  const db = createServiceClient();

  const { data: series } = await db
    .from("series")
    .select("id, title, premise, bible, target_minutes, source_id")
    .eq("id", seriesId)
    .single();

  if (!series?.source_id) throw new Error("Add the novel first.");
  if (!series.bible) throw new Error("Draft the bible first.");

  const { data: chunks } = await db
    .from("source_chunks")
    .select("n, label, summary, body")
    .eq("source_id", series.source_id)
    .order("n");

  // Season planning needs the whole arc, so unlike the bible pass this samples
  // across the book rather than taking the opening: the ending is where the
  // final episodes come from.
  const all = chunks ?? [];
  const budget = 140_000;
  const perChunk = Math.max(600, Math.floor(budget / Math.max(all.length, 1)));

  const text = all
    .map((c) => `[${c.n}] ${c.label ?? ""}\n${(c.summary ?? c.body).slice(0, perChunk)}`)
    .join("\n\n");

  const { data: refs } = await db
    .from("refs")
    .select("kind, name")
    .eq("series_id", seriesId)
    .eq("kind", "character");

  const cast = (refs ?? []).map((r) => r.name).join(", ");

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: `You are the showrunner breaking a novel into an episodic season.

Decide the episode count yourself, from the shape of the book. Count the real
turns — the moments after which the story cannot go back — and give each its own
episode. A book with six turns is a six-episode season; padding it to ten gives
you four episodes where nothing happens.

Each episode needs:

- A title that is an image or a phrase from the world, not a summary. "The Blue
  Umbrella", not "Thida Confronts Her Past".
- A premise of one or two sentences: what happens and what changes. Write what
  the episode DOES, not what it is about.
- Its own shape: an opening situation, a complication, and a close that leaves
  one thing unresolved. The last episode may resolve.

Target runtime is ${series.target_minutes} minutes per episode, which is roughly
12 to 15 scenes. If a turn is too small to carry that, fold it into a neighbour
rather than stretching it.

Also return your reasoning for the count in one short paragraph, so the
showrunner can disagree with it.

Write in English. Return JSON only, no fences, no commentary:
{
  "reasoning": "",
  "episodes": [{ "title": "", "premise": "" }]
}`,
    messages: [
      {
        role: "user",
        content: `Show: ${series.title}
${series.premise ? `Premise: ${series.premise}` : ""}

Bible:
${series.bible}

${cast ? `Cast: ${cast}` : ""}

Novel:

${text}`,
      },
    ],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");

  let parsed: { reasoning?: string; episodes?: { title: string; premise: string }[] };
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    throw new Error("The planner did not return valid JSON. Try again.");
  }

  const episodes = parsed.episodes ?? [];
  if (episodes.length === 0) throw new Error("The planner returned no episodes.");

  // Start numbering after whatever already exists, so a re-run adds rather
  // than colliding with episodes someone has already worked on.
  const { data: last } = await db
    .from("episodes")
    .select("n")
    .eq("series_id", seriesId)
    .order("n", { ascending: false })
    .limit(1)
    .maybeSingle();

  let n = (last?.n ?? 0) + 1;

  for (const ep of episodes) {
    const { error } = await db.from("episodes").insert({
      series_id: seriesId,
      n,
      title: ep.title,
      premise: ep.premise,
    });
    if (error) throw new Error(`Could not add episode ${n}: ${error.message}`);
    n++;
  }

  return {
    episodes: episodes.length,
    reasoning: parsed.reasoning ?? "",
    costUsd:
      (msg.usage.input_tokens / 1_000_000) * 3 + (msg.usage.output_tokens / 1_000_000) * 15,
  };
}
