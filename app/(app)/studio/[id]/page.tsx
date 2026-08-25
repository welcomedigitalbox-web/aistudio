import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StageRail } from "@/components/StageRail";
import { Gate } from "@/components/Gate";
import { Locked } from "@/components/Locked";
import { BibleEditor } from "@/components/BibleEditor";
import { SourceUpload } from "@/components/SourceUpload";
import { RefPanel } from "@/components/RefPanel";
import { RefSheet } from "@/components/RefSheet";
import { EpisodeCreate } from "@/components/EpisodeCreate";
import { SERIES_STEPS, seriesStepIndex, EPISODE_STEPS } from "@/lib/stages";

export const dynamic = "force-dynamic";

export default async function ShowPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: series }, { data: stage }, { data: refs }, { data: sources }, { data: episodes }] =
    await Promise.all([
      supabase.from("series").select("*").eq("id", params.id).single(),
      supabase.from("series_stage").select("*").eq("series_id", params.id).single(),
      supabase
        .from("refs")
        .select("id, kind, name, description, chosen_image_id, voice_id, ref_images(*)")
        .eq("series_id", params.id)
        .order("kind")
        .order("name"),
      supabase
        .from("sources")
        .select("id, title, author, basis, state, error")
        .eq("series_id", params.id)
        .order("created_at", { ascending: false }),
      supabase.from("episode_stage").select("*").eq("series_id", params.id).order("n"),
    ]);

  if (!series) return <main><div className="empty">That show does not exist.</div></main>;

  const step = stage?.next_step ?? "write_bible";
  const at = seriesStepIndex(step);
  const reached = (id: string) => at >= seriesStepIndex(id);

  const characters = (refs ?? []).filter((r: any) => r.kind === "character");
  const sheets = (refs ?? []).filter((r: any) => r.kind !== "style");

  return (
    <main>
      <div className="eyebrow">
        {series.render_style.replace("_", " ")} · {series.target_minutes} min episodes
      </div>
      <h1>{series.title}</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>{series.premise}</p>

      <div style={{ marginTop: 20 }}>
        <StageRail steps={SERIES_STEPS} currentId={step} />
      </div>

      {/* 1 — bible */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>1 · Bible</h2>
      <BibleEditor seriesId={series.id} bible={series.bible ?? ""} locked={series.bible_approved} />
      {series.bible && (
        <div style={{ marginTop: 12 }}>
          <Gate
            seriesId={series.id}
            gate="bible_approved"
            approved={series.bible_approved}
            what="The bible"
            unlocks="uploading the novel"
          />
        </div>
      )}

      {/* 2 — source */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>2 · The novel</h2>
      {!reached("add_source") ? (
        <Locked what="Source upload" blockedBy="approving the bible" />
      ) : (
        <>
          <SourceUpload seriesId={series.id} />
          <div className="grid" style={{ marginTop: 12 }}>
            {(sources ?? []).map((s: any) => (
              <div key={s.id} className="card">
                <div className="row between">
                  <div>
                    <h3>{s.title}</h3>
                    <div className="note">{s.author ? `${s.author} · ` : ""}{s.basis.replace("_", " ")}</div>
                  </div>
                  <span className="rail-label">{s.state}</span>
                </div>
                {s.error && <div className="err" style={{ marginTop: 8 }}>{s.error}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 3 — cast */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>3 · Cast</h2>
      {!reached("add_characters") ? (
        <Locked what="Character definition" blockedBy="adding the novel" />
      ) : (
        <>
          <RefPanel seriesId={series.id} refs={(refs ?? []) as any} />
          {sheets.length > 0 && (
            <div className="grid" style={{ marginTop: 12 }}>
              {sheets.map((r: any) => (
                <RefSheet key={r.id} refRow={r} />
              ))}
            </div>
          )}
          {characters.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Gate
                seriesId={series.id}
                gate="refs_approved"
                approved={series.refs_approved}
                what={`The cast (${stage?.characters_ready}/${stage?.characters} with chosen art)`}
                unlocks="episodes"
              />
            </div>
          )}
        </>
      )}

      {/* 4 — episodes */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>4 · Episodes</h2>
      {!reached("add_episode") ? (
        <Locked what="Episodes" blockedBy="approving the cast" />
      ) : (
        <>
          <EpisodeCreate seriesId={series.id} />
          <div className="grid" style={{ marginTop: 12 }}>
            {(episodes ?? []).map((e: any) => {
              const label = EPISODE_STEPS.find((x) => x.id === e.next_step)?.label ?? "Cut";
              return (
                <Link
                  key={e.episode_id}
                  href={`/studio/${series.id}/episodes/${e.episode_id}`}
                  className="card"
                >
                  <div className="row between">
                    <div>
                      <div className="eyebrow">Episode {e.n}</div>
                      <h3>{e.title}</h3>
                    </div>
                    <span className="rail-label" style={{ color: "var(--amber)" }}>{label}</span>
                  </div>
                  {e.shots_total > 0 && (
                    <div className="note mono" style={{ marginTop: 8 }}>
                      {e.keyframes_done}/{e.shots_total} keyframes · {e.clips_done}/{e.shots_total} clips
                    </div>
                  )}
                </Link>
              );
            })}
            {(episodes ?? []).length === 0 && <div className="empty">No episodes yet.</div>}
          </div>
        </>
      )}
    </main>
  );
}
