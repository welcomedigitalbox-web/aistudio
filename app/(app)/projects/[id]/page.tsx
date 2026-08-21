import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusRail } from "@/components/StatusRail";
import { GenerateForm } from "@/components/GenerateForm";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: project }, { data: assets }, { data: spend }] = await Promise.all([
    supabase.from("projects").select("*, clients(name, brand_voice)").eq("id", params.id).single(),
    supabase
      .from("assets")
      .select("id, title, kind, status, updated_at")
      .eq("project_id", params.id)
      .order("updated_at", { ascending: false }),
    supabase.from("project_spend_current_month").select("*").eq("project_id", params.id).single(),
  ]);

  if (!project) return <main><div className="empty">That project does not exist.</div></main>;

  const pct = spend ? Math.min(100, (Number(spend.spent_usd) / Number(spend.monthly_budget_usd)) * 100) : 0;

  return (
    <main>
      <div className="eyebrow">{(project.clients as any)?.name}</div>
      <h1>{project.name}</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>{project.brief}</p>

      {spend && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="row between">
            <span className="eyebrow" style={{ margin: 0 }}>Spend this month</span>
            <span className="cost">
              ${Number(spend.spent_usd).toFixed(2)} / ${Number(spend.monthly_budget_usd).toFixed(0)} ·
              {" "}video {spend.video_renders}/{spend.monthly_video_quota}
            </span>
          </div>
          <div className="meter" style={{ marginTop: 10 }}>
            <i className={pct > 85 ? "hot" : ""} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>New asset</h2>
      <GenerateForm projectId={project.id} />

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>Assets</h2>
      <div className="grid">
        {(assets ?? []).map((a) => (
          <Link key={a.id} href={`/assets/${a.id}`} className="card">
            <div className="row between">
              <div>
                <div className="eyebrow">{a.kind}</div>
                <h3>{a.title}</h3>
              </div>
              <div style={{ width: 140 }}><StatusRail status={a.status} /></div>
            </div>
          </Link>
        ))}
        {(assets ?? []).length === 0 && <div className="empty">Nothing here yet. Generate the first asset above.</div>}
      </div>
    </main>
  );
}
