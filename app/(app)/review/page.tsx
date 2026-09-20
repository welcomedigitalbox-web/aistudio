import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function waited(interval: string | null) {
  if (!interval) return "";
  const h = /(\d+):(\d+):/.exec(interval);
  const days = /(\d+) day/.exec(interval);
  if (days) return `${days[1]}d waiting`;
  if (h && Number(h[1]) > 0) return `${Number(h[1])}h waiting`;
  return "just now";
}

/**
 * What is on my desk.
 *
 * RLS already limits review_queue to labs shared with this person, so there is
 * no filter here -- an empty page means an empty desk, not a missing query.
 */
export default async function ReviewPage() {
  const supabase = createClient();

  const { data: queue } = await supabase
    .from("review_queue")
    .select("*")
    .order("submitted_at", { ascending: true });

  return (
    <main>
      <div className="eyebrow">Review</div>
      <h1>On your desk</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>
        Chapters submitted for sign-off, oldest first.
      </p>

      <div className="grid" style={{ marginTop: 24 }}>
        {(queue ?? []).map((r: any) => (
          <Link key={r.chapter_id} href={`/lab/${r.lab_id}#ch-${r.n}`} className="card">
            <div className="row between">
              <div>
                <div className="eyebrow">{r.lab_title}</div>
                <h3>
                  Chapter {r.n}
                  {r.chapter_title ? ` — ${r.chapter_title}` : ""}
                </h3>
              </div>
              <span className="rail-label" style={{ color: "var(--amber)" }}>
                {waited(r.waiting)}
              </span>
            </div>
            <div className="note mono" style={{ marginTop: 8 }}>
              {r.submitted_by_name ?? r.submitted_by_email ?? "unknown"} ·{" "}
              {Number(r.body_length ?? 0).toLocaleString()} characters
            </div>
          </Link>
        ))}

        {(queue ?? []).length === 0 && (
          <div className="empty">Nothing waiting. Everything submitted has been signed off.</div>
        )}
      </div>
    </main>
  );
}
