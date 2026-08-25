import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runGeneration } from "@/lib/inngest/functions";
import { runPipeline, writeScripts } from "@/lib/inngest/pipeline";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runGeneration, runPipeline, writeScripts],
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
