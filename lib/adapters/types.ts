export type Provider = "anthropic" | "fal";

export type GenKind = "script" | "image" | "video";

export interface GenRequest {
  kind: GenKind;
  model: string;
  prompt: string;
  /** free-form, provider specific: aspect_ratio, duration, image_url, seed... */
  params?: Record<string, unknown>;
}

export interface SyncResult {
  mode: "sync";
  /** text for scripts, remote URL for media */
  text?: string;
  url?: string;
  costUsd: number;
}

export interface AsyncResult {
  mode: "async";
  providerJobId: string;
  /** best-effort estimate; replaced with the real figure on webhook */
  estimatedCostUsd: number;
}

export type GenResult = SyncResult | AsyncResult;

export interface Adapter {
  provider: Provider;
  supports: GenKind[];
  generate(req: GenRequest, ctx: { webhookUrl: string; jobId: string }): Promise<GenResult>;
}
