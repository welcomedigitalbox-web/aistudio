"use client";

export interface Event {
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

export const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  fal: "fal.ai",
  elevenlabs: "ElevenLabs",
  other: "Other",
};

export const CATEGORIES = [
  { id: "all", label: "All", stages: [] as string[] },
  { id: "story", label: "Story", stages: ["research", "character", "scene_plan", "scene script", "script"] },
  { id: "art", label: "Art", stages: ["reference art", "shot"] },
  { id: "voice", label: "Voice", stages: ["voice"] },
  { id: "lab", label: "Lab", stages: ["lab planning", "lab chapter"] },
];

export function StatCard({
  title,
  subtitle,
  cost,
  calls,
  selected,
  onClick,
}: {
  title: string;
  subtitle?: string;
  cost: number;
  calls: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 15 }}>{title}</h3>
          {subtitle && (
            <div className="note mono" style={{ fontSize: 12 }}>{subtitle}</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="cost">${cost.toFixed(4)}</div>
          <div className="rail-label">{calls} calls</div>
        </div>
      </div>
    </>
  );

  if (!onClick) return <div className="card">{inner}</div>;

  return (
    <button
      onClick={onClick}
      className="card"
      style={{
        textAlign: "left",
        cursor: "pointer",
        borderColor: selected ? "var(--pine)" : "var(--line)",
        background: "var(--paper)",
        color: "var(--ink)",
      }}
    >
      {inner}
    </button>
  );
}

export function DayChart({
  bars,
  openDay,
  onPick,
}: {
  bars: { day: string; cost: number }[];
  openDay: string | null;
  onPick: (day: string) => void;
}) {
  const peak = Math.max(...bars.map((b) => b.cost), 0.0001);

  return (
    <>
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
            onClick={() => onPick(b.day)}
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
    </>
  );
}

export function EventRow({ e }: { e: Event }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            {e.stage} · {e.series_title ?? e.lab_title ?? "—"}
          </div>
          <div style={{ fontSize: 14 }}>{e.item}</div>
          <div className="note mono" style={{ fontSize: 11, marginTop: 2 }}>
            {e.model} · {e.person ?? "unattributed"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="cost">${Number(e.cost_usd).toFixed(4)}</div>
          <div className="rail-label">{e.created_at.slice(0, 10)}</div>
        </div>
      </div>
    </div>
  );
}

export function StageBar({
  stage,
  cost,
  calls,
  top,
}: {
  stage: string;
  cost: number;
  calls: number;
  top: number;
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between">
        <div>
          <h3 style={{ fontSize: 14 }}>{stage}</h3>
          <div className="note mono">{calls} calls</div>
        </div>
        <span className="cost">${cost.toFixed(4)}</span>
      </div>
      <div className="meter" style={{ marginTop: 8 }}>
        <i style={{ width: (cost / top) * 100 + "%" }} />
      </div>
    </div>
  );
}
