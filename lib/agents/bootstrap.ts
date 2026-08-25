import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { styleFragment } from "@/lib/stages";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";

/**
 * Read the novel and derive the show bible and the cast.
 *
 * Both are drafts. Nothing here is approved automatically -- a wrong character
 * description propagates into every image of that character for the whole
 * season, so it gets a human read before anything is generated from it.
 */

async function readSource(sourceId: string, maxChars = 120_000) {
  const db = createServiceClient();
  const { data: chunks } = await db
    .from("source_chunks")
    .select("n, label, summary, body")
    .eq("source_id", sourceId)
    .order("n");

  // Take from the front until the budget runs out. A novel's opening carries
  // most of the character and setting information; the ending carries plot we
  // do not need for a bible.
  const parts: string[] = [];
  let used = 0;
  for (const c of chunks ?? []) {
    const text = c.summary ?? c.body;
    if (used + text.length > maxChars) break;
    parts.push(`[${c.n}] ${c.label ?? ""}\n${text}`);
    used += text.length;
  }
  return parts.join("\n\n");
}

function parseJson(raw: string) {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  return JSON.parse(cleaned);
}

export async function draftBible(seriesId: string) {
  const db = createServiceClient();

  const { data: series } = await db
    .from("series")
    .select("id, title, premise, render_style, target_minutes, language, source_id")
    .eq("id", seriesId)
    .single();

  if (!series?.source_id) throw new Error("Add the novel first.");

  const text = await readSource(series.source_id);
  if (!text) throw new Error("The novel has no readable text yet.");

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: `You are the showrunner adapting a novel into an animated series.

Read the novel and write the show bible: the rules that hold across every
episode. This document is fed to every agent on every episode, so it has to be
specific enough to constrain them and short enough to include every time.

Four sections:

TONE — how the show feels and how emotion is carried. Name what the show does
instead of the obvious thing.

VISUAL LANGUAGE — concrete and specific. Palette, light, recurring objects,
textures, what the world is made of. This text goes into image prompts, so
"beautiful" and "cinematic" are useless; "wet pavement under sodium light" is
not. Draw the specifics from the novel's actual setting.

PACING — scene length, how scenes open and close, roughly how many per episode.

THE SHOW NEVER — the constraints. This section matters most: models drift toward
melodrama and exposition unless told not to. Write the rules that keep this
adaptation honest to the novel.

Write in English. Return JSON only, no fences, no commentary:
{ "bible": "Tone:\\n...\\n\\nVisual language:\\n...\\n\\nPacing:\\n...\\n\\nThe show never:\\n..." }`,
    messages: [
      {
        role: "user",
        content: `Title: ${series.title}
${series.premise ? `Premise: ${series.premise}` : ""}
Render style: ${styleFragment(series.render_style)}
Episode length: ${series.target_minutes} minutes.

Novel:

${text}`,
      },
    ],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = parseJson(raw);

  await db.from("series").update({ bible: parsed.bible }).eq("id", seriesId);

  return {
    costUsd:
      (msg.usage.input_tokens / 1_000_000) * 3 + (msg.usage.output_tokens / 1_000_000) * 15,
  };
}

export async function draftCast(seriesId: string) {
  const db = createServiceClient();

  const { data: series } = await db
    .from("series")
    .select("id, title, bible, render_style, source_id")
    .eq("id", seriesId)
    .single();

  if (!series?.source_id) throw new Error("Add the novel first.");
  if (!series.bible) throw new Error("Draft the bible first.");

  const text = await readSource(series.source_id);

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: `You are the character designer for an animated adaptation.

Read the novel and list the characters and the recurring locations. For each,
write a description that will be pasted VERBATIM into every image prompt for
that subject, for the whole season.

That constraint shapes how you write:

- Physical and concrete only. Age, build, hair, face, clothing, one or two
  distinguishing features. No personality, no backstory, no "kind eyes".
- Specific enough that two different readers would draw the same person.
- Under 40 words. Long descriptions dilute; the model drops the tail.
- Consistent vocabulary across characters, so they read as one cast.
- Include what they wear by default. Characters need a standing outfit or every
  shot dresses them differently.

Locations get the same treatment: what the space is made of, its light, its
state of repair.

Cover every character who appears in more than one scene, and skip the ones who
do not. A cast list of thirty is a cast list nobody will check.

Write in English. Return JSON only, no fences, no commentary:
{
  "characters": [{ "name": "", "description": "", "role": "lead | supporting | minor" }],
  "locations":  [{ "name": "", "description": "" }]
}`,
    messages: [
      {
        role: "user",
        content: `Show bible:
${series.bible}

Novel:

${text}`,
      },
    ],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = parseJson(raw);

  const rows = [
    ...(parsed.characters ?? []).map((c: any) => ({
      series_id: seriesId,
      kind: "character",
      name: c.name,
      description: c.description,
    })),
    ...(parsed.locations ?? []).map((l: any) => ({
      series_id: seriesId,
      kind: "location",
      name: l.name,
      description: l.description,
    })),
  ];

  // The style ref carries the series look into every prompt.
  rows.push({
    series_id: seriesId,
    kind: "style",
    name: "Show style",
    description: styleFragment(series.render_style),
  });

  // Insert one at a time so a single bad row cannot silently drop the rest,
  // and so a re-run updates instead of failing on the unique constraint.
  for (const row of rows) {
    const { error } = await db
      .from("refs")
      .upsert(row, { onConflict: "series_id,kind,name" });

    if (error) {
      // Older rows may predate the constraint; fall back to a plain update.
      const { error: updateError } = await db
        .from("refs")
        .update({ description: row.description })
        .eq("series_id", row.series_id)
        .eq("kind", row.kind)
        .eq("name", row.name);

      if (updateError) throw new Error(`Could not save ${row.name}: ${error.message}`);
    }
  }

  return {
    characters: (parsed.characters ?? []).length,
    locations: (parsed.locations ?? []).length,
    costUsd:
      (msg.usage.input_tokens / 1_000_000) * 3 + (msg.usage.output_tokens / 1_000_000) * 15,
  };
}
