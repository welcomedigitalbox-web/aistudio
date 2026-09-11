import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Registers a file the browser has already uploaded.
 *
 * The bytes never pass through here: Vercel caps a function body at ~4.5MB and
 * a novel PDF is routinely larger. The browser uploads straight to Supabase
 * Storage and then calls this with the key.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { labId, storageKey, title, author, basis, role } = await req.json();

  if (!labId || !storageKey || !title || !basis) {
    return NextResponse.json(
      { error: "labId, storageKey, title and basis are required." },
      { status: 400 }
    );
  }

  const db = createServiceClient();

  const { data, error } = await db
    .from("sources")
    .insert({
      lab_id: labId,
      title,
      author: author || null,
      basis,
      storage_key: storageKey,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("lab_sources").insert({
    lab_id: labId,
    source_id: data.id,
    role: role || "free",
  });

  return NextResponse.json({ sourceId: data.id });
}
