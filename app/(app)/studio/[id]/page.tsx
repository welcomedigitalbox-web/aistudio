import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StageRail } from "@/components/StageRail";
import { Gate } from "@/components/Gate";
import { Locked } from "@/components/Locked";
import { Bootstrap } from "@/components/Bootstrap";
import { BibleEditor } from "@/components/BibleEditor";
import { SourceUpload } from "@/components/SourceUpload";
import { RefPanel } from "@/components/RefPanel";
import { RefSheet } from "@/components/RefSheet";
import { EpisodeCreate } from "@/components/EpisodeCreate";
import { EPISODE_STEPS } from "@/lib/stages";

export const dynamic = "force-dynamic";

/** Novel first, then everything derived from it. */
const STEPS = [
  { id: "add_source",    label: "Add the novel" },
  { id: "reading",       label: "Reading" },
  { id: "draft_bible",   label: "Draft the bible" },
  { id: "approve_bible", label: "Approve the bible" },
  { id: "draft_cast",    label: "Draft the cast" },
  { id: "generate_refs", label: "Generate reference art" },
  { id: "approve_refs",  label: "Approve the cast" },
  { id: "add_episode",   label: "Add episode 1" },
  { id: "ready",         label: "Ready" },
] as const;

const order = (id: string) => STEPS.findIndex((s) => s.id === id);

export default async function ShowPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: series }, { data: stage }, { data: refs }, { data: sources }, { data: episodes }] =
    await Promise.all([
      supabase.from("series").select("*").eq("id", params.id).single(),
      supabase.from("series_stage").select("*").eq("series_id", params.id).single(),
      supabase
        .from("refs")
        .select("id, kind, name, description, chosen_image_id, voice_id, ref_images!ref_images_ref_id_fkey(*)")
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

  const step = stage?.next_step ?? "add_source";
  const at = order(step);
  const reached = (id: string) => at >= order(id);

  // PostgREST names the embed after the constraint, so normalise it back.
  const withImages = (refs ?? []).map((r: any) => ({
    ...r,
    ref_images: r.ref_images ?? r["ref_images!ref_images_ref_id_fkey"] ?? [],
  }));

  const characters = withImages.filter((r: any) => r.kind === "character");
  const sheets = withImages.filter((r: any) => r.kind !== "style");
  const hasSource = (sources ?? []).some((s: any) => s.state === "ready");

  return (
    <main>
      <div className="eyebrow">
        {series.render_style.replace("_", " ")} · {series.target_minutes} min episodes
      </div>
      <h1>{series.title}</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>{series.premise}</p>

      <div style={{ marginTop: 20 }}>
        <StageRail steps={STEPS} currentId={step} />
      </div>

      {/* 1 — novel */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>1 · The novel</h2>
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

      {/* 2 — read it */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>2 · Read it</h2>
      {!hasSource ? (
        <Locked what="Reading the novel" blockedBy="uploading a PDF" />
      ) : (
        <Bootstrap
          seriesId={series.id}
          hasBible={!!series.bible}
          hasCast={characters.length > 0}
          error={series.bootstrap_error}
        />
      )}

      {/* 3 — bible */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>3 · Bible</h2>
      {!series.bible ? (
        <Locked what="The bible" blockedBy="reading the novel" />
      ) : (
        <>
          <BibleEditor seriesId={series.id} bible={series.bible} locked={series.bible_approved} />
          <div style={{ marginTop: 12 }}>
            <Gate
              seriesId={series.id}
              gate="bible_approved"
              approved={series.bible_approved}
              what="The bible"
              unlocks="the cast"
            />
          </div>
        </>
      )}

      {/* 4 — cast */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>4 · Cast</h2>
      {!series.bible_approved ? (
        <Locked what="The cast" blockedBy="approving the bible" />
      ) : (
        <>
          {characters.length === 0 ? (
            <div className="empty">
              No characters drafted yet — run the reader above, or add them by hand below.
            </div>
          ) : (
            <p className="note" style={{ marginBottom: 12 }}>
              Drafted from the novel. Fix any description before generating art — this text goes
              into every image of that character.
            </p>
          )}

          <RefPanel seriesId={series.id} refs={withImages as any} />

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

      {/* 5 — episodes */}
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>5 · Episodes</h2>
      {!reached("add_episode") ? (
        <Locked what="Episodes" blockedBy="approving the cast" />
      ) : (
        <>
          <EpisodeCreate seriesId={series.id} />
          <div className="grid" style={{ marginTop: 12 }}>
            {(episodes ?? []).map((e: any) => (
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
                  <span className="rail-label" style={{ color: "var(--amber)" }}>
                    {EPISODE_STEPS.find((x) => x.id === e.next_step)?.label ?? "Cut"}
                  </span>
                </div>
                {e.shots_total > 0 && (
                  <div className="note mono" style={{ marginTop: 8 }}>
                    {e.keyframes_done}/{e.shots_total} keyframes · {e.clips_done}/{e.shots_total} clips
                  </div>
                )}
              </Link>
            ))}
            {(episodes ?? []).length === 0 && <div className="empty">No episodes yet.</div>}
          </div>
        </>
      )}
    </main>
  );
}
