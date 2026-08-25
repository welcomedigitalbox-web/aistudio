import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Create a character, location, prop, or style reference. */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { seriesId, kind, name, description } = await req.json();
  if (!seriesId || !kind || !name) {
    return NextResponse.json({ error: "seriesId, kind and name are required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("refs")
    .insert({ series_id: seriesId, kind, name, description: description || null })
    .select("id")
    .single();

  if (error) {
    // unique(series_id, kind, name)
    if (error.code === "23505") {
      return NextResponse.json({ error: `A ${kind} called "${name}" already exists.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ refId: data.id });
}
