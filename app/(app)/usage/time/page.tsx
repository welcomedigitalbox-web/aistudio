import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "today",     label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7",         label: "7 days" },
  { key: "30",        label: "30 days" },
  { key: "90",        label: "90 days" },
  { key: "all",       label: "All" },
] as const;

/** What each trainee committed to, per day. */
const COMMITMENT_MIN = 120;

const hm = (mins: number) => {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

/** Dubai's calendar day, which is what every view here buckets by. */
const dayKey = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" })
    .format(new Date(Date.now() - offset * 86_400_000));

const weekday = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short" });

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai",
  });

/** A range key becomes an inclusive [from, to] pair of Dubai dates. */
function windowFor(key: string): { from: string | null; to: string | null; label: string } {
  switch (key) {
    case "today":     return { from: dayKey(0),  to: dayKey(0), label: "Today" };
    case "yesterday": return { from: dayKey(1),  to: dayKey(1), label: "Yesterday" };
    case "30":        return { from: dayKey(29), to: null,      label: "30 days" };
    case "90":        return { from: dayKey(89), to: null,      label: "90 days" };
    case "all":       return { from: null,       to: null,      label: "All" };
    default:          return { from: dayKey(6),  to: null,      label: "7 days" };
  }
}

/**
 * Time on the app, per person per day.
 *
 * Two numbers, and they are not interchangeable. "Open" is the tab being up;
 * "active" is somebody at the keyboard within the last minute. Waiting for a
 * chapter to generate is open but not active -- which is why the commitment
 * table measures open, and why reading one number without the other says the
 * wrong thing about the day.
 *
 * Every grouping happens in SQL (20260920000004_time_views.sql). The page
 * fetches tens of rows rather than tens of thousands, which is what makes the
 * range buttons feel instant.
 */
export default async function TimePage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const supabase = createClient();

  const key = RANGES.some((r) => r.key === searchParams.range) ? searchParams.range! : "7";
  const { from, to, label } = windowFor(key);

  const scope = (q: any) => {
    if (from) q = q.gte("day", from);
    if (to) q = q.lte("day", to);
    return q;
  };

  const [{ data: daily }, { data: byLab }, { data: hourly }, { data: output }] =
    await Promise.all([
      scope(supabase.from("usage_time_daily").select("*"))
        .order("day", { ascending: false }).limit(500),
      scope(supabase.from("usage_time_by_lab").select("*"))
        .order("day", { ascending: false }).limit(500),
      scope(supabase.from("usage_time_hourly").select("who, hour, minutes_active")),
      scope(supabase.from("usage_output_daily").select("*"))
        .order("day", { ascending: false }).limit(500),
    ]);

  const rows = (daily ?? []) as any[];

  // ---- per person, across the window
  const people = new Map<
    string,
    { who: string; open: number; active: number; days: Set<string>; met: number }
  >();
  for (const r of rows) {
    const who = r.full_name ?? r.email;
    const p = people.get(who) ?? { who, open: 0, active: 0, days: new Set<string>(), met: 0 };
    p.open += Number(r.minutes_open);
    p.active += Number(r.minutes_active);
    p.days.add(r.day);
    if (Number(r.minutes_open) >= COMMITMENT_MIN) p.met += 1;
    people.set(who, p);
  }

  const ranked = [...people.values()].sort((a, b) => b.active - a.active);
  const topActive = ranked[0]?.active ?? 0;
  const commitRows = [...people.values()].sort(
    (a, b) => b.met - a.met || b.open - a.open
  );

  // ---- hour-of-day grid
  const grid = new Map<string, number[]>();
  for (const h of (hourly ?? []) as any[]) {
    const row = grid.get(h.who) ?? new Array(24).fill(0);
    row[h.hour] += Number(h.minutes_active);
    grid.set(h.who, row);
  }
  const gridRows = [...grid.entries()]
    .map(([who, row]) => ({ who, row, total: row.reduce((a, b) => a + b, 0) }))
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);

  const peak = Math.max(1, ...gridRows.flatMap((g) => g.row));
  const worked = gridRows.flatMap((g) =>
    g.row.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0)
  );
  const firstHour = worked.length ? Math.min(...worked) : 9;
  const lastHour = worked.length ? Math.max(...worked) : 18;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);

  const rangeText = from && to ? from : from ? `${from} → ${dayKey(0)}` : "everything recorded";

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
          <Link key={r.key} href={`/usage/time?range=${r.key}`} data-on={r.key === key}>
            {r.label}
          </Link>
        ))}
        <span className="note mono" style={{ marginLeft: 6, fontSize: 12 }}>{rangeText}</span>
      </div>

      <h2 style={{ marginTop: 32, marginBottom: 6 }}>Commitment · 2h a day</h2>
      <p className="note" style={{ marginBottom: 12, maxWidth: 640 }}>
        Measured on <strong>open</strong>, not active: waiting for a chapter to
        generate is working, and it produces no keystrokes for minutes at a time.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th className="num">Days seen</th>
              <th className="num">Days met</th>
              <th className="num">Rate</th>
              <th className="num">Avg / day</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {commitRows.map((c) => {
              const rate = c.days.size ? c.met / c.days.size : 0;
              return (
                <tr key={c.who}>
                  <td>{c.who}</td>
                  <td className="num mono dim">{c.days.size}</td>
                  <td className="num mono">{c.met}</td>
                  <td className="num mono barcell" style={{ ["--w" as any]: `${rate * 100}%` }}>
                    <span>{Math.round(rate * 100)}%</span>
                  </td>
                  <td className="num mono dim">{hm(c.open / c.days.size)}</td>
                  <td className="num mono dim">{hm(c.open)}</td>
                </tr>
              );
            })}
            {commitRows.length === 0 && (
              <tr><td colSpan={6} className="dim">Nothing recorded in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 6 }}>When people work</h2>
      <p className="note" style={{ marginBottom: 12, maxWidth: 640 }}>
        Active minutes by hour of day, Dubai time. Darker means more.
      </p>
      <div className="table-wrap">
        <table className="table heat">
          <thead>
            <tr>
              <th>Person</th>
              {hours.map((h) => (
                <th key={h} className="num">{String(h).padStart(2, "0")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gridRows.map((g) => (
              <tr key={g.who}>
                <td>{g.who}</td>
                {hours.map((h) => (
                  <td
                    key={h}
                    className="num mono heatcell"
                    style={{ ["--i" as any]: g.row[h] / peak }}
                    title={`${g.who} · ${String(h).padStart(2, "0")}:00 · ${hm(g.row[h])}`}
                  >
                    {g.row[h] ? Math.round(g.row[h]) : ""}
                  </td>
                ))}
              </tr>
            ))}
            {gridRows.length === 0 && (
              <tr>
                <td colSpan={hours.length + 1} className="dim">
                  No active minutes recorded in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>Per person · {label}</h2>
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
              <tr key={p.who}>
                <td
                  className="barcell"
                  style={{ ["--w" as any]: `${topActive ? (p.active / topActive) * 100 : 0}%` }}
                >
                  <span>{p.who}</span>
                </td>
                <td className="num mono">{hm(p.active)}</td>
                <td className="num mono dim">{hm(p.open)}</td>
                <td className="num mono dim">{p.days.size}</td>
                <td className="num mono dim">{hm(p.active / p.days.size)}</td>
              </tr>
            ))}
            {ranked.length === 0 && (
              <tr><td colSpan={5} className="dim">Nothing recorded in this window.</td></tr>
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
            {rows.map((r, i) => (
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
              <tr><td colSpan={6} className="dim">Nothing recorded in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 6 }}>Chapters written by day</h2>
      <p className="note" style={{ marginBottom: 12, maxWidth: 640 }}>
        Reaches back further than the tables above — chapters have always carried a
        timestamp, so this is the record from before presence tracking started.
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
            {((output ?? []) as any[]).map((r, i) => (
              <tr key={i}>
                <td className="mono">
                  {r.day} <span className="dim">{weekday(r.day)}</span>
                </td>
                <td>{r.who}</td>
                <td className="num mono">{r.chapters}</td>
                <td className="num mono dim">${Number(r.cost_usd).toFixed(3)}</td>
                <td className="num mono dim">
                  ${(Number(r.cost_usd) / r.chapters).toFixed(3)}
                </td>
              </tr>
            ))}
            {(output ?? []).length === 0 && (
              <tr><td colSpan={5} className="dim">No chapters written in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>By story</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th>Person</th><th>Story</th><th className="num">Active</th>
            </tr>
          </thead>
          <tbody>
            {((byLab ?? []) as any[]).map((r, i) => (
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
    </main>
  );
}
