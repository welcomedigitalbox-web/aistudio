import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agents/run";
import { AGENTS, type AgentKind } from "@/lib/agents/prompts";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { projectId, agent, title, brief, parentIds, sourceIds } = await req.json();

  if (!projectId || !agent || !brief) {
    return NextResponse.json(
      { error: "projectId, agent and brief are required." },
      { status: 400 }
    );
  }
  if (!(agent in AGENTS)) {
    return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
  }

  try {
    const result = await runAgent({
      projectId,
      agent: agent as AgentKind,
      title: title || AGENTS[agent as AgentKind].label,
      brief,
      parentIds,
      sourceIds,
      userId: user.id,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
