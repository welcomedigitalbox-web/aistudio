import { createClient } from "@/lib/supabase/server";
import { ShowBoard } from "@/components/ShowBoard";
import { EPISODE_STEPS } from "@/lib/stages";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = createClient();

  const [{ data: stages }, { data: shows }, { data: progress }, { data: people }, { data: episodes }] =
    await Promise.all([
      supabase.from("series_stage").select("*"),
      supabase
        .from("series")
        .select("id, title, archived, completed_at, created_by, render_style, target_minutes"),
      supabase.from("series_progress").select("*"),
      supabase.from("profiles").select("id, email, full_name"),
      supabase.from("episode_stage").select("*").order("n"),
    ]);

  const stageBy = new Map((stages ?? []).map((s: any) => [s.series_id, s]));
  const progressBy = new Map((progress ?? []).map((p: any) => [p.series_id, p]));
  const personBy = new Map((people ?? []).map((p: any) => [p.id, p]));

  const rows = (shows ?? []).map((s: any) => {
    const person = s.created_by ? personBy.get(s.created_by) : null;
    return {
      ...s,
      next_step: stageBy.get(s.id)?.next_step ?? "add_source",
      characters: stageBy.get(s.id)?.characters ?? 0,
      characters_ready: stageBy.get(s.id)?.characters_ready ?? 0,
      episodes: progressBy.get(s.id)?.episodes ?? 0,
      progress: Number(progressBy.get(s.id)?.progress ?? 0),
      creator: person?.full_name ?? person?.email ?? null,
    };
  });

  const waiting = (episodes ?? []).filter((e: any) =>
    ["approve_script", "approve_plan", "approve_shots", "approve_keyframes"].includes(e.next_step)
  );

  return (
    <main>
      <div className="eyebrow">Overview</div>
      <h1>
        {rows.filter((r: any) => !r.archived && !r.completed_at).length} shows in production
      </h1>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>Waiting on you</h2>
      <div className="grid">
        {waiting.map((e: any) => (
          <Link
            key={e.episode_id}
            href={`/studio/${e.series_id}/episodes/${e.episode_id}`}
            className="card"
          >
            <div className="row between">
              <div>
                <div className="eyebrow">Episode {e.n}</div>
                <h3>{e.title}</h3>
              </div>
              <span className="rail-label" style={{ color: "var(--amber)" }}>
                {EPISODE_STEPS.find((s) => s.id === e.next_step)?.label}
              </span>
            </div>
          </Link>
        ))}
        {waiting.length === 0 && (
          <div className="empty">Nothing needs approving right now.</div>
        )}
      </div>

      <ShowBoard rows={rows as any} />
    </main>
  );
}
