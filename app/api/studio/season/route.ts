import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { planSeason } from "@/lib/agents/season";

export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { seriesId } = await req.json();
  if (!seriesId) return NextResponse.json({ error: "seriesId is required." }, { status: 400 });

  const db = createServiceClient();

  // Re-planning on top of a season someone has started is almost never what
  // was meant; make them clear it out first.
  const { data: existing } = await db
    .from("episodes")
    .select("id, script_id")
    .eq("series_id", seriesId);

  const started = (existing ?? []).some((e) => e.script_id);
  if (started) {
    return NextResponse.json(
      { error: "Some episodes already have scripts. Delete them before re-planning." },
      { status: 409 }
    );
  }

  try {
    const result = await planSeason(seriesId);
    return NextResponse.json({ ...result, costUsd: Number(result.costUsd.toFixed(4)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
