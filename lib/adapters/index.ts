import type { Adapter, GenKind } from "./types";
import { anthropicAdapter } from "./anthropic";
import { falAdapter } from "./fal";

const ADAPTERS: Adapter[] = [anthropicAdapter, falAdapter];

export function adapterFor(model: string, kind: GenKind): Adapter {
  // model ids are namespaced: "fal-ai/..." vs "claude-..."
  const provider = model.startsWith("claude") ? "anthropic" : "fal";
  const found = ADAPTERS.find((a) => a.provider === provider && a.supports.includes(kind));
  if (!found) throw new Error(`No adapter handles ${kind} on ${provider}`);
  return found;
}

export * from "./types";
export { PRICING, estimateCost } from "./pricing";
