import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * A show needs a project row underneath it for cost tracking, but the user
 * should never have to think about that -- so we make one silently.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { title, premise, renderStyle, targetMinutes } = await req.json();
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const db = createServiceClient();

  // Reuse a single internal client row for all in-house shows.
  let { data: client } = await db
    .from("clients").select("id").eq("name", "In-house").maybeSingle();

  if (!client) {
    const { data } = await db
      .from("clients").insert({ name: "In-house" }).select("id").single();
    client = data;
  }

  const { data: project, error: projectError } = await db
    .from("projects")
    .insert({
      client_id: client!.id,
      name: title,
      brief: premise ?? null,
      monthly_budget_usd: 500,
      monthly_video_quota: 2000,
    })
    .select("id")
    .single();

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });

  const { data: series, error } = await db
    .from("series")
    .insert({
      project_id: project.id,
      title,
      premise: premise || null,
      render_style: renderStyle || "2d_anime",
      target_minutes: targetMinutes ?? 15,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ seriesId: series.id });
}
