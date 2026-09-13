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
    refs: false,
    maxRefs: 0,
  },
  flux: {
    id: "fal-ai/flux/dev",
    label: "Flux Dev — no references, $0.025",
    usd: 0.025,
    refs: false,
    maxRefs: 0,
  },
  /**
   * Reference-aware. Worth the extra cent on any shot with a face in it: the
   * model is given the character's chosen art rather than a paragraph about
   * them.
   */
  seedream: {
    id: "fal-ai/bytedance/seedream/v4/edit",
    label: "Seedream — uses reference art, $0.03",
    usd: 0.03,
    refs: true,
    maxRefs: 4,
  },
  nano: {
    id: "fal-ai/nano-banana/edit",
    label: "Nano Banana — uses reference art, $0.04",
    usd: 0.04,
    refs: true,
    maxRefs: 4,
  },
} as const;

export type KeyframeModel = keyof typeof KEYFRAME_MODELS;

export const CLIP_MODELS = {
  wan: {
    label: "Wan 2.6 — materials, cheap",
    pro: "fal-ai/wan/v2.6/image-to-video",
    std: "fal-ai/wan/v2.6/image-to-video",
    usdPer5s: 0.25,
  },

  luma: {
    label: "Luma Ray 2 — camera movement",
    pro: "fal-ai/luma-dream-machine/ray-2/image-to-video",
    std: "fal-ai/luma-dream-machine/ray-2/image-to-video",
    usdPer5s: 0.2,
  },

  veo_lite: {
    label: "Veo 3.1 Lite — realism, audio",
    pro: "fal-ai/veo3.1/lite/image-to-video",
    std: "fal-ai/veo3.1/lite/image-to-video",
    usdPer5s: 0.25,
  },

  grok15: {
    label: "Grok Imagine 1.5 — audio",
    pro: "fal-ai/grok-imagine/v1.5/image-to-video",
    std: "fal-ai/grok-imagine/v1.5/image-to-video",
    usdPer5s: 0.3,
  },

  pixverse: {
    label: "PixVerse 5.6 — stylised",
    pro: "fal-ai/pixverse/v5.6/image-to-video",
    std: "fal-ai/pixverse/v5.6/image-to-video",
    usdPer5s: 0.35,
  },

  happyhorse: {
    label: "HappyHorse 1.0 — quality-first",
    pro: "fal-ai/happyhorse/v1/image-to-video",
    std: "fal-ai/happyhorse/v1/image-to-video",
    usdPer5s: 0.45,
  },

  hailuo: {
    label: "Hailuo 2.3 — motion and physics",
    pro: "fal-ai/minimax/hailuo-02/pro/image-to-video",
    std: "fal-ai/minimax/hailuo-02/standard/image-to-video",
    usdPer5s: 0.49,
  },

  flux3: {
    label: "FLUX 3 Video — animates a still",
    pro: "fal-ai/flux-3/image-to-video",
    std: "fal-ai/flux-3/image-to-video",
    usdPer5s: 0.5,
  },

  seedance15: {
    label: "Seedance 1.5 Pro — first & last frame",
    pro: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video",
    std: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video",
    usdPer5s: 0.62,
  },

  /** Audio included, at half Veo's rate. The value pick for dialogue-free work. */
  kling3: {
    label: "Kling 3.0 Pro — audio, end frame",
    pro: "fal-ai/kling-video/v3/pro/image-to-video",
    std: "fal-ai/kling-video/v3/pro/image-to-video",
    usdPer5s: 0.84,
  },

  /** Priced without audio; with audio it doubles, so ask for it deliberately. */
  veo_full: {
    label: "Veo 3.1 — hero shots",
    pro: "fal-ai/veo3.1/image-to-video",
    std: "fal-ai/veo3.1/image-to-video",
    usdPer5s: 1.0,
  },

  seedance2: {
    label: "Seedance 2.0 — audio, lip sync",
    pro: "fal-ai/bytedance/seedance-2.0/image-to-video",
    std: "fal-ai/bytedance/seedance-2.0/image-to-video",
    usdPer5s: 3.41,
  },

  kling_v1: {
    label: "Kling 1.6 — drafts",
    pro: "fal-ai/kling-video/v1.6/pro/image-to-video",
    std: "fal-ai/kling-video/v1.6/standard/image-to-video",
    usdPer5s: 0.2,
  },
  kling_turbo: {
    label: "Kling 2.5 Turbo",
    pro: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    std: "fal-ai/kling-video/v2.5-turbo/standard/image-to-video",
    usdPer5s: 0.35,
  },
  /**
   * Seedance takes a first frame like the others. Its 1.5 line also takes a
   * last frame, which would make chaining exact rather than hopeful — not
   * wired up here, but the reason to reach for it later.
   */
  seedance: {
    label: "Seedance 1.0 Pro",
    pro: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    std: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    usdPer5s: 0.47,
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
