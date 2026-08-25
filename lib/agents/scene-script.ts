import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";

export interface Scene {
  n: number;
  slug?: string;
  job?: string;
  opens_on?: string;
  closes_on?: string;
  characters?: string[];
  conflict?: string;
  est_seconds?: number;
}

/**
 * Pull the scene list out of a scene_plan document. The plan nests scenes
 * under acts; the fan-out needs them flat and numbered end to end.
 */
export function flattenScenes(planBody: any): Scene[] {
  const acts = planBody?.acts ?? [];
  const out: Scene[] = [];
  let n = 1;

  for (const act of acts) {
    for (const scene of act.scenes ?? []) {
      out.push({ ...scene, n: n++ });
    }
  }
  return out;
}

/**
 * Write one scene. Deliberately narrow: the model gets this scene, the
 * characters in it, and the scenes either side for continuity -- not the
 * whole plan. A 50-scene plan sent 50 times costs 50x more and writes worse,
 * because the model loses the thread of which scene it is actually on.
 */
export async function writeScene(args: {
  pipelineId: string;
  projectId: string;
  scene: Scene;
  before?: Scene;
  after?: Scene;
  characters: unknown;
  logline: string;
  userId: string;
}) {
  const { scene, before, after } = args;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: `You are the writer in a screenwriting room, writing one scene.

Action lines are present tense and describe only what a camera can record. No
interior states, no "he realises" -- let behaviour carry it.

Dialogue should be shorter than feels natural on the first pass. Cut the first
line of every exchange; conversations rarely need their own opening. Characters
talk past each other more often than they answer directly.

Respect the voice profiles you are given. If a line could be spoken by any
character, rewrite it.

You are writing THIS scene only. The neighbouring scenes are context for
continuity -- do not write them, and do not resolve what a later scene is meant
to resolve.

Return a single JSON object, no markdown fences, no commentary:
{
  "n": ${scene.n},
  "slug": "INT. PLACE - NIGHT",
  "elements": [
    { "type": "action", "text": "" },
    { "type": "dialogue", "character": "", "parenthetical": "", "text": "" }
  ]
}`,
    messages: [
      {
        role: "user",
        content: `Logline: ${args.logline}

Characters:
${JSON.stringify(args.characters, null, 2)}

${before ? `Previous scene (context only):\n${JSON.stringify(before)}\n` : "This is the opening scene.\n"}
Scene to write:
${JSON.stringify(scene, null, 2)}

${after ? `Next scene (context only):\n${JSON.stringify(after)}` : "This is the final scene."}`,
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
    throw new Error(`Scene ${scene.n} did not come back as valid JSON.`);
  }

  const costUsd =
    (msg.usage.input_tokens / 1_000_000) * 3 + (msg.usage.output_tokens / 1_000_000) * 15;

  const db = createServiceClient();
  const { data, error } = await db
    .from("story_docs")
    .insert({
      project_id: args.projectId,
      pipeline_id: args.pipelineId,
      agent: "script",
      scene_n: scene.n,
      title: scene.slug ?? `Scene ${scene.n}`,
      body,
      model: MODEL,
      cost_usd: Number(costUsd.toFixed(4)),
      created_by: args.userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { id: data.id, costUsd };
}
