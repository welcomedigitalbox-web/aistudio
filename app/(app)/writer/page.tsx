import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WriterIndex() {
  const supabase = createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, brief, clients(name)")
    .eq("archived", false)
    .order("created_at", { ascending: false });

  return (
    <main>
      <div className="eyebrow">Writers&rsquo; room</div>
      <h1>Writer</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>
        Pick a project to work in. Sources and story documents live per project.
      </p>

      <div className="grid two" style={{ marginTop: 24 }}>
        {(projects ?? []).map((p: any) => (
          <Link key={p.id} href={`/writer/${p.id}`} className="card">
            <div className="eyebrow">{(p.clients as any)?.name}</div>
            <h3>{p.name}</h3>
            <p className="note" style={{ marginTop: 6 }}>{p.brief ?? "No brief written yet."}</p>
          </Link>
        ))}
        {(projects ?? []).length === 0 && (
          <div className="empty">No projects yet. Add one before starting a writers&rsquo; room.</div>
        )}
      </div>
    </main>
  );
}
