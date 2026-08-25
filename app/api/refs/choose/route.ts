import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Pick the canonical image for a reference. Everything downstream -- keyframes,
 * image-to-video start frames -- reads this one.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { refId, imageId } = await req.json();
  if (!refId || !imageId) {
    return NextResponse.json({ error: "refId and imageId are required." }, { status: 400 });
  }

  const { data: image } = await supabase
    .from("ref_images")
    .select("id, state, ref_id")
    .eq("id", imageId)
    .single();

  if (!image || image.ref_id !== refId) {
    return NextResponse.json({ error: "That image does not belong to this reference." }, { status: 400 });
  }
  if (image.state !== "ready") {
    return NextResponse.json({ error: "That image has not finished generating." }, { status: 409 });
  }

  const { error } = await supabase
    .from("refs")
    .update({ chosen_image_id: imageId })
    .eq("id", refId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
