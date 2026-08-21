import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Projects() {
  const supabase = createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, brief, monthly_budget_usd, clients(name)")
    .eq("archived", false)
    .order("created_at", { ascending: false });

  return (
    <main>
      <div className="eyebrow">Active work</div>
      <h1>Projects</h1>

      <div className="grid two" style={{ marginTop: 24 }}>
        {(projects ?? []).map((p: any) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="card">
            <div className="eyebrow">{(p.clients as any)?.name}</div>
            <h3>{p.name}</h3>
            <p className="note" style={{ marginTop: 6 }}>{p.brief ?? "No brief written yet."}</p>
          </Link>
        ))}
        {(projects ?? []).length === 0 && (
          <div className="empty">
            No projects yet. Add a client and a project in Supabase, or build the create form as your first task.
          </div>
        )}
      </div>
    </main>
  );
}
