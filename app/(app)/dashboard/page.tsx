import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SERIES_STEPS, EPISODE_STEPS } from "@/lib/stages";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = createClient();

  const [{ data: shows }, { data: episodes }] = await Promise.all([
    supabase.from("series_stage").select("*"),
    supabase.from("episode_stage").select("*").order("n"),
  ]);

  const waiting = (episodes ?? []).filter((e: any) =>
    ["approve_script", "approve_plan", "approve_shots"].includes(e.next_step)
  );

  return (
    <main>
      <div className="eyebrow">Overview</div>
      <h1>{(shows ?? []).length} shows in production</h1>

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

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>Shows</h2>
      <div className="grid two">
        {(shows ?? []).map((s: any) => (
          <Link key={s.series_id} href={`/studio/${s.series_id}`} className="card">
            <div className="row between">
              <h3>{s.title}</h3>
              <span className="rail-label" style={{ color: "var(--amber)" }}>
                {SERIES_STEPS.find((x) => x.id === s.next_step)?.label ?? "Ready"}
              </span>
            </div>
            <div className="note mono" style={{ marginTop: 8 }}>
              {s.characters_ready}/{s.characters} cast · {s.episodes} episodes
            </div>
          </Link>
        ))}
        {(shows ?? []).length === 0 && (
          <div className="empty">No shows yet. Start one in Studio.</div>
        )}
      </div>
    </main>
  );
}
