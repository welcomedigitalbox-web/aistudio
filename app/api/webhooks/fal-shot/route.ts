import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { putFromUrl } from "@/lib/storage/r2";
import crypto from "crypto";
import { shotWebhookToken } from "@/lib/production/webhook-token";

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
  const url = new URL(req.url);
  const shotId = url.searchParams.get("shot");
  const kind = url.searchParams.get("kind");

  if (!shotId || (kind !== "keyframe" && kind !== "clip")) {
    return NextResponse.json({ error: "Missing shot or kind" }, { status: 400 });
  }

  // The per-shot token proves the call answers a job this app submitted.
  // (The header check is kept for setups that configured it.)
  const token = url.searchParams.get("t") ?? "";
  const expected = shotWebhookToken(shotId, kind);
  const tokenOk =
    token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!tokenOk && !(process.env.FAL_WEBHOOK_SECRET && verify(raw, req.headers.get("x-fal-signature")))) {
    return NextResponse.json({ error: "Bad token" }, { status: 401 });
  }

  const payload = JSON.parse(raw);
  const db = createServiceClient();

  const stateCol = kind === "keyframe" ? "keyframe_state" : "clip_state";
  const errorCol = kind === "keyframe" ? "keyframe_error" : "clip_error";
  const keyCol = kind === "keyframe" ? "keyframe_storage_key" : "clip_storage_key";

  const { data: shot } = await db
    .from("shots")
    .select("id, episode_id, n, keyframe_job_id, clip_job_id")
    .eq("id", shotId)
    .maybeSingle();

  if (!shot) return NextResponse.json({ error: "Shot not found" }, { status: 404 });

  // An answer to an older job: a redo was submitted since. Letting it in
  // put the earlier picture back over the one just paid for.
  const current = kind === "keyframe" ? shot.keyframe_job_id : shot.clip_job_id;
  const answering = payload.request_id ?? payload.requestId;
  if (current && answering && current !== answering) {
    return NextResponse.json({ ok: true, ignored: "superseded" });
  }

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
    // A new name for every result. Reusing one name meant the public CDN and
    // the browser kept serving the first picture, so a redo was paid for and
    // never seen.
    const key = `shots/${shot.episode_id}/${shotId}-${kind}-${Date.now()}.${ext}`;
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
      const tailKey = `shots/${shot.episode_id}/${shotId}-tail-${Date.now()}.png`;
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
