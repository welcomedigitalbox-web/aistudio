import Anthropic from "@anthropic-ai/sdk";
import type { Adapter, GenRequest, SyncResult } from "./types";
import { estimateCost } from "./pricing";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const anthropicAdapter: Adapter = {
  provider: "anthropic",
  supports: ["script"],

  async generate(req: GenRequest): Promise<SyncResult> {
    const brandVoice = (req.params?.brandVoice as string) ?? "";
    const brief = (req.params?.brief as string) ?? "";

    const msg = await client.messages.create({
      model: req.model || "claude-sonnet-4-6",
      max_tokens: 2000,
      system: [
        "You write short-form video scripts for a media agency.",
        brandVoice && `Brand voice: ${brandVoice}`,
        brief && `Campaign brief: ${brief}`,
        "Return the script only. No preamble, no notes.",
      ]
        .filter(Boolean)
        .join("\n"),
      messages: [{ role: "user", content: req.prompt }],
    });

    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    return { mode: "sync", text, costUsd: estimateCost(req.model) };
  },
};
