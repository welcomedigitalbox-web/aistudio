import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { flattenScenes } from "@/lib/agents/scene-script";

/** Rough guard so nobody approves a 50-scene run without seeing the number. */
const PER_SCENE_ESTIMATE = 0.06;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { pipelineId, action } = await req.json();
  const db = createServiceClient();

  const { data: pipeline } = await db
    .from("pipelines")
    .select("id, project_id, state, plan_id")
    .eq("id", pipelineId)
    .single();

  if (!pipeline) return NextResponse.json({ error: "Pipeline not found." }, { status: 404 });
  if (pipeline.state !== "awaiting_approval") {
    return NextResponse.json(
      { error: `This run is ${pipeline.state}, not waiting for approval.` },
      { status: 409 }
    );
  }

  if (action === "cancel") {
    await db.from("pipelines").update({ state: "cancelled", stage: "Cancelled" }).eq("id", pipelineId);
    return NextResponse.json({ ok: true });
  }

  const { data: plan } = await db
    .from("story_docs").select("body").eq("id", pipeline.plan_id!).single();
  const scenes = flattenScenes(plan?.body);

  await inngest.send({
    name: "studio/pipeline.approved",
    data: { pipelineId, projectId: pipeline.project_id, userId: user.id },
  });

  return NextResponse.json({
    scenes: scenes.length,
    estimatedCostUsd: Number((scenes.length * PER_SCENE_ESTIMATE).toFixed(2)),
  });
}
