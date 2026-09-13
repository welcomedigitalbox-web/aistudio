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
  kling_v1: {
    label: "Kling 1.6 — drafts",
    pro: "fal-ai/kling-video/v1.6/pro/image-to-video",
    std: "fal-ai/kling-video/v1.6/standard/image-to-video",
    usdPer5s: 0.2,
    imageField: "image_url",
  },

  kling_turbo: {
    label: "Kling 2.5 Turbo",
    pro: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    std: "fal-ai/kling-video/v2.5-turbo/standard/image-to-video",
    usdPer5s: 0.35,
    imageField: "image_url",
  },

  /** Audio in Chinese and English, 3 to 15 seconds, end frame supported. */
  kling3_std: {
    label: "Kling 3.0 Standard — audio",
    pro: "fal-ai/kling-video/v3/standard/image-to-video",
    std: "fal-ai/kling-video/v3/standard/image-to-video",
    usdPer5s: 0.56,
    imageField: "start_image_url",
  },

  kling3: {
    label: "Kling 3.0 Pro — audio, end frame",
    pro: "fal-ai/kling-video/v3/pro/image-to-video",
    std: "fal-ai/kling-video/v3/pro/image-to-video",
    usdPer5s: 0.84,
    imageField: "start_image_url",
  },

  /**
   * Native 4K in one step — no upscaling pass. $0.42 a second whether audio
   * is on or off, so leave it on.
   */
  kling3_4k: {
    label: "Kling 3.0 — native 4K",
    pro: "fal-ai/kling-video/v3/4k/image-to-video",
    std: "fal-ai/kling-video/v3/4k/image-to-video",
    usdPer5s: 2.1,
    imageField: "start_image_url",
  },

  /** Start and end frame, animating the transition between them. */
  kling_o3: {
    label: "Kling O3 Pro — first & last frame",
    pro: "fal-ai/kling-video/o3/pro/image-to-video",
    std: "fal-ai/kling-video/o3/pro/image-to-video",
    usdPer5s: 1.0,
    imageField: "start_image_url",
  },

  /** Note the missing fal-ai prefix — this is how fal lists it. */
  seedance2: {
    label: "Seedance 2.0 — audio, multi-shot",
    pro: "bytedance/seedance-2.0/image-to-video",
    std: "bytedance/seedance-2.0/image-to-video",
    usdPer5s: 3.41,
    imageField: "image_url",
  },

  seedance2_mini: {
    label: "Seedance 2.0 Mini — faster, cheaper",
    pro: "bytedance/seedance-2.0-mini/image-to-video",
    std: "bytedance/seedance-2.0-mini/image-to-video",
    usdPer5s: 1.2,
    imageField: "image_url",
  },

  veo_fast_fal: {
    label: "Veo 3.1 Fast",
    pro: "fal-ai/veo3.1/fast/image-to-video",
    std: "fal-ai/veo3.1/fast/image-to-video",
    usdPer5s: 0.75,
    imageField: "image_url",
  },

  veo_full: {
    label: "Veo 3.1 — hero shots",
    pro: "fal-ai/veo3.1/image-to-video",
    std: "fal-ai/veo3.1/image-to-video",
    usdPer5s: 1.0,
    imageField: "image_url",
  },

  wan27: {
    label: "Wan 2.7 — materials",
    pro: "fal-ai/wan/v2.7/image-to-video",
    std: "fal-ai/wan/v2.7/image-to-video",
    usdPer5s: 0.3,
    imageField: "image_url",
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
