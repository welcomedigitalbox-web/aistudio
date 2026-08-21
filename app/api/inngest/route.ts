import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runGeneration } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runGeneration],
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
