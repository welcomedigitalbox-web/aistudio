import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StudioCreate } from "@/components/StudioCreate";
import { SERIES_STEPS } from "@/lib/stages";

export const dynamic = "force-dynamic";

export default async function StudioIndex() {
  const supabase = createClient();

  const [{ data: stages }, { data: series }] = await Promise.all([
    supabase.from("series_stage").select("*"),
    supabase
      .from("series")
      .select("id, title, premise, render_style, target_minutes, archived")
      .eq("archived", false)
      .order("created_at", { ascending: false }),
  ]);

  const stageFor = (id: string) => (stages ?? []).find((s: any) => s.series_id === id);

  return (
    <main>
      <div className="eyebrow">Animation</div>
      <h1>Studio</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>
        One show per row. Each moves through the same path: bible, novel, cast,
        then episodes.
      </p>

      <div style={{ marginTop: 24 }}>
        <StudioCreate />
      </div>

      <div className="grid" style={{ marginTop: 24 }}>
        {(series ?? []).map((s: any) => {
          const stage = stageFor(s.id);
          const step = SERIES_STEPS.find((x) => x.id === stage?.next_step);
          return (
            <Link key={s.id} href={`/studio/${s.id}`} className="card">
              <div className="row between">
                <div>
                  <div className="eyebrow">
                    {s.render_style.replace("_", " ")} · {s.target_minutes} min
                  </div>
                  <h3>{s.title}</h3>
                </div>
                <span className="rail-label" style={{ color: "var(--amber)" }}>
                  {step?.label ?? "Ready"}
                </span>
              </div>
              {s.premise && <p className="note" style={{ marginTop: 6 }}>{s.premise}</p>}
              {stage && (
                <div className="note mono" style={{ marginTop: 8 }}>
                  {stage.characters_ready}/{stage.characters} cast · {stage.episodes} episodes
                </div>
              )}
            </Link>
          );
        })}
        {(series ?? []).length === 0 && (
          <div className="empty">No shows yet. Start one above.</div>
        )}
      </div>
    </main>
  );
}
