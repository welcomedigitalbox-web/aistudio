"use client";
import { useState } from "react";

interface Daily {
  day: string;
  provider: string;
  cost_usd: number;
  calls: number;
}

interface Event {
  created_at: string;
  cost_usd: number;
  provider: string;
  model: string;
  stage: string;
  item: string | null;
  series_title: string | null;
  lab_title: string | null;
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  fal: "fal.ai",
  elevenlabs: "ElevenLabs",
  other: "Other",
};

const RANGES = [7, 30, 90];

export function UsageView({
  daily,
  events,
  days,
  provider,
}: {
  daily: Daily[];
  events: Event[];
  days: number;
  provider: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(provider);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const filtered = selected ? events.filter((e) => e.provider === selected) : events;
  const filteredDaily = selected ? daily.filter((d) => d.provider === selected) : daily;

  const byProvider = new Map<string, { cost: number; calls: number }>();
  for (const d of daily) {
    const prev = byProvider.get(d.provider) ?? { cost: 0, calls: 0 };
    byProvider.set(d.provider, {
      cost: prev.cost + Number(d.cost_usd),
      calls: prev.calls + Number(d.calls),
    });
  }

  const dayTotals = new Map<string, number>();
  for (const d of filteredDaily) {
    dayTotals.set(d.day, (dayTotals.get(d.day) ?? 0) + Number(d.cost_usd));
  }

  const bars: { day: string; cost: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    bars.push({ day: date, cost: dayTotals.get(date) ?? 0 });
  }

  const peak = Math.max(...bars.map((b) => b.cost), 0.0001);
  const total = bars.reduce((t, b) => t + b.cost, 0);

  const byStage = new Map<string, { cost: number; calls: number }>();
  for (const e of filtered) {
    const prev = byStage.get(e.stage) ?? { cost: 0, calls: 0 };
    byStage.set(e.stage, { cost: prev.cost + Number(e.cost_usd), calls: prev.calls + 1 });
  }
  const stages = [...byStage.entries()].sort((a, b) => b[1].cost - a[1].cost);

  const dayEvents = openDay
    ? filtered.filter((e) => e.created_at.slice(0, 10) === openDay)
    : [];

  return (
    <div style={{ display: "grid", gap: 28, marginTop: 20 }}>
      <div className="row" style={{ gap: 8 }}>
        {RANGES.map((r) => (
          
            key={r}
            href={`/usage?days=${r}${selected ? `&provider=${selected}` : ""}`}
            className={days === r ? "btn" : "btn ghost"}
            style={{ fontSize: 13, padding: "5px 12px" }}
          >
            {r} days
          </a>
        ))}
      </div>

      <div>
        <h2 style={{ marginBottom: 12 }}>Accounts</h2>
        <div className="grid two">
          {[...byProvider.entries()]
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([id, v]) => (
              <button
                key={id}
                onClick={() => {
                  setSelected(selected === id ? null : id);
                  setOpenDay(null);
                }}
                className="card"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: selected === id ? "var(--pine)" : "var(--line)",
                  background: "var(--paper)",
                  color: "var(--ink)",
                }}
              >
                <div className="row between">
                  <h3>{PROVIDER_LABEL[id] ?? id}</h3>
                  <span className="cost">${v.cost.toFixed(4)}</span>
                </div>
                <div className="note mono" style={{ marginTop: 6 }}>
                  {v.calls} calls
                </div>
              </button>
            ))}
          {byProvider.size === 0 && (
            <div className="empty">Nothing spent in this window.</div>
          )}
        </div>
        {selected && (
          <p className="note" style={{ marginTop: 10 }}>
            Showing {PROVIDER_LABEL[selected] ?? selected} only — click the card again to clear.
          </p>
        )}
      </div>

      <div>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>By day</h2>
          <span className="cost">${total.toFixed(4)} over {days} days</span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            height: 140,
            borderBottom: "1px solid var(--line)",
            paddingBottom: 1,
          }}
        >
          {bars.map((b) => (
            <button
              key={b.day}
              onClick={() => setOpenDay(openDay === b.day ? null : b.day)}
              title={`${b.day} — $${b.cost.toFixed(4)}`}
              style={{
                flex: 1,
                height: `${Math.max((b.cost / peak) * 100, b.cost > 0 ? 2 : 0)}%`,
                minHeight: b.cost > 0 ? 2 : 0,
                background: openDay === b.day ? "var(--ink)" : "var(--pine)",
                border: "none",
                borderRadius: "1px 1px 0 0",
                padding: 0,
                cursor: b.cost > 0 ? "pointer" : "default",
                opacity: b.cost > 0 ? 1 : 0.15,
              }}
            />
          ))}
        </div>

        <div className="row between" style={{ marginTop: 6 }}>
          <span className="rail-label">{bars[0]?.day}</span>
          <span className="rail-label">{bars[bars.length - 1]?.day}</span>
        </div>

        {openDay && (
          <div style={{ marginTop: 16 }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="eyebrow" style={{ margin: 0 }}>{openDay}</span>
              <span className="cost">
                ${dayEvents.reduce((t, e) => t + Number(e.cost_usd), 0).toFixed(4)}
              </span>
            </div>
            <div className="grid">
              {dayEvents.map((e, i) => (
                <div key={i} className="card" style={{ padding: 12 }}>
                  <div className="row between">
                    <div style={{ minWidth: 0 }}>
                      <div className="eyebrow">
                        {e.stage} · {e.series_title ?? e.lab_title ?? "—"}
                      </div>
                      <div style={{ fontSize: 14 }}>{e.item}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="cost">${Number(e.cost_usd).toFixed(4)}</div>
                      <div className="rail-label">{e.created_at.slice(11, 16)}</div>
                    </div>
                  </div>
                </div>
              ))}
              {dayEvents.length === 0 && (
                <div className="empty">Nothing on this day.</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 style={{ marginBottom: 12 }}>Where it went</h2>
        <div className="grid">
          {stages.map(([stage, v]) => (
            <div key={stage} className="card" style={{ padding: 12 }}>
              <div className="row between">
                <div>
                  <h3 style={{ fontSize: 14 }}>{stage}</h3>
                  <div className="note mono">{v.calls} calls</div>
                </div>
                <span className="cost">${v.cost.toFixed(4)}</span>
              </div>
              <div className="meter" style={{ marginTop: 8 }}>
                <i style={{ width: `${(v.cost / (stages[0]?.[1].cost || 1)) * 100}%` }} />
              </div>
            </div>
          ))}
          {stages.length === 0 && <div className="empty">Nothing yet.</div>}
        </div>
      </div>

      <div>
        <h2 style={{ marginBottom: 12 }}>Recent calls</h2>
        <div className="grid">
          {filtered.slice(0, 40).map((e, i) => (
            <div key={i} className="card" style={{ padding: 12 }}>
              <div className="row between">
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow">
                    {e.stage} · {e.series_title ?? e.lab_title ?? "—"}
                  </div>
                  <div style={{ fontSize: 14 }}>{e.item}</div>
                  <div className="note mono" style={{ fontSize: 11, marginTop: 2 }}>
                    {e.model}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="cost">${Number(e.cost_usd).toFixed(4)}</div>
                  <div className="rail-label">{e.created_at.slice(0, 10)}</div>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="empty">No calls in this window.</div>}
        </div>
      </div>
    </div>
  );
}
