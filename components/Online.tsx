"use client";
import { useEffect, useState } from "react";

export interface OnlinePerson {
  id: string;
  name: string;
  state: "active" | "idle";
  lastSeen: string;
}

// One poll shared by every dot on the page.
let cache: OnlinePerson[] = [];
const listeners = new Set<(o: OnlinePerson[]) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function poll() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  try {
    const res = await fetch("/api/presence", { cache: "no-store" });
    if (!res.ok) return;
    cache = (await res.json()).online ?? [];
    listeners.forEach((l) => l(cache));
  } catch {
    // Next poll will catch up.
  }
}

export function useOnline() {
  const [online, setOnline] = useState<OnlinePerson[]>(cache);
  useEffect(() => {
    listeners.add(setOnline);
    if (!timer) {
      poll();
      timer = setInterval(poll, 30_000);
    }
    return () => {
      listeners.delete(setOnline);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return online;
}

const COLOR = { active: "#22C55E", idle: "#C87A16" } as const;

function Dot({ state, size = 9 }: { state: "active" | "idle"; size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: COLOR[state],
        boxShadow: state === "active" ? `0 0 0 3px ${COLOR.active}33` : undefined,
        flex: "none",
      }}
    />
  );
}

/** Green when they are online and active, amber when the tab is open but idle, nothing when away. */
export function OnlineDot({ userId }: { userId: string }) {
  const p = useOnline().find((x) => x.id === userId);
  if (!p) return null;
  return (
    <span title={p.state === "active" ? "Online" : "Online · idle"} style={{ marginLeft: 6, verticalAlign: "middle" }}>
      <Dot state={p.state} />
    </span>
  );
}

/** Top bar: how many are online, names on click. */
export function OnlineNow({ meId }: { meId: string }) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  if (online.length === 0) return null;
  const active = online.filter((p) => p.state === "active").length;

  return (
    <div style={{ position: "relative", marginRight: 12 }}>
      <button
        className="ghost"
        onClick={() => setOpen(!open)}
        style={{ fontSize: 12, padding: "3px 10px", display: "flex", alignItems: "center", gap: 6 }}
        title="Who is online"
      >
        <Dot state={active > 0 ? "active" : "idle"} />
        {online.length} online
      </button>
      {open && (
        <div
          className="card"
          style={{ position: "absolute", right: 0, top: "110%", zIndex: 50, minWidth: 200, padding: 10, display: "grid", gap: 6 }}
        >
          {online.map((p) => (
            <div key={p.id} className="row" style={{ gap: 8, alignItems: "center", fontSize: 13 }}>
              <Dot state={p.state} />
              <span>{p.name}{p.id === meId ? " (you)" : ""}</span>
              <span className="note" style={{ fontSize: 11, marginLeft: "auto" }}>
                {p.state === "active" ? "active" : "idle"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
