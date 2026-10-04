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
  ultra: {
    id: "fal-ai/flux-pro/v1.1-ultra",
    label: "Flux Pro Ultra — photoreal, no references, $0.06",
    usd: 0.06,
    refs: false,
    maxRefs: 0,
  },

  seedream: {
    id: "fal-ai/bytedance/seedream/v4/edit",
    text: "fal-ai/bytedance/seedream/v4/text-to-image",
    label: "Seedream — uses reference art, $0.03",
    usd: 0.03,
    refs: true,
    maxRefs: 4,
  },
  grok_image: {
    id: "xai/grok-imagine-image/v2.0/edit",
    text: "xai/grok-imagine-image/v2.0/text-to-image",
    label: "Grok Imagine 2.0 — uses reference art, $0.05",
    usd: 0.05,
    refs: true,
    maxRefs: 4,
  },

  grok_text: {
    id: "xai/grok-imagine-image/v2.0/text-to-image",
    label: "Grok Imagine 2.0 — text only, $0.04",
    usd: 0.04,
    refs: false,
    maxRefs: 0,
  },

  nano: {
    id: "fal-ai/nano-banana/edit",
    text: "fal-ai/nano-banana",
    label: "Nano Banana — uses reference art, $0.04",
    usd: 0.04,
    refs: true,
    maxRefs: 4,
  },

  /** Best face consistency from reference art. Use for hero shots of the cast. */
  nano_pro: {
    id: "fal-ai/nano-banana-pro/edit",
    text: "fal-ai/nano-banana-pro",
    label: "Nano Banana Pro — best character consistency, $0.15",
    usd: 0.15,
    refs: true,
    maxRefs: 6,
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
    durationKind: "kling" as const,
  },

  kling_turbo: {
    label: "Kling 2.5 Turbo",
    pro: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    std: "fal-ai/kling-video/v2.5-turbo/standard/image-to-video",
    usdPer5s: 0.35,
    imageField: "image_url",
    durationKind: "kling" as const,
  },

  /** 3 to 15 seconds, end frame supported. Billed audio-off: $0.084/s. */
  kling3_std: {
    label: "Kling 3.0 Standard",
    pro: "fal-ai/kling-video/v3/standard/image-to-video",
    std: "fal-ai/kling-video/v3/standard/image-to-video",
    usdPer5s: 0.42,
    imageField: "start_image_url",
    durationKind: "kling3" as const,
  },

  /** Billed audio-off: $0.112/s. */
  kling3: {
    label: "Kling 3.0 Pro — end frame",
    pro: "fal-ai/kling-video/v3/pro/image-to-video",
    std: "fal-ai/kling-video/v3/pro/image-to-video",
    usdPer5s: 0.56,
    imageField: "start_image_url",
    durationKind: "kling3" as const,
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
    durationKind: "kling3" as const,
  },

  /** Start and end frame, animating the transition between them. */
  kling_o3: {
    label: "Kling O3 Pro — first & last frame",
    pro: "fal-ai/kling-video/o3/pro/image-to-video",
    std: "fal-ai/kling-video/o3/pro/image-to-video",
    usdPer5s: 1.0,
    imageField: "start_image_url",
    durationKind: "kling3" as const,
  },

  /** Note the missing fal-ai prefix — this is how fal lists it. */
  seedance2: {
    label: "Seedance 2.0 — audio, multi-shot",
    pro: "bytedance/seedance-2.0/image-to-video",
    std: "bytedance/seedance-2.0/image-to-video",
    usdPer5s: 3.41,
    imageField: "image_url",
    durationKind: "seedance" as const,
  },

  seedance2_mini: {
    label: "Seedance 2.0 Mini — faster, cheaper",
    pro: "bytedance/seedance-2.0-mini/image-to-video",
    std: "bytedance/seedance-2.0-mini/image-to-video",
    usdPer5s: 1.2,
    imageField: "image_url",
    durationKind: "seedance" as const,
  },

  veo_fast_fal: {
    label: "Veo 3.1 Fast",
    pro: "fal-ai/veo3.1/fast/image-to-video",
    std: "fal-ai/veo3.1/fast/image-to-video",
    usdPer5s: 0.75,
    imageField: "image_url",
    durationKind: "veo" as const,
  },

  veo_full: {
    label: "Veo 3.1 — hero shots",
    pro: "fal-ai/veo3.1/image-to-video",
    std: "fal-ai/veo3.1/image-to-video",
    usdPer5s: 1.0,
    imageField: "image_url",
    durationKind: "veo" as const,
  },

  wan27: {
    label: "Wan 2.7 — materials",
    pro: "fal-ai/wan/v2.7/image-to-video",
    std: "fal-ai/wan/v2.7/image-to-video",
    usdPer5s: 0.3,
    imageField: "image_url",
    durationKind: "seconds" as const,
  },
} as const;

export type ClipModel = keyof typeof CLIP_MODELS;

/** Kling 1.6 / 2.5 accept 5 or 10 seconds, nothing between. Round to the nearer. */
export function klingDuration(seconds: number): 5 | 10 {
  return seconds > 7 ? 10 : 5;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * Every provider spells duration differently, and a wrong spelling is either
 * rejected or silently replaced with the default. Veo wants "4s" | "6s" | "8s";
 * Kling 3 takes "3".."15"; Seedance "4".."15"; Wan a number 2..10.
 */
export function clipDuration(model: ClipModel, seconds: number): { seconds: number; value: string | number } {
  const kind = CLIP_MODELS[model].durationKind;
  switch (kind) {
    case "veo": {
      const s = seconds <= 5 ? 4 : seconds <= 7 ? 6 : 8;
      return { seconds: s, value: `${s}s` };
    }
    case "kling3": {
      const s = clamp(seconds, 3, 15);
      return { seconds: s, value: String(s) };
    }
    case "seedance": {
      const s = clamp(seconds, 4, 15);
      return { seconds: s, value: String(s) };
    }
    case "seconds": {
      const s = clamp(seconds, 2, 10);
      return { seconds: s, value: s };
    }
    default: {
      const s = klingDuration(seconds);
      return { seconds: s, value: String(s) };
    }
  }
}

/**
 * Always the pro endpoint. The old rule sent every shot over 7 seconds to the
 * standard tier, which is why long held shots looked worse than short ones.
 */
export function clipEndpoint(model: ClipModel, seconds: number) {
  const spec = CLIP_MODELS[model];
  const d = clipDuration(model, seconds);
  return {
    endpoint: spec.pro,
    duration: d.seconds,
    durationValue: d.value,
    usd: spec.usdPer5s * (d.seconds / 5),
  };
}
