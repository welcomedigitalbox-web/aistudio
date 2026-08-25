import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LabCreate } from "@/components/LabCreate";

export const dynamic = "force-dynamic";

const STEP_LABEL: Record<string, string> = {
  add_sources: "Add sources",
  draft_premise: "Draft the premise",
  draft_outline: "Outline the chapters",
  write_chapters: "Write the chapters",
  export: "Send to the Studio",
  done: "Exported",
};

export default async function LabIndex() {
  const supabase = createClient();
  const { data: labs } = await supabase
    .from("lab_stage")
    .select("*")
    .order("title");

  return (
    <main>
      <div className="eyebrow">Story lab</div>
      <h1>Lab</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>
        Build one new book out of several sources, then hand it to the Studio as a novel.
      </p>

      <div style={{ marginTop: 24 }}>
        <LabCreate />
      </div>

      <div className="grid" style={{ marginTop: 24 }}>
        {(labs ?? []).map((l: any) => (
          <Link key={l.lab_id} href={`/lab/${l.lab_id}`} className="card">
            <div className="row between">
              <div>
                <div className="eyebrow">{l.output}</div>
                <h3>{l.title}</h3>
              </div>
              <span className="rail-label" style={{ color: "var(--amber)" }}>
                {STEP_LABEL[l.next_step] ?? l.next_step}
              </span>
            </div>
            <div className="note mono" style={{ marginTop: 8 }}>
              {l.sources} sources · {l.chapters_written}/{l.chapters} chapters · $
              {Number(l.cost_usd).toFixed(3)}
            </div>
          </Link>
        ))}
        {(labs ?? []).length === 0 && (
          <div className="empty">Nothing here yet. Start a story above.</div>
        )}
      </div>
    </main>
  );
}
