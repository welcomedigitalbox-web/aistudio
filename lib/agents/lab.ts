import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";

const ROLE_BRIEF: Record<string, string> = {
  spine: "THE SPINE. The story's backbone comes from here: its central want, its shape, its ending.",
  character: "CHARACTER SOURCE. Draw people from here — how they want, how they fail, how they speak. Not the plot.",
  setting: "SETTING SOURCE. Draw the world from here — place, period, texture, the physical facts of daily life. Not the plot.",
  voice: "VOICE REFERENCE. Style only: sentence rhythm, how scenes open and close, what is left unsaid. Take no events, no characters, no places from this one.",
  free: "GENERAL SOURCE. Use as you judge best.",
};

async function loadSources(labId: string, perSourceChars = 40_000) {
  const db = createServiceClient();

  const { data: links } = await db
    .from("lab_sources")
    .select("role, note, source_id, sources(id, title, author)")
    .eq("lab_id", labId);

  if (!links?.length) throw new Error("Add at least one source first.");

  const blocks: string[] = [];
  for (const link of links) {
    const s = link.sources as any;
    const { data: chunks } = await db
      .from("source_chunks")
      .select("n, label, summary, body")
      .eq("source_id", link.source_id)
      .order("n");

    let used = 0;
    const parts: string[] = [];
    for (const c of chunks ?? []) {
      const text = c.summary ?? c.body;
      if (used + text.length > perSourceChars) break;
      parts.push(`[${c.n}] ${c.label ?? ""}\n${text}`);
      used += text.length;
    }

    blocks.push(
      `## ${s.title}${s.author ? ` — ${s.author}` : ""}\n${ROLE_BRIEF[link.role]}${
        link.note ? `\nWriter's note: ${link.note}` : ""
      }\n\n${parts.join("\n\n")}`
    );
  }

  return blocks.join("\n\n---\n\n");
}

function parse(raw: string, what: string) {
  try {
    return JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    throw new Error(`The ${what} pass did not return valid JSON. Try again.`);
  }
}

function costOf(usage: { input_tokens: number; output_tokens: number }) {
  return (usage.input_tokens / 1_000_000) * 3 + (usage.output_tokens / 1_000_000) * 15;
}

/**
 * Premise: what the combined story actually is.
 *
 * Deliberately its own step. Asked to merge several books in one pass, a model
 * averages them and produces something that is none of them. Naming the story
 * first — in three sentences a person can reject — forces a choice.
 */
export async function draftPremise(labId: string, note?: string) {
  const db = createServiceClient();
  const { data: lab } = await db.from("lab_projects").select("*").eq("id", labId).single();
  if (!lab) throw new Error("Lab project not found.");

  const sources = await loadSources(labId);

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `You are a novelist building one new story out of several sources.

Each source below carries a role. Respect it: take the backbone only from the
spine, people only from the character sources, world only from the setting
sources, and from a voice reference take nothing but style.

This is not a summary of the sources and not a mash-up. It is a new story that
could only exist because these particular sources met. Name the thing it is
about that none of them was about alone.

Return a premise a person can argue with: who wants what, what stands in the
way, and what the story is actually about underneath that. Three or four
sentences. Then say plainly what you took from where, so the writer can tell
you that you took the wrong thing.

Return JSON only, no fences:
{ "premise": "", "took": [{ "from": "source title", "what": "" }], "risks": ["where this combination might not hold"] }`,
    messages: [
      {
        role: "user",
        content: `Working title: ${lab.title}
${lab.brief ? `What the writer is after:\n${lab.brief}` : ""}
${note ? `\nNote for this pass:\n${note}` : ""}

Sources:

${sources}`,
      },
    ],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = parse(raw, "premise");
  const cost = costOf(msg.usage);

  await db
    .from("lab_projects")
    .update({
      premise: parsed.premise,
      state: "premise",
      cost_usd: Number(lab.cost_usd) + cost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", labId);

  return { premise: parsed.premise, took: parsed.took ?? [], risks: parsed.risks ?? [], costUsd: cost };
}

/**
 * Outline: chapters, each with a summary. Structure only.
 */
export async function draftOutline(labId: string, note?: string) {
  const db = createServiceClient();
  const { data: lab } = await db.from("lab_projects").select("*").eq("id", labId).single();
  if (!lab) throw new Error("Lab project not found.");
  if (!lab.premise) throw new Error("Draft the premise first.");

  const sources = await loadSources(labId, 20_000);

  const wordTarget = lab.target_words ?? (lab.output === "treatment" ? 8_000 : 60_000);
  const chapters = lab.output === "treatment" ? "8 to 12" : "16 to 24";

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: `You are outlining a novel from an agreed premise.

Give ${chapters} chapters. Each needs a summary of what happens and what changes
— not what it is about. A chapter that opens and closes on the same situation is
not a chapter; fold it into its neighbour.

The premise is settled. Do not re-invent it. Your job is the shape: where the
turns fall, what is withheld and for how long, what the ending costs.

Target length is roughly ${wordTarget.toLocaleString()} words in total, so size
the chapters accordingly.

Return JSON only, no fences:
{
  "chapters": [{ "n": 1, "title": "", "summary": "" }],
  "withheld": ["what the reader does not learn until late, and when"]
}`,
    messages: [
      {
        role: "user",
        content: `Title: ${lab.title}

Premise:
${lab.premise}

${note ? `Note for this pass:\n${note}\n` : ""}
Sources (for texture and continuity):

${sources}`,
      },
    ],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = parse(raw, "outline");
  const list = parsed.chapters ?? [];
  if (list.length === 0) throw new Error("The outline came back empty.");

  const cost = costOf(msg.usage);

  await db.from("lab_chapters").delete().eq("lab_id", labId);
  const { error } = await db.from("lab_chapters").insert(
    list.map((c: any, i: number) => ({
      lab_id: labId,
      n: i + 1,
      title: c.title ?? null,
      summary: c.summary ?? null,
    }))
  );
  if (error) throw new Error(`Could not save the outline: ${error.message}`);

  await db
    .from("lab_projects")
    .update({
      outline: parsed,
      state: "outline",
      cost_usd: Number(lab.cost_usd) + cost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", labId);

  return { chapters: list.length, withheld: parsed.withheld ?? [], costUsd: cost };
}

/**
 * Write one chapter. Neighbours for continuity, not the whole outline.
 */
export async function writeChapter(chapterId: string, note?: string) {
  const db = createServiceClient();

  const { data: chapter } = await db.from("lab_chapters").select("*").eq("id", chapterId).single();
  if (!chapter) throw new Error("Chapter not found.");

  const { data: lab } = await db.from("lab_projects").select("*").eq("id", chapter.lab_id).single();
  if (!lab) throw new Error("Lab project not found.");

  const { data: neighbours } = await db
    .from("lab_chapters")
    .select("n, title, summary")
    .eq("lab_id", chapter.lab_id)
    .in("n", [chapter.n - 1, chapter.n + 1]);

  // The previous chapter's closing paragraphs, so the seam holds.
  const { data: previous } = await db
    .from("lab_chapters")
    .select("body")
    .eq("lab_id", chapter.lab_id)
    .eq("n", chapter.n - 1)
    .maybeSingle();

  const tail = previous?.body ? previous.body.slice(-1500) : "";

  // Voice references shape how this reads; nothing else from them is used.
  const { data: voices } = await db
    .from("lab_sources")
    .select("note, sources(title)")
    .eq("lab_id", chapter.lab_id)
    .eq("role", "voice");

  const isTreatment = lab.output === "treatment";
  const words = isTreatment ? 600 : 2500;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: isTreatment ? 2000 : 6000,
    system: `You are writing ONE chapter of a novel.

${
  isTreatment
    ? "This is a treatment: present tense, compressed, scene by scene. Describe what happens and what it looks like. Dialogue only where a line matters."
    : "This is prose. Scene, not summary. Let behaviour carry interiority; state feeling only when a character would state it themselves."
}

Around ${words} words.

The neighbouring chapters are context for continuity. Do not write them, and do
not resolve what a later chapter is meant to resolve.

${
  voices?.length
    ? `Voice references were chosen for this book: ${voices
        .map((v) => (v.sources as any)?.title)
        .join(", ")}. Match their rhythm and their reticence — take nothing else from them.`
    : ""
}

Return the chapter text only. No title, no headings, no commentary.`,
    messages: [
      {
        role: "user",
        content: `Book: ${lab.title}

Premise:
${lab.premise}

${tail ? `End of the previous chapter:\n\n...${tail}\n` : "This is the opening chapter.\n"}
Chapter to write:
${chapter.n}. ${chapter.title ?? ""}
${chapter.summary ?? ""}

${
  (neighbours ?? []).find((c) => c.n === chapter.n + 1)
    ? `Next chapter (do not write it):\n${JSON.stringify(
        (neighbours ?? []).find((c) => c.n === chapter.n + 1)
      )}`
    : "This is the final chapter."
}

${note ? `\nNote for this pass:\n${note}` : ""}`,
      },
    ],
  });

  const body = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const cost = costOf(msg.usage);

  const { error } = await db
    .from("lab_chapters")
    .update({ body, cost_usd: Number(chapter.cost_usd) + cost })
    .eq("id", chapterId);
  if (error) throw new Error(error.message);

  await db.from("lab_projects").update({ state: "drafting" }).eq("id", chapter.lab_id);

  return { n: chapter.n, words: body.split(/\s+/).length, costUsd: cost };
}

/**
 * Export: assemble the chapters into a source row the Studio can read, with
 * one chunk per chapter — the same shape a PDF upload produces.
 */
export async function exportToStudio(labId: string) {
  const db = createServiceClient();

  const { data: lab } = await db.from("lab_projects").select("*").eq("id", labId).single();
  if (!lab) throw new Error("Lab project not found.");

  const { data: chapters } = await db
    .from("lab_chapters")
    .select("n, title, body")
    .eq("lab_id", labId)
    .order("n");

  const written = (chapters ?? []).filter((c) => c.body);
  if (written.length === 0) throw new Error("Write at least one chapter first.");
  if (written.length < (chapters ?? []).length) {
    throw new Error(
      `${(chapters ?? []).length - written.length} chapters are still unwritten. Finish or delete them.`
    );
  }

  // The exported work is the team's own: they wrote the brief, chose the
  // sources, and approved every chapter.
  const { data: source, error } = await db
    .from("sources")
    .insert({
      lab_id: labId,
      title: lab.title,
      basis: "own",
      basis_note: "Written in Story Lab",
      storage_key: `lab/${labId}.txt`,
      state: "ready",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const rows = written.map((c) => ({
    source_id: source.id,
    n: c.n,
    label: c.title ?? `Chapter ${c.n}`,
    body: c.body!,
    chars: c.body!.length,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const { error: chunkError } = await db.from("source_chunks").insert(rows.slice(i, i + 50));
    if (chunkError) throw new Error(`Could not save chapter ${i}: ${chunkError.message}`);
  }

  await db
    .from("lab_projects")
    .update({ exported_source_id: source.id, state: "ready" })
    .eq("id", labId);

  return { sourceId: source.id, chapters: written.length };
}
