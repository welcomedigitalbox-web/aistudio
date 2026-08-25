import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { refId, name, description, remove } = await req.json();
  if (!refId) return NextResponse.json({ error: "refId is required." }, { status: 400 });

  if (remove) {
    const { error } = await supabase.from("refs").delete().eq("id", refId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, string> = {};
  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  if (typeof description === "string") patch.description = description;

  const { error } = await supabase.from("refs").update(patch).eq("id", refId);
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Another reference already uses that name." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
