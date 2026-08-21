import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusRail } from "@/components/StatusRail";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = createClient();

  const [{ data: spend }, { data: queue }] = await Promise.all([
    supabase.from("project_spend_current_month").select("*"),
    supabase
      .from("assets")
      .select("id, title, kind, status, updated_at, projects(name)")
      .eq("status", "internal_review")
      .order("updated_at", { ascending: true })
      .limit(10),
  ]);

  const totalSpend = (spend ?? []).reduce((s, r: any) => s + Number(r.spent_usd), 0);

  return (
    <main>
      <div className="eyebrow">This month</div>
      <h1>
        <span className="cost" style={{ fontSize: 28 }}>${totalSpend.toFixed(2)}</span> spent across{" "}
        {(spend ?? []).length} projects
      </h1>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>Budgets</h2>
      <div className="grid two">
        {(spend ?? []).map((p: any) => {
          const pct = Math.min(100, (Number(p.spent_usd) / Number(p.monthly_budget_usd)) * 100);
          return (
            <Link key={p.project_id} href={`/projects/${p.project_id}`} className="card">
              <div className="row between">
                <h3>{p.project_name}</h3>
                <span className="cost">${Number(p.spent_usd).toFixed(2)} / ${Number(p.monthly_budget_usd).toFixed(0)}</span>
              </div>
              <div className="meter" style={{ marginTop: 10 }}>
                <i className={pct > 85 ? "hot" : ""} style={{ width: `${pct}%` }} />
              </div>
              <div className="note mono" style={{ marginTop: 6 }}>
                video {p.video_renders}/{p.monthly_video_quota}
              </div>
            </Link>
          );
        })}
        {(spend ?? []).length === 0 && <div className="empty">No projects yet. Add one to start tracking spend.</div>}
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>Waiting on review</h2>
      <div className="grid">
        {(queue ?? []).map((a: any) => (
          <Link key={a.id} href={`/assets/${a.id}`} className="card">
            <div className="row between">
              <div>
                <div className="eyebrow">{(a.projects as any)?.name} · {a.kind}</div>
                <h3>{a.title}</h3>
              </div>
              <div style={{ width: 140 }}><StatusRail status={a.status} /></div>
            </div>
          </Link>
        ))}
        {(queue ?? []).length === 0 && <div className="empty">Nothing is waiting. Send an asset to review to fill this list.</div>}
      </div>
    </main>
  );
}
