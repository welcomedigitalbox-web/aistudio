import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { seriesId, bible } = await req.json();
  if (!seriesId) return NextResponse.json({ error: "seriesId is required." }, { status: 400 });

  const { error } = await supabase.from("series").update({ bible }).eq("id", seriesId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
