import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { projectId, brief, sourceIds } = await req.json();
  if (!projectId || !brief) {
    return NextResponse.json({ error: "projectId and brief are required." }, { status: 400 });
  }

  const db = createServiceClient();

  // One run at a time per project. Two pipelines writing the same story is
  // never what anyone wanted.
  const { data: active } = await db
    .from("pipelines")
    .select("id")
    .eq("project_id", projectId)
    .in("state", ["running", "awaiting_approval", "writing"])
    .maybeSingle();

  if (active) {
    return NextResponse.json(
      { error: "This project already has a run in progress. Finish or cancel it first." },
      { status: 409 }
    );
  }

  const { data: pipeline, error } = await db
    .from("pipelines")
    .insert({
      project_id: projectId,
      brief,
      source_ids: sourceIds ?? [],
      stage: "Starting",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await inngest.send({
    name: "studio/pipeline.started",
    data: { pipelineId: pipeline.id, projectId, brief, sourceIds: sourceIds ?? [], userId: user.id },
  });

  return NextResponse.json({ pipelineId: pipeline.id });
}
