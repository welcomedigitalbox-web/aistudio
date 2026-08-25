import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RefPanel } from "@/components/RefPanel";
import { EpisodeCreate } from "@/components/EpisodeCreate";

export const dynamic = "force-dynamic";

export default async function SeriesPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: series }, { data: refs }, { data: episodes }] = await Promise.all([
    supabase.from("series").select("*, projects(id, name)").eq("id", params.id).single(),
    supabase
      .from("refs")
      .select("id, kind, name, description, chosen_image_id, voice_id")
      .eq("series_id", params.id)
      .order("kind")
      .order("name"),
    supabase
      .from("episode_progress")
      .select("*")
      .eq("series_id", params.id)
      .order("n"),
  ]);

  if (!series) return <main><div className="empty">That series does not exist.</div></main>;

  const characters = (refs ?? []).filter((r) => r.kind === "character");
  const unready = characters.filter((r) => !r.chosen_image_id);

  return (
    <main>
      <div className="eyebrow">{(series.projects as any)?.name}</div>
      <h1>{series.title}</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>{series.premise}</p>
      <div className="cost note" style={{ marginTop: 6 }}>
        {series.target_minutes} min · {(episodes ?? []).length} episodes · {characters.length} characters
      </div>

      {unready.length > 0 && (
        <div className="card" style={{ marginTop: 20, borderColor: "var(--amber)" }}>
          <strong>{unready.length} character{unready.length > 1 ? "s have" : " has"} no reference image yet.</strong>
          <div className="note" style={{ marginTop: 4 }}>
            Generate and choose one before starting production — every clip featuring them
            depends on it, and adding it later means regenerating the shots.
          </div>
        </div>
      )}

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>Bible</h2>
      <div className="card">
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, fontSize: 14 }}>
          {series.bible || "No bible written yet. This is the place for tone, visual language, and the rules the show never breaks."}
        </pre>
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>References</h2>
      <RefPanel seriesId={series.id} refs={(refs ?? []) as any} />

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>Episodes</h2>
      <EpisodeCreate seriesId={series.id} />

      <div className="grid" style={{ marginTop: 12 }}>
        {(episodes ?? []).map((e: any) => (
          <Link key={e.episode_id} href={`/episodes/${e.episode_id}`} className="card">
            <div className="row between">
              <div>
                <div className="eyebrow">Episode {e.n} · {e.state.replace("_", " ")}</div>
                <h3>{e.title}</h3>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <span className="cost">${Number(e.cost_usd).toFixed(2)}</span>
              </div>
            </div>
            {e.shots_total > 0 && (
              <div className="note mono" style={{ marginTop: 8 }}>
                {e.keyframes_done}/{e.shots_total} keyframes · {e.clips_done}/{e.shots_total} clips ·
                {" "}{e.shots_approved} approved
              </div>
            )}
          </Link>
        ))}
        {(episodes ?? []).length === 0 && (
          <div className="empty">No episodes yet.</div>
        )}
      </div>
    </main>
  );
}
