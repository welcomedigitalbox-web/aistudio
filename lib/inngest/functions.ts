import { inngest, type GenerateEvent } from "./client";
import { adapterFor } from "@/lib/adapters";
import { createServiceClient } from "@/lib/supabase/server";
import { putFromUrl } from "@/lib/storage/r2";

export const runGeneration = inngest.createFunction(
  { id: "run-generation", retries: 2 },
  { event: "studio/generate.requested" },
  async ({ event, step }) => {
    const d = (event as GenerateEvent).data;
    const db = createServiceClient();

    await step.run("mark-running", async () => {
      await db.from("generation_jobs").update({ state: "running" }).eq("id", d.jobId);
    });

    const result = await step.run("call-provider", async () => {
      const adapter = adapterFor(d.model, d.kind);
      return adapter.generate(
        { kind: d.kind, model: d.model, prompt: d.prompt, params: d.params },
        { webhookUrl: `${process.env.APP_URL}/api/webhooks/fal`, jobId: d.jobId }
      );
    });

    // Async providers finish in the webhook handler.
    if (result.mode === "async") {
      await step.run("store-provider-id", async () => {
        await db
          .from("generation_jobs")
          .update({ provider_job_id: result.providerJobId, cost_usd: result.estimatedCostUsd })
          .eq("id", d.jobId);
      });
      return { pending: true, providerJobId: result.providerJobId };
    }

    // Sync path: scripts.
    await step.run("write-version", async () => {
      let storageKey: string | null = null;
      if (result.url) {
        storageKey = await putFromUrl(`${d.projectId}/${d.assetId}/${d.jobId}`, result.url);
      }

      const { data: version } = await db
        .from("asset_versions")
        .insert({
          asset_id: d.assetId,
          text_body: result.text ?? null,
          storage_key: storageKey,
          provider: d.model.startsWith("claude") ? "anthropic" : "fal",
          model: d.model,
          prompt: d.prompt,
          params: d.params ?? {},
          cost_usd: result.costUsd,
          created_by: d.userId,
        })
        .select("id")
        .single();

      await db.from("assets").update({ current_version_id: version!.id, updated_at: new Date().toISOString() }).eq("id", d.assetId);
      await db
        .from("generation_jobs")
        .update({ state: "succeeded", version_id: version!.id, cost_usd: result.costUsd, finished_at: new Date().toISOString() })
        .eq("id", d.jobId);
    });

    return { pending: false };
  }
);
