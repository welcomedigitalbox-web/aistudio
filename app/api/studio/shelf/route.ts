import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Archive a show, or mark it finished.
 *
 * Two different things on purpose: archived means "stop showing me this",
 * completed means "this is done". An abandoned experiment and a finished
 * season should not look the same on the board.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { seriesId, action } = await req.json();
  if (!seriesId) return NextResponse.json({ error: "seriesId is required." }, { status: 400 });

  const patch: Record<string, unknown> =
    action === "archive"   ? { archived: true }
  : action === "restore"   ? { archived: false }
  : action === "complete"  ? { completed_at: new Date().toISOString() }
  : action === "reopen"    ? { completed_at: null }
  : {};

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const { error } = await supabase.from("series").update(patch).eq("id", seriesId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
