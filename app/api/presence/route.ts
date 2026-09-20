import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
