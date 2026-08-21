import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { estimateCost } from "@/lib/adapters";
import { checkBudget } from "@/lib/budget";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { assetId, model, prompt, params } = await req.json();
  if (!assetId || !model || !prompt) {
    return NextResponse.json({ error: "assetId, model and prompt are required." }, { status: 400 });
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, kind, project_id")
    .eq("id", assetId)
    .single();
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  const estimate = estimateCost(model, params ?? {});
  const verdict = await checkBudget(asset.project_id, asset.kind, estimate);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason, budget: verdict }, { status: 402 });
  }

  const db = createServiceClient();
  const { data: job, error } = await db
    .from("generation_jobs")
    .insert({
      asset_id: asset.id,
      provider: model.startsWith("claude") ? "anthropic" : "fal",
      model,
      request: { prompt, params: params ?? {} },
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await inngest.send({
    name: "studio/generate.requested",
    data: {
      jobId: job.id,
      assetId: asset.id,
      projectId: asset.project_id,
      kind: asset.kind,
      model,
      prompt,
      params: params ?? {},
      userId: user.id,
    },
  });

  return NextResponse.json({ jobId: job.id, estimatedCostUsd: estimate });
}
