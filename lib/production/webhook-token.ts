import crypto from "crypto";

/**
 * A token for one shot's webhook. fal does not sign the way the old check
 * expected, so without this anyone who knew a shot id could post a result
 * for it — replacing the picture and making the server fetch any URL.
 * The token is derived, not stored: the same inputs always give it back.
 */
export function shotWebhookToken(shotId: string, kind: string) {
  const key = process.env.WEBHOOK_TOKEN_SECRET || process.env.FAL_KEY || "";
  return crypto.createHmac("sha256", key).update(`${shotId}:${kind}`).digest("hex").slice(0, 32);
}

export function shotWebhookUrl(shotId: string, kind: "keyframe" | "clip") {
  return `${process.env.APP_URL}/api/webhooks/fal-shot?shot=${shotId}&kind=${kind}&t=${shotWebhookToken(shotId, kind)}`;
}
