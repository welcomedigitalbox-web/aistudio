import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { seriesId, title, premise } = await req.json();
  if (!seriesId || !title) {
    return NextResponse.json({ error: "seriesId and title are required." }, { status: 400 });
  }

  // Episode numbers are sequential per series.
  const { data: last } = await supabase
    .from("episodes")
    .select("n")
    .eq("series_id", seriesId)
    .order("n", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("episodes")
    .insert({
      series_id: seriesId,
      n: (last?.n ?? 0) + 1,
      title,
      premise: premise || null,
    })
    .select("id, n")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ episodeId: data.id, n: data.n });
}
