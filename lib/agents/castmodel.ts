import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { CLIP_MODELS } from "@/lib/production/models";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";

/**
 * Choose a video model for every shot in an episode.
 *
 * Per shot rather than per batch, because the unit of the decision is the
 * shot: a candle flame and a crowd turning want different models, and paying
 * the crowd rate for the flame is money spent on nothing.
 *
 * The suggestion carries its reason. A person disagreeing with a choice
 * should be able to disagree with the argument, not just the answer.
 */
export async function suggestModels(episodeId: string, note?: string) {
  const db = createServiceClient();

  const { data: shots } = await db
    .from("shots")
    .select("id, n, scene_n, framing, visual, motion, target_seconds, ref_ids")
    .eq("episode_id", episodeId)
    .order("n");

  if (!shots?.length) throw new Error("No shots to cast.");

  const catalogue = Object.entries(CLIP_MODELS)
    .map(([id, m]: [string, any]) => `${id} — ${m.label}, ~$${m.usdPer5s.toFixed(2)}/5s`)
    .join("\n");

  const list = shots
    .map(
      (s) =>
        `${s.n} | scene ${s.scene_n} | ${s.framing} | ${s.target_seconds}s | ` +
        `${(s.ref_ids ?? []).length} refs\n` +
        `   visual: ${String(s.visual).slice(0, 220)}\n` +
        `   motion: ${String(s.motion ?? "").slice(0, 160)}`
    )
    .join("\n\n");

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: `You are the post supervisor assigning each shot to a video model.

What the models are actually good and bad at:

- Cheap models (Wan, Kling 1.6) handle materials, weather, smoke, water,
  cloth and light. They are poor at people moving.
- Kling 3.0 handles human movement, crowds and camera motion, and generates
  its own audio. It costs four times the cheap tier.
- Veo 3.1 is the most capable and the most expensive. It earns its price only
  on a shot the episode rests on.
- 4K tiers are for shots that will be held on screen or seen large. A
  three-second cutaway does not need them.

Assign by what the shot contains, not by how important it feels:

- Nothing moves but air, light, water, fabric or smoke -> the cheap tier.
- A person moves, a crowd turns, the camera travels -> the mid tier.
- The shot carries the scene's turn, or the whole episode -> the top tier,
  and only two or three of those in an episode.

Spending the top tier everywhere is the same mistake as spending it nowhere.
A sensible episode is mostly cheap, some mid, and two or three expensive.

Return JSON only, no fences:
{ "shots": [{ "n": 1, "model": "<id>", "reason": "one short sentence" }] }

Use only these model ids:
${catalogue}`,
    messages: [
      {
        role: "user",
        content: `Shots:\n\n${list}${note ? `\n\nNote from the director:\n${note}` : ""}`,
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
        ? "The casting ran past the token limit. Try an episode with fewer shots."
        : `Casting did not return valid JSON. It began: ${raw.slice(0, 200)}`
    );
  }

  const byN = new Map(shots.map((s) => [s.n, s.id]));
  const valid = new Set(Object.keys(CLIP_MODELS));
  let applied = 0;
  const unknown: string[] = [];

  for (const row of parsed.shots ?? []) {
    const id = byN.get(row.n);
    if (!id) continue;

    // A model the catalogue does not contain would fail at generate time, a
    // long way from here. Drop it and say so.
    if (!valid.has(row.model)) {
      unknown.push(row.model);
      continue;
    }

    await db
      .from("shots")
      .update({
        suggested_model: row.model,
        suggested_reason: row.reason ?? null,
        model_approved: false,
      })
      .eq("id", id);

    applied++;
  }

  const cost =
    (msg.usage.input_tokens / 1_000_000) * 3 + (msg.usage.output_tokens / 1_000_000) * 15;

  // What the cast would cost to shoot, so the choice can be argued with
  // before anything is spent.
  const { data: after } = await db
    .from("shots")
    .select("suggested_model, target_seconds")
    .eq("episode_id", episodeId);

  const estimate = (after ?? []).reduce((t, s: any) => {
    const spec = (CLIP_MODELS as any)[s.suggested_model];
    if (!spec) return t;
    return t + spec.usdPer5s * (Number(s.target_seconds) > 7 ? 2 : 1);
  }, 0);

  return {
    applied,
    unknown: [...new Set(unknown)],
    estimatedCostUsd: Number(estimate.toFixed(2)),
    costUsd: Number(cost.toFixed(4)),
  };
}
