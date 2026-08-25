import { createClient } from "@/lib/supabase/server";
import { StageRail } from "@/components/StageRail";
import { Locked } from "@/components/Locked";
import { LabSources } from "@/components/LabSources";
import { LabPremise } from "@/components/LabPremise";
import { LabChapters } from "@/components/LabChapters";
import { LabExport } from "@/components/LabExport";

export const dynamic = "force-dynamic";

const STEPS = [
  { id: "add_sources",    label: "Add sources" },
  { id: "draft_premise",  label: "Draft the premise" },
  { id: "draft_outline",  label: "Outline" },
  { id: "write_chapters", label: "Write" },
  { id: "export",         label: "Send to the Studio" },
  { id: "done",           label: "Done" },
] as const;

const order = (id: string) => STEPS.findIndex((s) => s.id === id);

export default async function LabPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: lab }, { data: stage }, { data: sources }, { data: chapters }] =
    await Promise.all([
      supabase.from("lab_projects").select("*").eq("id", params.id).single(),
      supabase.from("lab_stage").select("*").eq("lab_id", params.id).maybeSingle(),
      supabase
        .from("lab_sources")
        .select("source_id, role, note, sources(title, author, state)")
        .eq("lab_id", params.id),
      supabase.from("lab_chapters").select("*").eq("lab_id", params.id).order("n"),
    ]);

  if (!lab) return <main><div className="empty">That story does not exist.</div></main>;

  const step = stage?.next_step ?? "add_sources";
  const at = order(step);
  const reached = (id: string) => at >= order(id);

  const unwritten = (chapters ?? []).filter((c: any) => !c.body).length;

  return (
    <main>
      <div className="eyebrow">Story lab · {lab.output}</div>
      <h1>{lab.title}</h1>
      {lab.brief && <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>{lab.brief}</p>}
      <div className="cost note" style={{ marginTop: 6 }}>
        ${Number(stage?.cost_usd ?? 0).toFixed(3)}
      </div>

      <div style={{ marginTop: 20 }}>
        <StageRail steps={STEPS} currentId={step} />
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>1 · Sources</h2>
      <LabSources
        labId={lab.id}
        sources={(sources ?? []) as any}
        spines={Number(stage?.spines ?? 0)}
      />

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>2 · Premise</h2>
      <LabPremise
        labId={lab.id}
        premise={lab.premise}
        hasSources={(sources ?? []).length > 0}
      />

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>3 · Chapters</h2>
      {!reached("draft_outline") ? (
        <Locked what="Outlining" blockedBy="settling the premise" />
      ) : (
        <LabChapters
          labId={lab.id}
          chapters={(chapters ?? []) as any}
          hasOutline={(chapters ?? []).length > 0}
          hasPremise={!!lab.premise}
          exported={!!lab.exported_source_id}
        />
      )}

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>4 · Export</h2>
      {(chapters ?? []).length === 0 ? (
        <Locked what="Export" blockedBy="writing the chapters" />
      ) : (
        <LabExport
          labId={lab.id}
          ready={unwritten === 0}
          exportedSourceId={lab.exported_source_id}
          unwritten={unwritten}
        />
      )}
    </main>
  );
}
