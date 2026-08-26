"use client";
import { useState } from "react";
import {
  CATEGORIES,
  PROVIDER_LABEL,
  DayChart,
  EventRow,
  StageBar,
  StatCard,
  type Event,
} from "@/components/UsageParts";

interface Daily {
  day: string;
  provider: string;
  cost_usd: number;
  calls: number;
}

interface Person {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

export function UsageView({
  daily,
  events,
  people,
  days,
  isAdmin,
}: {
  daily: Daily[];
  events: Event[];
  people: Person[];
  days: number;
  isAdmin: boolean;
}) {
  const [person, setPerson] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [openDay, setOpenDay] = useState<string | null>(null);

  const cat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];

  let filtered = events;
  if (person) filtered = filtered.filter((e) => (e.person ?? "unattributed") === person);
  if (cat.stages.length > 0) filtered = filtered.filter((e) => cat.stages.includes(e.stage));

  const byProvider = new Map<string, { cost: number; calls: number }>();
  for (const d of daily) {
    const prev = byProvider.get(d.provider) ?? { cost: 0, calls: 0 };
    byProvider.set(d.provider, {
      cost: prev.cost + Number(d.cost_usd),
      calls: prev.calls + Number(d.calls),
    });
  }
  const grandTotal = [...byProvider.values()].reduce((t, v) => t + v.cost, 0);

  const byPerson = new Map<string, { cost: number; calls: number }>();
  for (const e of events) {
    const key = e.person ?? "unattributed";
    const prev = byPerson.get(key) ?? { cost: 0, calls: 0 };
    byPerson.set(key, { cost: prev.cost + Number(e.cost_usd), calls: prev.calls + 1 });
  }

  const dayTotals = new Map<string, number>();
  for (const e of filtered) {
    const day = e.created_at.slice(0, 10);
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + Number(e.cost_usd));
  }

  const bars: { day: string; cost: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    bars.push({ day: date, cost: dayTotals.get(date) ?? 0 });
  }
  const shownTotal = bars.reduce((t, b) => t + b.cost, 0);

  const byStage = new Map<string, { cost: number; calls: number }>();
  for (const e of filtered) {
    const prev = byStage.get(e.stage) ?? { cost: 0, calls: 0 };
    byStage.set(e.stage, { cost: prev.cost + Number(e.cost_usd), calls: prev.calls + 1 });
  }
  const stages = [...byStage.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const topStage = stages.length > 0 ? stages[0][1].cost : 1;

  const shown = openDay
    ? filtered.filter((e) => e.created_at.slice(0, 10) === openDay)
    : filtered;

  function nameFor(email: string) {
    if (email === "unattributed") return "Unattributed";
    const p = people.find((x) => x.email === email);
    return p?.full_name ?? email;
  }

  return (
    <div style={{ display: "grid", gap: 28, marginTop: 20 }}>
      <div>
        <h2 style={{ marginBottom: 12 }}>Accounts</h2>
        <div className="grid two">
          {[...byProvider.entries()]
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([id, v]) => (
              <StatCard
                key={id}
                title={PROVIDER_LABEL[id] ?? id}
                cost={v.cost}
                calls={v.calls}
              />
            ))}
          {byProvider.size === 0 && <div className="empty">Nothing spent in this window.</div>}
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          ${grandTotal.toFixed(4)} across all accounts over {days} days.
        </p>
      </div>

      {isAdmin && (
        <div>
          <h2 style={{ marginBottom: 12 }}>By person</h2>
          <div className="grid two">
            {[...byPerson.entries()]
              .sort((a, b) => b[1].cost - a[1].cost)
              .map(([email, v]) => (
                <StatCard
                  key={email}
                  title={nameFor(email)}
                  subtitle={email === "unattributed" ? undefined : email}
                  cost={v.cost}
                  calls={v.calls}
                  selected={person === email}
                  onClick={() => {
                    setPerson(person === email ? null : email);
                    setOpenDay(null);
                  }}
                />
              ))}
            {byPerson.size === 0 && <div className="empty">Nothing yet.</div>}
          </div>
          {person && (
            <p className="note" style={{ marginTop: 10 }}>
              Showing {nameFor(person)} only — click the card again to clear.
            </p>
          )}
        </div>
      )}

      <div>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>By day</h2>
          <span className="cost">${shownTotal.toFixed(4)}</span>
        </div>
        <DayChart
          bars={bars}
          openDay={openDay}
          onPick={(d) => setOpenDay(openDay === d ? null : d)}
        />
      </div>

      <div>
        <h2 style={{ marginBottom: 12 }}>Where it went</h2>
        <div className="grid">
          {stages.map(([stage, v]) => (
            <StageBar key={stage} stage={stage} cost={v.cost} calls={v.calls} top={topStage} />
          ))}
          {stages.length === 0 && <div className="empty">Nothing in this slice.</div>}
        </div>
      </div>

      <div>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>{openDay ? openDay : "Recent calls"}</h2>
          {openDay && <button className="ghost" onClick={() => setOpenDay(null)}>Show all</button>}
        </div>

        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={category === c.id ? "" : "ghost"}
              onClick={() => setCategory(c.id)}
              style={{ fontSize: 13, padding: "4px 12px" }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="grid">
          {shown.slice(0, 60).map((e, i) => (
            <EventRow key={i} e={e} />
          ))}
          {shown.length === 0 && <div className="empty">Nothing here.</div>}
        </div>
      </div>
    </div>
  );
}
