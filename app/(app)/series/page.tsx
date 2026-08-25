import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SeriesCreate } from "@/components/SeriesCreate";

export const dynamic = "force-dynamic";

export default async function SeriesIndex() {
  const supabase = createClient();

  const [{ data: series }, { data: projects }] = await Promise.all([
    supabase
      .from("series")
      .select("id, title, premise, target_minutes, projects(name)")
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").eq("archived", false).order("name"),
  ]);

  return (
    <main>
      <div className="eyebrow">Episodic work</div>
      <h1>Series</h1>

      <h2 style={{ marginTop: 28, marginBottom: 12 }}>New series</h2>
      <SeriesCreate projects={(projects ?? []) as any} />

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>All series</h2>
      <div className="grid two">
        {(series ?? []).map((s: any) => (
          <Link key={s.id} href={`/series/${s.id}`} className="card">
            <div className="eyebrow">{(s.projects as any)?.name}</div>
            <h3>{s.title}</h3>
            <p className="note" style={{ marginTop: 6 }}>{s.premise ?? "No premise yet."}</p>
            <div className="cost note" style={{ marginTop: 8 }}>{s.target_minutes} min episodes</div>
          </Link>
        ))}
        {(series ?? []).length === 0 && (
          <div className="empty">Nothing yet. Create a series to hold your character bible.</div>
        )}
      </div>
    </main>
  );
}
