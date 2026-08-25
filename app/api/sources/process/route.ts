import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { extractText } from "@/lib/sources/pdf";
import { splitIntoChunks, storeChunks } from "@/lib/sources/extract";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { sourceId } = await req.json();
  if (!sourceId) return NextResponse.json({ error: "sourceId is required." }, { status: 400 });

  const db = createServiceClient();
  const { data: source } = await db
    .from("sources")
    .select("id, storage_key, state")
    .eq("id", sourceId)
    .single();

  if (!source) return NextResponse.json({ error: "Source not found." }, { status: 404 });

  await db.from("sources").update({ state: "extracting", error: null }).eq("id", sourceId);

  try {
    const { data: blob, error } = await db.storage.from("sources").download(source.storage_key);
    if (error || !blob) throw new Error(error?.message ?? "Could not read the stored file.");

    const text = await extractText(Buffer.from(await blob.arrayBuffer()));
    const chunks = splitIntoChunks(text);

    if (chunks.length === 0) throw new Error("No readable chapters were found in that PDF.");

    // Re-processing replaces the previous pass rather than duplicating it.
    await db.from("source_chunks").delete().eq("source_id", sourceId);
    await storeChunks(sourceId, chunks);
    await db.from("sources").update({ state: "ready" }).eq("id", sourceId);

    return NextResponse.json({ chunks: chunks.length, chars: text.length });
  } catch (e) {
    const message = (e as Error).message;
    await db.from("sources").update({ state: "failed", error: message }).eq("id", sourceId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
