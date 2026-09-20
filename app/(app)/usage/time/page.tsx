import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const hm = (mins: number) => {
  const m = Math.round(mins);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

/**
 * Time on the app, per person per day.
 *
 * Two columns on purpose. "Open" is the tab being up; "active" is somebody at
 * the keyboard within the last minute. A long open with a short active is a
 * forgotten tab, and reading one number without the other would say the wrong
 * thing about the day.
 */
export default async function TimePage() {
  const supabase = createClient();

  const [{ data: daily }, { data: byLab }] = await Promise.all([
    supabase.from("usage_time_daily").select("*").order("day", { ascending: false }).limit(120),
    supabase.from("usage_time_by_lab").select("*").order("day", { ascending: false }).limit(60),
  ]);

  const rows = daily ?? [];
  const totals = new Map<string, number>();
  rows.forEach((r: any) => {
    totals.set(r.email, (totals.get(r.email) ?? 0) + Number(r.minutes_active));
  });

  return (
    <main>
      <div className="eyebrow">Usage</div>
      <h1>Time</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>
        Measured in 30-second buckets while the tab is visible. Active means input
        within the last minute.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>Total active per person</h2>
      <div className="grid">
        {[...totals.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([email, mins]) => (
            <div key={email} className="card">
              <div className="eyebrow">{email}</div>
              <h3 className="mono">{hm(mins)}</h3>
            </div>
          ))}
        {totals.size === 0 && (
          <div className="empty">
            No presence recorded yet. It starts collecting the next time someone opens the app.
          </div>
        )}
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>By day</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Day</th><th>Person</th>
            <th className="num">Open</th><th className="num">Active</th>
            <th>First</th><th>Last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i}>
              <td className="mono">{r.day}</td>
              <td>{r.full_name ?? r.email}</td>
              <td className="num mono">{hm(Number(r.minutes_open))}</td>
              <td className="num mono">{hm(Number(r.minutes_active))}</td>
              <td className="mono note">
                {new Date(r.first_seen).toLocaleTimeString("en-GB", {
                  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai",
                })}
              </td>
              <td className="mono note">
                {new Date(r.last_seen).toLocaleTimeString("en-GB", {
                  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>By story</h2>
      <table className="table">
        <thead>
          <tr><th>Day</th><th>Person</th><th>Story</th><th className="num">Active</th></tr>
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
        </tbody>
      </table>
    </main>
  );
}
