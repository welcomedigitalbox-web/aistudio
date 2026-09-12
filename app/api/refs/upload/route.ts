import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Register reference art the browser has already uploaded to R2.
 *
 * Same shape as the lab source upload: the bytes never pass through a
 * function, because a function body caps well below what an image can be.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { refId, storageKey, angle, label } = await req.json();
  if (!refId || !storageKey) {
    return NextResponse.json({ error: "refId and storageKey are required." }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: ref } = await db.from("refs").select("id").eq("id", refId).single();
  if (!ref) return NextResponse.json({ error: "Reference not found." }, { status: 404 });

  const { data, error } = await db
    .from("ref_images")
    .insert({
      ref_id: refId,
      angle: angle || "uploaded",
      label: label || null,
      storage_key: storageKey,
      state: "ready",
      uploaded: true,
      cost_usd: 0,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // An uploaded image is almost always the one the person wants used, and
  // making them click twice to say so is friction for nothing.
  const { data: current } = await db
    .from("refs")
    .select("chosen_image_id")
    .eq("id", refId)
    .single();

  if (!current?.chosen_image_id) {
    await db.from("refs").update({ chosen_image_id: data.id }).eq("id", refId);
  }

  return NextResponse.json({ imageId: data.id });
}
