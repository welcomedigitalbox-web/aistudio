import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RANGES = [
  { days: 1,   label: "Today" },
  { days: 7,   label: "7 days" },
  { days: 30,  label: "30 days" },
  { days: 90,  label: "90 days" },
  { days: 0,   label: "All" },
] as const;

const hm = (mins: number) => {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

/** Dubai's calendar day, which is what the views bucket by. */
function dayKey(offsetDays = 0) {
  const now = new Date(Date.now() - offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(now);
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai",
  });

const weekday = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short" });

/**
 * Time on the app, per person per day.
 *
 * Two columns on purpose. "Open" is the tab being up; "active" is somebody at
 * the keyboard within the last minute. A long open with a short active is a
 * forgotten tab, and reading one without the other says the wrong thing about
 * the day.
 */
export default async function TimePage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const supabase = createClient();

  const days = RANGES.some((r) => String(r.days) === searchParams.range)
    ? Number(searchParams.range)
    : 7;
  const since = days > 0 ? dayKey(days - 1) : null;

  let dailyQ = supabase.from("usage_time_daily").select("*");
  let labQ = supabase.from("usage_time_by_lab").select("*");
  if (since) {
    dailyQ = dailyQ.gte("day", since);
    labQ = labQ.gte("day", since);
  }

  // Chapters carry their own created_at, so output history reaches back
  // before presence tracking existed -- which is most of the record.
  const [{ data: daily }, { data: byLab }, { data: chapters }] = await Promise.all([
    dailyQ.order("day", { ascending: false }).limit(400),
    labQ.order("day", { ascending: false }).limit(400),
    supabase
      .from("lab_chapters")
      .select("created_at, cost_usd, body, lab_projects(created_by)")
      .not("body", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const { data: profiles } = await supabase.from("profiles").select("id, email, full_name");
  const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name ?? p.email]));

  // Group by Dubai day + author.
  const output = new Map<string, { day: string; who: string; n: number; cost: number }>();
  for (const c of (chapters ?? []) as any[]) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" })
      .format(new Date(c.created_at));
    if (since && day < since) continue;
    const who = nameById.get(c.lab_projects?.created_by) ?? "unattributed";
    const key = day + "|" + who;
    const row = output.get(key) ?? { day, who, n: 0, cost: 0 };
    row.n += 1;
    row.cost += Number(c.cost_usd ?? 0);
    output.set(key, row);
  }
  const outputRows = [...output.values()].sort(
    (a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.n - a.n)
  );

  const rows = daily ?? [];

  // Per person, across the chosen window.
  const people = new Map<
    string,
    { email: string; name: string | null; open: number; active: number; days: Set<string> }
  >();

  for (const r of rows as any[]) {
    const p = people.get(r.email) ?? {
      email: r.email,
      name: r.full_name,
      open: 0,
      active: 0,
      days: new Set<string>(),
    };
    p.open += Number(r.minutes_open);
    p.active += Number(r.minutes_active);
    p.days.add(r.day);
    people.set(r.email, p);
  }

  const ranked = [...people.values()].sort((a, b) => b.active - a.active);
  const top = ranked[0]?.active ?? 0;

  const label = RANGES.find((r) => r.days === days)?.label ?? "7 days";
  const rangeText = since ? `${since} → ${dayKey(0)}` : "everything recorded";

  return (
    <main>
      <div className="eyebrow">Usage</div>
      <h1>Time</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 640 }}>
        Measured in 30-second buckets while the tab is visible. Active means input
        within the last minute.
      </p>

      <div className="filters" style={{ marginTop: 20 }}>
        {RANGES.map((r) => (
          <Link
            key={r.days}
            href={`/usage/time?range=${r.days}`}
            data-on={r.days === days}
          >
            {r.label}
          </Link>
        ))}
        <span className="note mono" style={{ marginLeft: 6, fontSize: 12 }}>
          {rangeText}
        </span>
      </div>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>Per person · {label}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th className="num">Active</th>
              <th className="num">Open</th>
              <th className="num">Days</th>
              <th className="num">Avg / day</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p) => (
              <tr key={p.email}>
                <td
                  className="barcell"
                  style={{ ["--w" as any]: `${top ? (p.active / top) * 100 : 0}%` }}
                >
                  <span>{p.name ?? p.email}</span>
                </td>
                <td className="num mono">{hm(p.active)}</td>
                <td className="num mono dim">{hm(p.open)}</td>
                <td className="num mono dim">{p.days.size}</td>
                <td className="num mono dim">{hm(p.active / p.days.size)}</td>
              </tr>
            ))}
            {ranked.length === 0 && (
              <tr>
                <td colSpan={5} className="dim">
                  Nothing recorded in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>By day</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Person</th>
              <th className="num">Active</th>
              <th className="num">Open</th>
              <th className="num">First</th>
              <th className="num">Last</th>
            </tr>
          </thead>
          <tbody>
            {(rows as any[]).map((r, i) => (
              <tr key={i}>
                <td className="mono">
                  {r.day} <span className="dim">{weekday(r.day)}</span>
                </td>
                <td>{r.full_name ?? r.email}</td>
                <td className="num mono">{hm(Number(r.minutes_active))}</td>
                <td className="num mono dim">{hm(Number(r.minutes_open))}</td>
                <td className="num mono dim">{clock(r.first_seen)}</td>
                <td className="num mono dim">{clock(r.last_seen)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="dim">
                  Nothing recorded in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>By story</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Person</th>
              <th>Story</th>
              <th className="num">Active</th>
            </tr>
          </thead>
          <tbody>
            {(byLab ?? []).map((r: any, i: number) => (
              <tr key={i}>
                <td className="mono">{r.day}</td>
                <td>{r.email}</td>
                <td>{r.lab_title}</td>
                <td className="num mono">{hm(Number(r.minutes_active))}</td>
              </tr>
            ))}
            {(byLab ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="dim">
                  No story-level time yet. It fills in as people work inside a lab.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h2 style={{ marginTop: 36, marginBottom: 12 }}>Chapters written by day</h2>
      <p className="note" style={{ marginTop: -4, marginBottom: 12, maxWidth: 640 }}>
        Reaches back further than the time table — chapters have always carried a
        timestamp, so this is the record before presence tracking started.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Person</th>
              <th className="num">Chapters</th>
              <th className="num">Cost</th>
              <th className="num">Per chapter</th>
            </tr>
          </thead>
          <tbody>
            {outputRows.map((r, i) => (
              <tr key={i}>
                <td className="mono">
                  {r.day} <span className="dim">{weekday(r.day)}</span>
                </td>
                <td>{r.who}</td>
                <td className="num mono">{r.n}</td>
                <td className="num mono dim">${r.cost.toFixed(3)}</td>
                <td className="num mono dim">${(r.cost / r.n).toFixed(3)}</td>
              </tr>
            ))}
            {outputRows.length === 0 && (
              <tr>
                <td colSpan={5} className="dim">No chapters written in this window.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
