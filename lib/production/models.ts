/**
 * Keyframe and clip models, and the rules for picking between them.
 *
 * Verify these ids and prices against fal.ai/models before trusting the
 * estimates — providers rename endpoints and reprice without notice.
 */

export const KEYFRAME_MODELS = {
  draft: {
    id: "fal-ai/flux/schnell",
    label: "Flux Schnell — draft, $0.003",
    usd: 0.003,
    /** Whether the endpoint accepts a reference image. */
    refs: false,
  },
  flux: {
    id: "fal-ai/flux/dev",
    label: "Flux Dev — $0.025",
    usd: 0.025,
    refs: false,
  },
  seedream: {
    id: "fal-ai/bytedance/seedream/v4/edit",
    label: "Seedream — reference-aware, $0.03",
    usd: 0.03,
    refs: true,
  },
} as const;

export type KeyframeModel = keyof typeof KEYFRAME_MODELS;

export const CLIP_MODELS = {
  kling_turbo: {
    label: "Kling 2.5 Turbo",
    /**
     * Kling splits by mode: professional caps at 5 seconds, standard runs to
     * 10. A held eight-second shot has to use standard, so the mode follows
     * the shot length rather than a global setting.
     */
    pro: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    std: "fal-ai/kling-video/v2.5-turbo/standard/image-to-video",
    usdPer5s: 0.35,
  },
  kling_v1: {
    label: "Kling 1.6 — cheap drafts",
    pro: "fal-ai/kling-video/v1.6/pro/image-to-video",
    std: "fal-ai/kling-video/v1.6/standard/image-to-video",
    usdPer5s: 0.2,
  },
} as const;

export type ClipModel = keyof typeof CLIP_MODELS;

/** Kling accepts 5 or 10 seconds, nothing between. Round to the nearer. */
export function klingDuration(seconds: number): 5 | 10 {
  return seconds > 7 ? 10 : 5;
}

export function clipEndpoint(model: ClipModel, seconds: number) {
  const spec = CLIP_MODELS[model];
  const duration = klingDuration(seconds);
  return {
    endpoint: duration > 5 ? spec.std : spec.pro,
    duration,
    usd: spec.usdPer5s * (duration / 5),
  };
}
