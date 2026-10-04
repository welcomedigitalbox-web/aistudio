import { NextResponse } from "next/server";
import * as fal from "@fal-ai/serverless-client";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anglesFor } from "@/lib/refs/angles";
import { buildRefPrompt, makeSeed } from "@/lib/refs/prompt";

fal.config({ credentials: process.env.FAL_KEY! });

// The first angle of a new character is generated inline so the rest can be
// locked to its face. Nano Banana Pro takes 15-40s.
export const maxDuration = 120;

type Sizing = "image_size" | "aspect_ratio";

/**
 * Verify these against fal.ai/models before trusting the cost estimate.
 * `edit` is the reference-aware twin: given one approved face, it draws the
 * same person from another angle instead of inventing a new one.
 */
const MODELS: Record<string, { id: string; edit?: string; usd: number; sizing: Sizing; pro?: boolean }> = {
  fast: { id: "fal-ai/flux/schnell", usd: 0.003, sizing: "image_size" },
  seedream: { id: "fal-ai/bytedance/seedream/v4/text-to-image", edit: "fal-ai/bytedance/seedream/v4/edit", usd: 0.03, sizing: "image_size" },
  nano: { id: "fal-ai/nano-banana", edit: "fal-ai/nano-banana/edit", usd: 0.04, sizing: "aspect_ratio" },
  grok_text: { id: "xai/grok-imagine-image/v2.0/text-to-image", usd: 0.04, sizing: "aspect_ratio" },
  grok_image: { id: "xai/grok-imagine-image/v2.0/text-to-image", edit: "xai/grok-imagine-image/v2.0/edit", usd: 0.05, sizing: "aspect_ratio" },
  ultra: { id: "fal-ai/flux-pro/v1.1-ultra", usd: 0.06, sizing: "aspect_ratio" },
  nano_pro: { id: "fal-ai/nano-banana-pro", edit: "fal-ai/nano-banana-pro/edit", usd: 0.15, sizing: "aspect_ratio", pro: true },
};

/** Old clients still send these. Flux dev is licence-blocked on commercial keys. */
const ALIASES: Record<string, string> = { quality: "nano_pro", flux: "nano_pro" };

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json();
  const { refId, angles: onlyAngles } = body;
  const model = ALIASES[body.model] ?? body.model ?? "nano_pro";
  if (!refId) return NextResponse.json({ error: "refId is required." }, { status: 400 });

  const spec = MODELS[model];
  if (!spec) return NextResponse.json({ error: `Unknown model: ${model}` }, { status: 400 });

  const db = createServiceClient();

  const { data: ref } = await db
    .from("refs")
    .select("id, kind, name, description, seed, series_id, chosen_image_id")
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
  const base = process.env.R2_PUBLIC_BASE_URL ?? "";
  const created: string[] = [];

  const { data: series } = await db
    .from("series").select("render_style").eq("id", ref.series_id).maybeSingle();
  const liveAction = series?.render_style === "live_action";

  const sizeInput = (): Record<string, unknown> => {
    if (spec.sizing === "image_size") {
      return {
        image_size:
          ref.kind === "character" ? { width: 1080, height: 1440 } : { width: 1920, height: 1080 },
      };
    }
    const out: Record<string, unknown> = { aspect_ratio: ref.kind === "character" ? "3:4" : "16:9" };
    if (spec.pro) out.resolution = "2K";
    if (spec.id.includes("flux-pro/v1.1-ultra") && liveAction) out.raw = true;
    return out;
  };

  /**
   * The face anchor: the art already chosen for this reference, else its
   * newest finished front view. Every other angle is drawn from it, so the
   * profile is the same man as the front rather than his cousin.
   */
  let anchorUrl: string | null = null;
  if (spec.edit && ref.kind === "character") {
    const { data: anchor } = ref.chosen_image_id
      ? await db.from("ref_images").select("storage_key").eq("id", ref.chosen_image_id).maybeSingle()
      : await db
          .from("ref_images")
          .select("storage_key")
          .eq("ref_id", refId)
          .eq("angle", "front")
          .eq("state", "ready")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
    if (anchor?.storage_key) anchorUrl = `${base}/${anchor.storage_key}`;
  }

  async function queueAngle(angle: (typeof angles)[number], waitForResult: boolean) {
    const useEdit = Boolean(spec.edit && anchorUrl && angle.id !== "front");
    const prompt = buildRefPrompt({
      styleFragment: styleRef?.description ?? "",
      name: ref!.name,
      description: useEdit
        ? `the exact same person as in the reference image, identical face, hairstyle, skin tone and outfit. ${ref!.description}`
        : ref!.description!,
      angleFragment: angle.fragment,
      kind: ref!.kind,
    });
    const endpoint = useEdit ? spec.edit! : spec.id;

    // Row first, so the webhook has something to land on.
    const { data: row, error } = await db
      .from("ref_images")
      .insert({ ref_id: refId, angle: angle.id, prompt, model: endpoint, cost_usd: spec.usd, state: "queued" })
      .select("id")
      .single();
    if (error || !row) return null;

    const input: Record<string, unknown> = { prompt, seed, num_images: 1 };
    // Seedream's edit endpoint takes a size; the other edit endpoints take a ratio.
    Object.assign(input, sizeInput());
    if (useEdit) input.image_urls = [anchorUrl];

    try {
      const opts = { input, webhookUrl: `${webhookUrl}?image=${row.id}` };
      if (waitForResult) {
        let requestId = "";
        const out: any = await fal.subscribe(endpoint, {
          ...opts,
          onEnqueue: (id: string) => { requestId = id; },
        });
        await db.from("ref_images").update({ provider_job_id: requestId, state: "running" }).eq("id", row.id);
        created.push(row.id);
        // The webhook stores the file; we only need the URL to anchor the rest.
        return (out?.images?.[0]?.url ?? out?.data?.images?.[0]?.url ?? null) as string | null;
      }
      const { request_id } = await fal.queue.submit(endpoint, opts);
      await db.from("ref_images").update({ provider_job_id: request_id, state: "running" }).eq("id", row.id);
      created.push(row.id);
    } catch (e) {
      await db.from("ref_images").update({ state: "failed", error: (e as Error).message }).eq("id", row.id);
    }
    return null;
  }

  // No face yet: draw the front first, wait for it, then lock the rest to it.
  const front = angles.find((a) => a.id === "front");
  const rest = angles.filter((a) => a !== front);
  if (front && spec.edit && ref.kind === "character" && !anchorUrl && rest.length > 0) {
    anchorUrl = await queueAngle(front, true);
  } else if (front) {
    await queueAngle(front, false);
  }
  for (const angle of rest) await queueAngle(angle, false);

  return NextResponse.json({
    queued: created.length,
    estimatedCostUsd: Number((created.length * spec.usd).toFixed(4)),
  });
}
