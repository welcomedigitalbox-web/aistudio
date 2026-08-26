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
  person: string | null;
}

interface Person {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  fal: "fal.ai",
  elevenlabs: "ElevenLabs",
  other: "Other",
};

const CATEGORIES = [
  { id: "all", label: "All", stages: [] as string[] },
  { id: "story", label: "Story", stages: ["research", "character", "scene_plan", "scene script", "script"] },
  { id: "art", label: "Art", stages: ["reference art", "shot"] },
  { id: "voice", label: "Voice", stages: ["voice"] },
  { id: "lab", label: "Lab", stages: ["lab planning", "lab chapter"] },
];

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
  const peak = Math.max(...bars.map((b) => b.cost), 0.0001);
  const shownTotal = bars.reduce((t, b) => t + b.cost, 0);

  const byStage = new Map<string, { cost: number; calls: number }>();
  for (const e of filtered) {
    const prev = byStage.get(e.stage) ?? { cost: 0, calls: 0 };
    byStage.set(e.stage, { cost: prev.cost + Number(e.cost_usd), calls: prev.calls + 1 });
  }
  const stages = [...byStage.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const topStage = stages.length > 0 ? stages[0][1].cost : 1;

  const dayEvents = openDay
    ? filtered.filter((e) => e.created_at.slice(0, 10) === openDay)
    : [];

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
              <div key={id} className="card">
                <div className="row between">
                  <h3>{PROVIDER_LABEL[id] ?? id}</h3>
                  <span className="cost">${v.cost.toFixed(4)}</span>
                </div>
                <div className="note mono" style={{ marginTop: 6 }}>{v.calls} calls</div>
              </div>
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
                <button
                  key={email}
                  onClick={() => {
                    setPerson(person === email ? null : email);
                    setOpenDay(null);
                  }}
                  className="card"
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    borderColor: person === email ? "var(--pine)" : "var(--line)",
                    background: "var(--paper)",
                    color: "var(--ink)",
                  }}
                >
                  <div className="row between">
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ fontSize: 15 }}>{nameFor(email)}</h3>
                      {email !== "unattributed" && (
                        <div className="note mono" style={{ fontSize: 12 }}>{email}</div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="cost">${v.cost.toFixed(4)}</div>
                      <div className="rail-label">{v.calls} calls</div>
                    </div>
                  </div>
                </button>
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
              title={b.day + " — $" + b.cost.toFixed(4)}
              style={{
                flex: 1,
                height: Math.max((b.cost / peak) * 100, b.cost > 0 ? 2 : 0) + "%",
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
          <span className="rail-label">{bars.length > 0 ? bars[0].day : ""}</span>
          <span className="rail-label">
            {bars.length > 0 ? bars[bars.length - 1].day : ""}
          </span>
        </div>
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
                <i style={{ width: (v.cost / topStage) * 100 + "%" }} />
              </div>
            </div>
          ))}
          {stages.length === 0 && <div className="empty">Nothing in this slice.</div>}
