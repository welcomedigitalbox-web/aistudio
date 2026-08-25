import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { putFromUrl } from "@/lib/storage/r2";
import crypto from "crypto";

export const runtime = "nodejs";

function verify(raw: string, signature: string | null) {
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("x-fal-signature"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  const imageId = new URL(req.url).searchParams.get("image");
  if (!imageId) return NextResponse.json({ error: "Missing image id" }, { status: 400 });

  const payload = JSON.parse(raw);
  const db = createServiceClient();

  // Two plain lookups instead of an embed: refs has two foreign keys pointing
  // at ref_images, so PostgREST cannot resolve the join on its own.
  const { data: row, error: rowError } = await db
    .from("ref_images")
    .select("id, ref_id")
    .eq("id", imageId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json(
      { error: `Image row not found: ${imageId} ${rowError?.message ?? ""}` },
      { status: 404 }
    );
  }

  const { data: ref } = await db
    .from("refs")
    .select("series_id")
    .eq("id", row.ref_id)
    .maybeSingle();

  if (payload.status === "ERROR" || payload.error) {
    await db
      .from("ref_images")
      .update({ state: "failed", error: String(payload.error ?? "Provider returned an error") })
      .eq("id", imageId);
    return NextResponse.json({ ok: true });
  }

  const out = payload.payload ?? payload.output ?? {};
  const url: string | undefined = out.images?.[0]?.url ?? out.image?.url ?? out.url;

  if (!url) {
    await db
      .from("ref_images")
      .update({ state: "failed", error: "No image in provider payload" })
      .eq("id", imageId);
    return NextResponse.json({ ok: true });
  }

  try {
    const key = `refs/${ref?.series_id ?? "unknown"}/${row.ref_id}/${imageId}.png`;
    await putFromUrl(key, url, "image/png");

    await db
      .from("ref_images")
      .update({ storage_key: key, state: "ready", error: null })
      .eq("id", imageId);
  } catch (e) {
    await db
      .from("ref_images")
      .update({ state: "failed", error: `Storage upload failed: ${(e as Error).message}` })
      .eq("id", imageId);
  }

  return NextResponse.json({ ok: true });
}
