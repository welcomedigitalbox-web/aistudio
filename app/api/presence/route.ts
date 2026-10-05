import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * A heartbeat, every 30 seconds, from a tab that is visible.
 *
 * The bucket is computed in the database from now(), not from anything the
 * client sends, so a doctored clock buys nobody a longer day.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { labId = null, seriesId = null, state = "active" } = await req.json().catch(() => ({}));

  const { error } = await supabase.rpc("record_ping", {
    p_lab: labId,
    p_series: seriesId,
    p_state: state === "idle" ? "idle" : "active",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Who is in the app right now, for the green dots.
 *
 * online = a ping in the last 90 seconds (three missed heartbeats and you are
 * gone). active = that ping saw a keystroke or click in the last minute;
 * otherwise the tab is open but nobody is at it.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = createServiceClient();
  const since = new Date(Date.now() - 90_000).toISOString();
  const { data, error } = await db
    .from("activity_pings")
    .select("user_id, bucket, state, profiles(email, full_name)")
    .gte("bucket", since)
    .order("bucket", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const people = new Map<string, { id: string; name: string; state: "active" | "idle"; lastSeen: string }>();
  for (const r of (data ?? []) as any[]) {
    const prev = people.get(r.user_id);
    const name = r.profiles?.full_name || r.profiles?.email || "Someone";
    if (!prev) people.set(r.user_id, { id: r.user_id, name, state: r.state, lastSeen: r.bucket });
    else if (r.state === "active") prev.state = "active";
  }
  return NextResponse.json({ online: [...people.values()] });
}
