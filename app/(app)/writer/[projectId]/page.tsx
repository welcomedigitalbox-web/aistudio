import { createClient } from "@/lib/supabase/server";
import { SourceUpload } from "@/components/SourceUpload";
import { AgentPanel } from "@/components/AgentPanel";
import { DocList } from "@/components/DocList";

export const dynamic = "force-dynamic";

export default async function WriterPage({ params }: { params: { projectId: string } }) {
  const supabase = createClient();

  const [{ data: project }, { data: sources }, { data: docs }] = await Promise.all([
    supabase.from("projects").select("id, name, clients(name)").eq("id", params.projectId).single(),
    supabase
      .from("sources")
      .select("id, title, author, basis, state, error, created_at")
      .eq("project_id", params.projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("story_docs")
      .select("id, agent, title, body, cost_usd, created_at")
      .eq("project_id", params.projectId)
      .order("created_at", { ascending: false }),
  ]);

  if (!project) return <main><div className="empty">That project does not exist.</div></main>;

  const spend = (docs ?? []).reduce((s, d: any) => s + Number(d.cost_usd), 0);

  return (
    <main>
      <div className="eyebrow">{(project.clients as any)?.name} · Writer</div>
      <h1>{project.name}</h1>
      <div className="cost note" style={{ marginTop: 6 }}>
        {(docs ?? []).length} documents · {(sources ?? []).length} sources · ${spend.toFixed(4)}
      </div>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>Writers&rsquo; room</h2>
      <AgentPanel
        projectId={project.id}
        docs={(docs ?? []).map((d) => ({ id: d.id, agent: d.agent, title: d.title }))}
        sources={(sources ?? []).map((s) => ({ id: s.id, title: s.title, state: s.state }))}
      />

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>Documents</h2>
      <DocList docs={(docs ?? []) as any} />

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>Source library</h2>
      <SourceUpload projectId={project.id} />

      <div className="grid" style={{ marginTop: 12 }}>
        {(sources ?? []).map((s: any) => (
          <div key={s.id} className="card">
            <div className="row between">
              <div>
                <h3>{s.title}</h3>
                <div className="note">
                  {s.author ? `${s.author} · ` : ""}
                  {s.basis.replace("_", " ")}
                </div>
              </div>
              <span className="rail-label">{s.state}</span>
            </div>
            {s.error && <div className="err" style={{ marginTop: 8 }}>{s.error}</div>}
          </div>
        ))}
        {(sources ?? []).length === 0 && (
          <div className="empty">No sources yet. Upload a PDF to give the agents something to work from.</div>
        )}
      </div>
    </main>
  );
}
