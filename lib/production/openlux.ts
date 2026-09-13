import { createServiceClient } from "@/lib/supabase/server";

const BASE = "https://api.openlux.ai";

/**
 * OpenLux gateway.
 *
 * Unlike fal, this one has no webhook: submitting returns a task id and the
 * result has to be asked for. That is why clip jobs through here run as an
 * Inngest function rather than a request — a fifty-shot batch cannot be
 * fifty browser tabs waiting ten minutes each.
 */

export const OPENLUX_MODELS = {
  veo_fast: {
    label: "Veo 3.1 Fast — 8s with audio",
    model: "veo_3_1-fast",
    /** Fixed clip length, in seconds. Null means the caller chooses. */
    seconds: 8 as number | null,
    usd: 0.0424,
  },
  veo: {
    label: "Veo 3.1 — 8s with audio",
    model: "veo_3_1",
    seconds: 8 as number | null,
    usd: 0.0565,
  },
  kling3_turbo: {
    label: "Kling 3.0 Turbo",
    model: "kling-3.0-turbo",
    seconds: null as number | null,
    usd: 0.1,
  },
  hailuo23: {
    label: "Hailuo 2.3",
    model: "MiniMax-Hailuo-2.3",
    seconds: null as number | null,
    usd: 0.2353,
  },
  veo_components: {
    label: "Veo 3.1 4K — first frame only",
    model: "veo_3_1-components",
    seconds: 8 as number | null,
    usd: 0.0565,
  },
  kling_omni: {
    label: "Kling O1 — multimodal reference",
    model: "kling-omni-video",
    seconds: null as number | null,
    usd: 0.0882,
  },
  kling_v: {
    label: "Kling (versioned)",
    model: "kling-video",
    seconds: null as number | null,
    usd: 0.0882,
  },
  vidu_turbo: {
    label: "Vidu Q3 Turbo — first & last frame",
    model: "viduq3-turbo",
    seconds: null as number | null,
    usd: 0.0919,
  },
  vidu_pro: {
    label: "Vidu Q3 Pro",
    model: "viduq3-pro",
    seconds: null as number | null,
    usd: 0.1608,
  },
  wan3: {
    label: "Wan 3.0 — first & last frame",
    model: "wan3.0-video",
    seconds: null as number | null,
    usd: 0.035,
  },
  grok_video: {
    label: "Grok Imagine — cheap drafts",
    model: "grok-imagine-video",
    seconds: null as number | null,
    usd: 0.0309,
  },
  hailuo02: {
    label: "Hailuo 02",
    model: "MiniMax-Hailuo-02",
    seconds: null as number | null,
    usd: 0.2353,
  },
  happyhorse: {
    label: "HappyHorse 1.1 — up to 9 reference images",
    model: "happyhorse-1.1-r2v",
    seconds: null as number | null,
    usd: 0.086,
  },
  seedance15: {
    label: "Seedance 1.5 Pro — first & last frame",
    model: "doubao-seedance-1-5-pro-251215",
    seconds: null as number | null,
    usd: 1.05,
  },
  seedance_fast: {
    label: "Seedance 1.0 Pro Fast",
    model: "doubao-seedance-1-0-pro-fast-251015",
    seconds: null as number | null,
    usd: 0.4725,
  },
} as const;

export type OpenluxModel = keyof typeof OPENLUX_MODELS;

/** Where a model lives. Most share /v1/videos; some do not. */
function pathFor(model: OpenluxModel) {
  const id = OPENLUX_MODELS[model].model;
  if (id.startsWith("MiniMax")) return "/minimax/v1/video_generation";
  return "/v1/videos";
}

function key() {
  const k = process.env.OPENLUX_API_KEY;
  if (!k) throw new Error("OPENLUX_API_KEY is not set.");
  return k;
}

/** Submit an image-to-video job. Returns the task id to poll. */
export async function submitClip(opts: {
  model: OpenluxModel;
  imageUrl: string;
  prompt: string;
  seconds: number;
  aspect: string;
}) {
  const spec = OPENLUX_MODELS[opts.model];

  // Models with a fixed clip length ignore whatever the shot asked for, so
  // record what we actually get rather than what we wanted.
  const seconds = spec.seconds ?? (opts.seconds > 7 ? 10 : 6);

  const form = new FormData();
  form.set("input_reference", opts.imageUrl);
  form.set("model", spec.model);
  form.set("prompt", opts.prompt);
  form.set("seconds", String(seconds));
  form.set("size", opts.aspect === "9:16" ? "9:16" : "16:9");

  const res = await fetch(`${BASE}${pathFor(opts.model)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}` },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`OpenLux rejected the job (${res.status}): ${text.slice(0, 300)}`);

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OpenLux returned non-JSON: ${text.slice(0, 200)}`);
  }

  const taskId = json?.data?.task_id ?? json?.id;
  if (!taskId) throw new Error(`No task id in the response: ${text.slice(0, 200)}`);

  return { taskId, seconds, usd: spec.usd };
}

type Poll =
  | { state: "pending"; progress: number | null }
  | { state: "ready"; url: string }
  | { state: "failed"; error: string };

/**
 * Ask once whether a task is done.
 *
 * Two endpoints matter: the status call reports progress, and the content
 * call carries the URL. The status response sometimes has the URL too, so
 * check there first and save a round trip.
 */
export async function pollClip(taskId: string): Promise<Poll> {
  const headers = { Authorization: `Bearer ${key()}`, Accept: "application/json" };

  const res = await fetch(`${BASE}/v1/videos/${encodeURIComponent(taskId)}`, { headers });
  const text = await res.text();

  if (!res.ok) {
    return { state: "failed", error: `Status check failed (${res.status}): ${text.slice(0, 200)}` };
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { state: "failed", error: `Non-JSON status: ${text.slice(0, 200)}` };
  }

  const status = String(json?.status ?? json?.detail?.status ?? "").toLowerCase();

  if (status.includes("fail") || status.includes("error") || status.includes("reject")) {
    const reason =
      json?.detail?.pending_info?.failure_reason ??
      json?.detail?.failure_reason ??
      "The provider rejected or failed the job.";
    return { state: "failed", error: String(reason) };
  }

  const inline = json?.video_url ?? json?.detail?.video_url;
  if (inline) return { state: "ready", url: inline };

  if (status === "succeeded" || status === "success" || status === "completed") {
    const content = await fetch(
      `${BASE}/v1/videos/${encodeURIComponent(taskId)}/content`,
      { headers }
    );
    const ctext = await content.text();

    if (!content.ok) {
      return { state: "failed", error: `Could not fetch the video (${content.status}).` };
    }

    try {
      const cjson = JSON.parse(ctext);
      if (cjson?.video_url) return { state: "ready", url: cjson.video_url };
    } catch {
      // Some gateways stream the file itself from /content. Nothing useful to
      // do with that here — the job is done but the URL is the endpoint.
      return {
        state: "ready",
        url: `${BASE}/v1/videos/${encodeURIComponent(taskId)}/content`,
      };
    }

    return { state: "failed", error: "Task reported success but returned no URL." };
  }

  const pct = json?.detail?.pending_info?.progress_pct;
  return { state: "pending", progress: typeof pct === "number" ? pct : null };
}
