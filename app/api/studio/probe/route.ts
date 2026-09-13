import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OPENLUX_MODELS, type OpenluxModel } from "@/lib/production/openlux";

export const maxDuration = 60;

/**
 * Ask each gateway model whether it would take a job, without submitting one.
 *
 * The gateway reports capacity only by rejecting a real request, so there is
 * no status page to read. Submitting a deliberately invalid job gets the same
 * answer for nothing: a 503 means the model is down, a 400 means it is up and
 * merely dislikes the request.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const key = process.env.OPENLUX_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENLUX_API_KEY is not set." }, { status: 500 });

  const ids = Object.keys(OPENLUX_MODELS) as OpenluxModel[];

  const results = await Promise.all(
    ids.map(async (id) => {
      const spec = OPENLUX_MODELS[id];

      // No image and no prompt: the request cannot succeed, so it never costs
      // anything. What comes back still distinguishes "down" from "up".
      const form = new FormData();
      form.set("model", spec.model);
      form.set("prompt", "");

      try {
        const res = await fetch("https://api.openlux.ai/v1/videos", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal: AbortSignal.timeout(15000),
        });

        const text = await res.text();

        if (res.status === 503 || text.includes("supply_unavailable")) {
          return { id, label: spec.label, state: "down" as const };
        }
        if (res.status === 401 || res.status === 403) {
          return { id, label: spec.label, state: "unauthorised" as const };
        }
        // 400 means the endpoint answered and objected to the empty request,
        // which is exactly what an available model should do.
        return { id, label: spec.label, state: "up" as const };
      } catch {
        return { id, label: spec.label, state: "timeout" as const };
      }
    })
  );

  return NextResponse.json({ results, checkedAt: new Date().toISOString() });
}
