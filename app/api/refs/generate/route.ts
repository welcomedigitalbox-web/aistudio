import { NextResponse } from "next/server";
import * as fal from "@fal-ai/serverless-client";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anglesFor } from "@/lib/refs/angles";
import { buildRefPrompt, makeSeed } from "@/lib/refs/prompt";

fal.config({ credentials: process.env.FAL_KEY! });

export const maxDuration = 60;

/** Verify these against fal.ai/models before trusting the cost estimate. */
const MODELS: Record<string, { id: string; usd: number }> = {
  fast: { id: "fal-ai/flux/schnell", usd: 0.003 },
  quality: { id: "fal-ai/flux/dev", usd: 0.025 },
  seedream: { id: "fal-ai/bytedance/seedream/v3/text-to-image", usd: 0.03 },
};

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { refId, model = "quality", angles: onlyAngles } = await req.json();
  if (!refId) return NextResponse.json({ error: "refId is required." }, { status: 400 });

  const spec = MODELS[model];
  if (!spec) return NextResponse.json({ error: `Unknown model: ${model}` }, { status: 400 });

  const db = createServiceClient();

  const { data: ref } = await db
    .from("refs")
    .select("id, kind, name, description, seed, series_id")
    .eq("id", refId)
    .single();

  if (!ref) return NextResponse.json({ error: "Reference not found." }, { status: 404 });
  if (!ref.description) {
    return NextResponse.json(
      { error: "Write the description first — it is what every angle shares." },
      { status: 400 }
    );
  }

  // The series style ref, if one exists, leads every prompt.
  const { data: styleRef } = await db
    .from("refs")
    .select("description")
    .eq("series_id", ref.series_id)
    .eq("kind", "style")
    .limit(1)
    .maybeSingle();

  // One seed per reference, reused across angles and across regenerations.
  let seed = ref.seed;
  if (!seed) {
    seed = makeSeed();
    await db.from("refs").update({ seed }).eq("id", refId);
  }

  const all = anglesFor(ref.kind);
  const angles = onlyAngles?.length
    ? all.filter((a) => onlyAngles.includes(a.id))
    : all;

  if (angles.length === 0) {
    return NextResponse.json({ error: "No angles apply to this reference kind." }, { status: 400 });
  }

  const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal-ref`;
  const created: string[] = [];

  for (const angle of angles) {
    const prompt = buildRefPrompt({
      styleFragment: styleRef?.description ?? "",
      name: ref.name,
      description: ref.description,
      angleFragment: angle.fragment,
      kind: ref.kind,
    });

    // Row first, so the webhook has something to land on.
    const { data: row, error } = await db
      .from("ref_images")
      .insert({
        ref_id: refId,
        angle: angle.id,
        prompt,
        model: spec.id,
        cost_usd: spec.usd,
        state: "queued",
      })
      .select("id")
      .single();

    if (error) continue;

    try {
      const { request_id } = await fal.queue.submit(spec.id, {
        input: {
          prompt,
          seed,
          image_size: ref.kind === "character" ? "portrait_4_3" : "landscape_16_9",
          num_images: 1,
        },
        webhookUrl: `${webhookUrl}?image=${row.id}`,
      });

      await db
        .from("ref_images")
        .update({ provider_job_id: request_id, state: "running" })
        .eq("id", row.id);

      created.push(row.id);
    } catch (e) {
      await db
        .from("ref_images")
        .update({ state: "failed", error: (e as Error).message })
        .eq("id", row.id);
    }
  }

  return NextResponse.json({
    queued: created.length,
    estimatedCostUsd: Number((created.length * spec.usd).toFixed(4)),
  });
}
