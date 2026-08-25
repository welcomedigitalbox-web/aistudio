import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { AGENTS, type AgentKind } from "./prompts";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";

export interface RunInput {
  projectId: string;
  agent: AgentKind;
  title: string;
  /** the writer's own brief, in their words */
  brief: string;
  /** story_docs rows to feed in as context */
  parentIds?: string[];
  /** sources to pull summaries from */
  sourceIds?: string[];
  userId: string;
}

/**
 * Build the context block. Agents read distilled summaries, not raw chapters --
 * a novel is ~150k tokens and would cost roughly 25x more per call.
 */
async function buildContext(input: RunInput) {
  const db = createServiceClient();
  const parts: string[] = [];

  if (input.parentIds?.length) {
    const { data } = await db
      .from("story_docs")
      .select("agent, title, body")
      .in("id", input.parentIds);

    for (const d of data ?? []) {
      parts.push(`## ${d.agent} — ${d.title}\n${JSON.stringify(d.body, null, 2)}`);
    }
  }

  if (input.sourceIds?.length) {
    const { data: sources } = await db
      .from("sources")
      .select("id, title, author, basis")
      .in("id", input.sourceIds);

    for (const s of sources ?? []) {
      const { data: chunks } = await db
        .from("source_chunks")
        .select("n, label, summary, body")
        .eq("source_id", s.id)
        .order("n");

      // Prefer summaries; fall back to a truncated body if none exist yet.
      const text = (chunks ?? [])
        .map((c) => `[${c.n}] ${c.label ?? ""}\n${c.summary ?? c.body.slice(0, 1200)}`)
        .join("\n\n");

      parts.push(`## Source — ${s.title}${s.author ? ` (${s.author})` : ""}\n${text}`);
    }
  }

  return parts.join("\n\n---\n\n");
}

export async function runAgent(input: RunInput) {
  const spec = AGENTS[input.agent];
  const context = await buildContext(input);

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: spec.maxTokens,
    system: `${spec.system}

Return a single JSON object matching this shape exactly. No preamble, no
markdown fences, no commentary — JSON only:

${spec.schema}`,
    messages: [
      {
        role: "user",
        content: [
          context && `Context from earlier stages:\n\n${context}`,
          `Brief from the writer:\n\n${input.brief}`,
        ]
          .filter(Boolean)
          .join("\n\n---\n\n"),
      },
    ],
  });

  const raw = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  let body: unknown;
  try {
    body = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
  } catch {
    throw new Error("The agent did not return valid JSON. Try running it again.");
  }

  const usage = msg.usage;
  const costUsd =
    (usage.input_tokens / 1_000_000) * 3 + (usage.output_tokens / 1_000_000) * 15;

  const db = createServiceClient();
  const { data, error } = await db
    .from("story_docs")
    .insert({
      project_id: input.projectId,
      agent: input.agent,
      title: input.title,
      body,
      parent_id: input.parentIds?.[0] ?? null,
      source_ids: input.sourceIds ?? [],
      model: MODEL,
      cost_usd: Number(costUsd.toFixed(4)),
      created_by: input.userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { id: data.id, costUsd };
}
