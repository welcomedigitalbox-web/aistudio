import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { projectId, title, premise, bible, targetMinutes, language } = await req.json();
  if (!projectId || !title) {
    return NextResponse.json({ error: "projectId and title are required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("series")
    .insert({
      project_id: projectId,
      title,
      premise: premise || null,
      bible: bible || null,
      target_minutes: targetMinutes ?? 15,
      language: language || "en",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ seriesId: data.id });
}
