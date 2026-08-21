import * as fal from "@fal-ai/serverless-client";
import type { Adapter, GenRequest, AsyncResult } from "./types";
import { estimateCost } from "./pricing";

fal.config({ credentials: process.env.FAL_KEY! });

/**
 * Everything goes through fal's queue. Nothing is awaited inline --
 * a 60s serverless timeout will kill a video render every time.
 */
export const falAdapter: Adapter = {
  provider: "fal",
  supports: ["image", "video"],

  async generate(req: GenRequest, ctx): Promise<AsyncResult> {
    const { request_id } = await fal.queue.submit(req.model, {
      input: { prompt: req.prompt, ...(req.params ?? {}) },
      webhookUrl: `${ctx.webhookUrl}?job=${ctx.jobId}`,
    });

    return {
      mode: "async",
      providerJobId: request_id,
      estimatedCostUsd: estimateCost(req.model, req.params ?? {}),
    };
  },
};
