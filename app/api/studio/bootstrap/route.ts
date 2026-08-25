import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { draftBible, draftCast } from "@/lib/agents/bootstrap";

export const maxDuration = 300;

/**
 * Read the novel, write the bible, list the cast — in one pass.
 *
 * Runs inline rather than through the queue: it is two calls, and the person is
 * sitting there waiting for the result. Anything longer belongs in Inngest.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { seriesId, only } = await req.json();
  if (!seriesId) return NextResponse.json({ error: "seriesId is required." }, { status: 400 });

  const db = createServiceClient();
  await db
    .from("series")
    .update({ bootstrap_state: "running", bootstrap_error: null })
    .eq("id", seriesId);

  try {
    let cost = 0;
    let cast = { characters: 0, locations: 0 };

    if (only !== "cast") {
      const b = await draftBible(seriesId);
      cost += b.costUsd;
    }
    if (only !== "bible") {
      const c = await draftCast(seriesId);
      cost += c.costUsd;
      cast = { characters: c.characters, locations: c.locations };
    }

    await db.from("series").update({ bootstrap_state: "idle" }).eq("id", seriesId);

    return NextResponse.json({
      ...cast,
      costUsd: Number(cost.toFixed(4)),
    });
  } catch (e) {
    const message = (e as Error).message;
    await db
      .from("series")
      .update({ bootstrap_state: "failed", bootstrap_error: message })
      .eq("id", seriesId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
