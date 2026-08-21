/**
 * Rough per-unit costs used for budget checks and for the estimate shown
 * before a job runs. Providers change these often -- verify against the
 * live price page before you trust the dashboard numbers.
 */
export const PRICING: Record<string, { unit: "call" | "second"; usd: number }> = {
  // fal.ai video
  "fal-ai/kling-video/v1/standard/text-to-video": { unit: "second", usd: 0.09 },
  "fal-ai/minimax/video-01": { unit: "call", usd: 0.5 },
  "fal-ai/luma-dream-machine": { unit: "call", usd: 0.5 },

  // fal.ai image
  "fal-ai/flux/schnell": { unit: "call", usd: 0.003 },
  "fal-ai/flux/dev": { unit: "call", usd: 0.025 },

  // anthropic
  "claude-sonnet-4-6": { unit: "call", usd: 0.02 },
};

export function estimateCost(model: string, params: Record<string, unknown> = {}) {
  const p = PRICING[model];
  if (!p) return 0;
  if (p.unit === "second") {
    const d = Number(params.duration ?? 5);
    return +(p.usd * d).toFixed(4);
  }
  return p.usd;
}
