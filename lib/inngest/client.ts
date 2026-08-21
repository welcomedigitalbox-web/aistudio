import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "ai-studio",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

export type GenerateEvent = {
  data: {
    jobId: string;
    assetId: string;
    projectId: string;
    kind: "script" | "image" | "video";
    model: string;
    prompt: string;
    params?: Record<string, unknown>;
    userId: string;
  };
};
