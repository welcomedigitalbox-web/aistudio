import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Save a hand-edited scene, or mark one done.
 *
 * Edits are stored in the same `script` column the writer fills, so nothing
 * downstream needs to know whether a human or an agent wrote it.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { sceneId, script, approved } = await req.json();
  if (!sceneId) return NextResponse.json({ error: "sceneId is required." }, { status: 400 });

  const patch: Record<string, unknown> = {};

  if (script !== undefined) {
    // Guard the shape: a malformed elements array breaks the shot list later,
    // and the error would surface a long way from its cause.
    if (!script || !Array.isArray(script.elements)) {
      return NextResponse.json(
        { error: "A scene needs an `elements` array." },
        { status: 400 }
      );
    }
    for (const el of script.elements) {
      if (el.type !== "action" && el.type !== "dialogue") {
        return NextResponse.json(
          { error: `Unknown element type: ${el.type}. Use "action" or "dialogue".` },
          { status: 400 }
        );
      }
      if (typeof el.text !== "string") {
        return NextResponse.json({ error: "Every element needs a `text` string." }, { status: 400 });
      }
      if (el.type === "dialogue" && !el.character) {
        return NextResponse.json(
          { error: "Dialogue elements need a `character`." },
          { status: 400 }
        );
      }
    }
    patch.script = script;
  }

  if (approved !== undefined) patch.approved = approved;

  const { error } = await supabase.from("scenes").update(patch).eq("id", sceneId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
