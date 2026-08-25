import { inngest } from "./client";
import { createServiceClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agents/run";
import { flattenScenes, writeScene, type Scene } from "@/lib/agents/scene-script";

/** Cap on scenes per run. A plan longer than this is almost always a sign the
 *  brief asked for too much at once -- fail loudly instead of spending. */
const MAX_SCENES = 60;

async function setStage(id: string, patch: Record<string, unknown>) {
  const db = createServiceClient();
  await db
    .from("pipelines")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Stage 1-3: research, characters, scene plan. Sequential, because each one
 * reads the last. Stops at awaiting_approval -- a wrong scene plan multiplied
 * by fifty scripts is the expensive mistake this checkpoint exists to prevent.
 */
export const runPipeline = inngest.createFunction(
  { id: "run-pipeline", retries: 1, concurrency: [{ key: "event.data.projectId", limit: 1 }] },
  { event: "studio/pipeline.started" },
  async ({ event, step }) => {
    const { pipelineId, projectId, brief, sourceIds, userId } = event.data;

    try {
      const research = await step.run("research", async () => {
        await setStage(pipelineId, { stage: "Researching" });
        return runAgent({
          projectId, agent: "research", title: "Research",
          brief, sourceIds, userId,
        });
      });

      const characters = await step.run("characters", async () => {
        await setStage(pipelineId, { stage: "Building characters", research_id: research.id });
        return runAgent({
          projectId, agent: "character", title: "Characters",
          brief, parentIds: [research.id], sourceIds, userId,
        });
      });

      const plan = await step.run("scene-plan", async () => {
        await setStage(pipelineId, { stage: "Planning scenes", character_id: characters.id });
        return runAgent({
          projectId, agent: "scene_plan", title: "Scene plan",
          brief, parentIds: [characters.id, research.id], sourceIds, userId,
        });
      });

      await step.run("await-approval", async () => {
        const db = createServiceClient();
        const { data: doc } = await db
          .from("story_docs").select("body").eq("id", plan.id).single();

        const scenes = flattenScenes(doc?.body);
        const cost = research.costUsd + characters.costUsd + plan.costUsd;

        await setStage(pipelineId, {
          state: "awaiting_approval",
          stage: `${scenes.length} scenes planned — review before writing`,
          plan_id: plan.id,
          scenes_total: scenes.length,
          cost_usd: Number(cost.toFixed(4)),
        });
      });

      return { pipelineId, planId: plan.id };
    } catch (e) {
      await setStage(pipelineId, { state: "failed", error: (e as Error).message });
      throw e;
    }
  }
);

/**
 * Stage 4: one script per scene, in parallel. Fired only after a person
 * approves the plan.
 */
export const writeScripts = inngest.createFunction(
  {
    id: "write-scripts",
    retries: 1,
    // Scene writes are independent, but flooding the API from one project
    // starves every other client's work.
    concurrency: [{ key: "event.data.projectId", limit: 4 }],
  },
  { event: "studio/pipeline.approved" },
  async ({ event, step }) => {
    const { pipelineId, projectId, userId } = event.data;
    const db = createServiceClient();

    const prep = await step.run("load-plan", async () => {
      await setStage(pipelineId, { state: "writing", stage: "Writing scenes", scenes_done: 0 });

      const { data: pipeline } = await db
        .from("pipelines").select("plan_id, character_id, cost_usd").eq("id", pipelineId).single();
      if (!pipeline?.plan_id) throw new Error("This pipeline has no approved scene plan.");

      const [{ data: planDoc }, { data: charDoc }] = await Promise.all([
        db.from("story_docs").select("body").eq("id", pipeline.plan_id).single(),
        db.from("story_docs").select("body").eq("id", pipeline.character_id!).single(),
      ]);

      const scenes = flattenScenes(planDoc?.body);
      if (scenes.length === 0) throw new Error("The scene plan came back empty.");
      if (scenes.length > MAX_SCENES) {
        throw new Error(
          `${scenes.length} scenes is past the ${MAX_SCENES} cap. Split the brief into parts.`
        );
      }

      return {
        scenes,
        characters: (charDoc?.body as any)?.characters ?? [],
        logline: (planDoc?.body as any)?.logline ?? "",
        priorCost: Number(pipeline.cost_usd),
      };
    });

    let spent = prep.priorCost;

    // step.run per scene: each one is checkpointed, so a failure at scene 40
    // does not re-run and re-charge scenes 1 through 39.
    for (const scene of prep.scenes as Scene[]) {
      const result = await step.run(`scene-${scene.n}`, async () =>
        writeScene({
          pipelineId,
          projectId,
          scene,
          before: prep.scenes.find((s: Scene) => s.n === scene.n - 1),
          after: prep.scenes.find((s: Scene) => s.n === scene.n + 1),
          characters: prep.characters,
          logline: prep.logline,
          userId,
        })
      );

      spent += result.costUsd;
      await step.run(`progress-${scene.n}`, async () => {
        await setStage(pipelineId, {
          scenes_done: scene.n,
          cost_usd: Number(spent.toFixed(4)),
          stage: `Written ${scene.n} of ${prep.scenes.length}`,
        });
      });
    }

    await step.run("finish", async () => {
      await setStage(pipelineId, { state: "done", stage: "Complete", error: null });
    });

    return { scenes: prep.scenes.length, costUsd: spent };
  }
);
