import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runGeneration } from "@/lib/inngest/functions";
import { runPipeline, writeScripts } from "@/lib/inngest/pipeline";
import { openluxClip } from "@/lib/inngest/openlux-clip";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runGeneration, runPipeline, writeScripts, openluxClip],
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
