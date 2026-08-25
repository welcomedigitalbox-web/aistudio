import { createClient } from "@/lib/supabase/server";
import { StageRail } from "@/components/StageRail";
import { Gate } from "@/components/Gate";
import { Locked } from "@/components/Locked";
import { ScenePlanner } from "@/components/ScenePlanner";
import { SceneList } from "@/components/SceneList";
import { ShotList } from "@/components/ShotList";

export const dynamic = "force-dynamic";

/** Plan first, then write scene by scene. */
const STEPS = [
  { id: "plan_scenes",        label: "Plan the scenes" },
  { id: "approve_plan",       label: "Approve the plan" },
  { id: "write_scenes",       label: "Write the scenes" },
  { id: "approve_script",     label: "Approve the script" },
  { id: "build_shots",        label: "Build the shot list" },
  { id: "approve_shots",      label: "Approve the shots" },
  { id: "generate_keyframes", label: "Generate keyframes" },
  { id: "generate_clips",     label: "Generate clips" },
  { id: "done",               label: "Cut" },
] as const;

const order = (id: string) => STEPS.findIndex((s) => s.id === id);

export default async function EpisodePage({
  params,
}: {
  params: { id: string; episodeId: string };
}) {
  const supabase = createClient();

  const [{ data: episode }, { data: stage }, { data: scenes }, { data: shots }, { data: series }] =
    await Promise.all([
      supabase.from("episodes").select("*").eq("id", params.episodeId).single(),
      supabase.from("episode_stage").select("*").eq("episode_id", params.episodeId).single(),
      supabase.from("scenes").select("*").eq("episode_id", params.episodeId).order("n"),
      supabase
        .from("shots")
        .select("*, shot_lines(*)")
        .eq("episode_id", params.episodeId)
        .order("n"),
      supabase.from("series").select("id, title, render_style").eq("id", params.id).single(),
    ]);

  if (!episode || !series) {
    return <main><div className="empty">That episode does not exist.</div></main>;
  }

  const step = stage?.next_step ?? "plan_scenes";
  const at = order(step);
  const reached = (id: string) => at >= order(id);

  const spent = (scenes ?? []).reduce((t, s: any) => t + Number(s.cost_usd), 0);
  const written = (scenes ?? []).filter((s: any) => s.script).length;
  const allWritten = (scenes ?? []).length > 0 && written === (scenes ?? []).length;

  return (
    <main>
      <div className="eyebrow">{series.title} · Episode {episode.n}</div>
      <h1>{episode.title}</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>{episode.premise}</p>
      <div className="cost note" style={{ marginTop: 6 }}>${spent.toFixed(4)}</div>

      <div style={{ marginTop: 20 }}>
        <StageRail steps={STEPS} currentId={step} />
      </div>

      {/* 1 — plan */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>1 · Scene plan</h2>
      <ScenePlanner
        episodeId={episode.id}
        planned={(scenes ?? []).length > 0}
        locked={episode.plan_approved}
      />
      {(scenes ?? []).length > 0 && !episode.plan_approved && (
        <div style={{ marginTop: 12 }}>
          <Gate
            episodeId={episode.id}
            gate="plan_approved"
            approved={episode.plan_approved}
            what={`The scene plan (${(scenes ?? []).length} scenes)`}
            unlocks="writing the scenes"
          />
        </div>
      )}

      {/* 2 — write */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>2 · Script</h2>
      {!reached("write_scenes") ? (
        <Locked what="Writing" blockedBy="approving the scene plan" />
      ) : (
        <>
          <SceneList scenes={(scenes ?? []) as any} locked={episode.script_approved} />
          {allWritten && (
            <div style={{ marginTop: 12 }}>
              <Gate
                episodeId={episode.id}
                gate="script_approved"
                approved={episode.script_approved}
                what="The script"
                unlocks="the shot list"
              />
            </div>
          )}
        </>
      )}

      {/* 3 — shots */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>3 · Shots</h2>
      {!reached("build_shots") ? (
        <Locked what="Shot list" blockedBy="approving the script" />
      ) : (
        <ShotList
          scenes={(scenes ?? []) as any}
          shots={(shots ?? []) as any}
          locked={episode.shots_approved}
        />
      )}
    </main>
  );
}
