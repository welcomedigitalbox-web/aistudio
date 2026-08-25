import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { putFromUrl } from "@/lib/storage/r2";
import crypto from "crypto";

export const runtime = "nodejs";

function verify(raw: string, signature: string | null) {
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret) return true; // local dev
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

  const { data: row } = await db
    .from("ref_images")
    .select("id, ref_id, refs(series_id)")
    .eq("id", imageId)
    .single();

  if (!row) return NextResponse.json({ error: "Image row not found" }, { status: 404 });

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

  const seriesId = (row.refs as any)?.series_id;
  const key = `refs/${seriesId}/${row.ref_id}/${imageId}.png`;
  await putFromUrl(key, url, "image/png");

  await db
    .from("ref_images")
    .update({ storage_key: key, state: "ready", error: null })
    .eq("id", imageId);

  return NextResponse.json({ ok: true });
}
