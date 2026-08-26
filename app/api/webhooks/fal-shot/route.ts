import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { putFromUrl } from "@/lib/storage/r2";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

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

  const url = new URL(req.url);
  const shotId = url.searchParams.get("shot");
  const kind = url.searchParams.get("kind");

  if (!shotId || (kind !== "keyframe" && kind !== "clip")) {
    return NextResponse.json({ error: "Missing shot or kind" }, { status: 400 });
  }

  const payload = JSON.parse(raw);
  const db = createServiceClient();

  const stateCol = kind === "keyframe" ? "keyframe_state" : "clip_state";
  const errorCol = kind === "keyframe" ? "keyframe_error" : "clip_error";
  const keyCol = kind === "keyframe" ? "keyframe_storage_key" : "clip_storage_key";

  const { data: shot } = await db
    .from("shots")
    .select("id, episode_id, n")
    .eq("id", shotId)
    .maybeSingle();

  if (!shot) return NextResponse.json({ error: "Shot not found" }, { status: 404 });

  if (payload.status === "ERROR" || payload.error) {
    await db
      .from("shots")
      .update({
        [stateCol]: "failed",
        [errorCol]: String(payload.error ?? "Provider returned an error"),
      })
      .eq("id", shotId);
    return NextResponse.json({ ok: true });
  }

  const out = payload.payload ?? payload.output ?? {};
  const mediaUrl: string | undefined =
    out.video?.url ?? out.images?.[0]?.url ?? out.image?.url ?? out.url;

  if (!mediaUrl) {
    await db
      .from("shots")
      .update({ [stateCol]: "failed", [errorCol]: "No media in provider payload" })
      .eq("id", shotId);
    return NextResponse.json({ ok: true });
  }

  try {
    const ext = kind === "keyframe" ? "png" : "mp4";
    const key = `shots/${shot.episode_id}/${shotId}-${kind}.${ext}`;
    await putFromUrl(key, mediaUrl, kind === "keyframe" ? "image/png" : "video/mp4");

    const patch: Record<string, unknown> = {
      [keyCol]: key,
      [stateCol]: "ready",
      [errorCol]: null,
    };

    // Kling returns a tail frame on some endpoints; when it does, keep it so
    // the next shot in the scene can start from it.
    const tail: string | undefined = out.last_frame?.url ?? out.tail_image_url;
    if (kind === "clip" && tail) {
      const tailKey = `shots/${shot.episode_id}/${shotId}-tail.png`;
      await putFromUrl(tailKey, tail, "image/png");
      patch.last_frame_storage_key = tailKey;
    }

    await db.from("shots").update(patch).eq("id", shotId);
  } catch (e) {
    await db
      .from("shots")
      .update({
        [stateCol]: "failed",
        [errorCol]: `Storage upload failed: ${(e as Error).message}`,
      })
      .eq("id", shotId);
  }

  return NextResponse.json({ ok: true });
}
