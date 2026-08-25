import { createClient } from "@/lib/supabase/server";
import { StageRail } from "@/components/StageRail";
import { Gate } from "@/components/Gate";
import { Locked } from "@/components/Locked";
import { EpisodeAgent } from "@/components/EpisodeAgent";
import { DocList } from "@/components/DocList";
import { EPISODE_STEPS, episodeStepIndex } from "@/lib/stages";

export const dynamic = "force-dynamic";

export default async function EpisodePage({
  params,
}: {
  params: { id: string; episodeId: string };
}) {
  const supabase = createClient();

  const [{ data: episode }, { data: stage }, { data: docs }, { data: series }] = await Promise.all([
    supabase.from("episodes").select("*").eq("id", params.episodeId).single(),
    supabase.from("episode_stage").select("*").eq("episode_id", params.episodeId).single(),
    supabase
      .from("story_docs")
      .select("id, agent, title, body, cost_usd, created_at")
      .eq("episode_id", params.episodeId)
      .order("created_at", { ascending: false }),
    supabase.from("series").select("id, title, render_style").eq("id", params.id).single(),
  ]);

  if (!episode || !series) {
    return <main><div className="empty">That episode does not exist.</div></main>;
  }

  const step = stage?.next_step ?? "write_script";
  const at = episodeStepIndex(step);
  const reached = (id: string) => at >= episodeStepIndex(id);

  const spend = (docs ?? []).reduce((s, d: any) => s + Number(d.cost_usd), 0);

  return (
    <main>
      <div className="eyebrow">{series.title} · Episode {episode.n}</div>
      <h1>{episode.title}</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>{episode.premise}</p>
      <div className="cost note" style={{ marginTop: 6 }}>${spend.toFixed(4)}</div>

      <div style={{ marginTop: 20 }}>
        <StageRail steps={EPISODE_STEPS} currentId={step} />
      </div>

      {/* 1 — script */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>1 · Script</h2>
      <EpisodeAgent
        episodeId={episode.id}
        seriesId={series.id}
        agent="script"
        label="Write the script"
        blurb="Reads the bible, the novel, and the cast. Writes dialogue and action for this episode."
        done={stage?.has_script ?? false}
        locked={episode.script_approved}
      />
      {stage?.has_script && (
        <div style={{ marginTop: 12 }}>
          <Gate
            episodeId={episode.id}
            gate="script_approved"
            approved={episode.script_approved}
            what="The script"
            unlocks="scene planning"
          />
        </div>
      )}

      {/* 2 — scene plan */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>2 · Scene plan</h2>
      {!reached("plan_scenes") ? (
        <Locked what="Scene planning" blockedBy="approving the script" />
      ) : (
        <>
          <EpisodeAgent
            episodeId={episode.id}
            seriesId={series.id}
            agent="scene_plan"
            label="Plan the scenes"
            blurb="Breaks the script into scenes, each with a job and a value shift."
            done={stage?.has_plan ?? false}
            locked={episode.plan_approved}
          />
          {stage?.has_plan && (
            <div style={{ marginTop: 12 }}>
              <Gate
                episodeId={episode.id}
                gate="plan_approved"
                approved={episode.plan_approved}
                what="The scene plan"
                unlocks="the shot list"
              />
            </div>
          )}
        </>
      )}

      {/* 3 — shots */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>3 · Shots</h2>
      {!reached("build_shots") ? (
        <Locked what="Shot list" blockedBy="approving the scene plan" />
      ) : (
        <div className="empty">
          <strong>Shot list</strong>
          <div style={{ marginTop: 4 }}>
            Not built yet — this is the next thing to add.
          </div>
        </div>
      )}

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>Documents</h2>
      <DocList docs={(docs ?? []) as any} />
    </main>
  );
}
