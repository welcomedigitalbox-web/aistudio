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

  const jobId = new URL(req.url).searchParams.get("job");
  if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

  const payload = JSON.parse(raw);
  const db = createServiceClient();

  const { data: job } = await db
    .from("generation_jobs")
    .select("id, asset_id, model, provider, request, cost_usd, created_by, assets(project_id)")
    .eq("id", jobId)
    .single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (payload.status === "ERROR" || payload.error) {
    await db
      .from("generation_jobs")
      .update({
        state: "failed",
        error: String(payload.error ?? "Provider returned an error"),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return NextResponse.json({ ok: true });
  }

  const out = payload.payload ?? payload.output ?? {};
  const mediaUrl: string | undefined = out.video?.url ?? out.images?.[0]?.url ?? out.image?.url ?? out.url;
  if (!mediaUrl) {
    await db
      .from("generation_jobs")
      .update({ state: "failed", error: "No media in provider payload", finished_at: new Date().toISOString() })
      .eq("id", jobId);
    return NextResponse.json({ ok: true });
  }

  const projectId = (job.assets as any)?.project_id;
  const ext = mediaUrl.split("?")[0].split(".").pop() ?? "bin";
  const key = `${projectId}/${job.asset_id}/${jobId}.${ext}`;
  await putFromUrl(key, mediaUrl);

  const { data: version } = await db
    .from("asset_versions")
    .insert({
      asset_id: job.asset_id,
      storage_key: key,
      provider: job.provider,
      model: job.model,
      prompt: (job.request as any)?.prompt ?? null,
      params: (job.request as any)?.params ?? {},
      cost_usd: job.cost_usd,
      created_by: job.created_by,
    })
    .select("id")
    .single();

  await db
    .from("assets")
    .update({ current_version_id: version!.id, updated_at: new Date().toISOString() })
    .eq("id", job.asset_id);

  await db
    .from("generation_jobs")
    .update({ state: "succeeded", version_id: version!.id, finished_at: new Date().toISOString() })
    .eq("id", jobId);

  return NextResponse.json({ ok: true });
}
