import { createServiceClient } from "@/lib/supabase/server";

export interface BudgetVerdict {
  ok: boolean;
  reason?: string;
  spentUsd: number;
  budgetUsd: number;
  videoRenders: number;
  videoQuota: number;
}

/**
 * Called before every paid job. Video is the line item that runs away,
 * so it gets both a spend cap and a render count cap.
 */
export async function checkBudget(
  projectId: string,
  kind: string,
  estimatedCostUsd: number
): Promise<BudgetVerdict> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("project_spend_current_month")
    .select("*")
    .eq("project_id", projectId)
    .single();

  if (error || !data) {
    return { ok: false, reason: "Project not found", spentUsd: 0, budgetUsd: 0, videoRenders: 0, videoQuota: 0 };
  }

  const spent = Number(data.spent_usd);
  const budget = Number(data.monthly_budget_usd);
  const renders = Number(data.video_renders);
  const quota = Number(data.monthly_video_quota);

  const base = { spentUsd: spent, budgetUsd: budget, videoRenders: renders, videoQuota: quota };

  if (spent + estimatedCostUsd > budget) {
    return { ...base, ok: false, reason: `This render puts the project over its $${budget} monthly cap.` };
  }
  if (kind === "video" && renders >= quota) {
    return { ...base, ok: false, reason: `Video quota for this month is used up (${renders}/${quota}).` };
  }
  return { ...base, ok: true };
}
