"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

const TINT: Record<string, string> = {
  review_requested: "var(--amber)",
  approved: "var(--pine)",
  changes_requested: "var(--amber)",
  shared: "var(--pine)",
};

function ago(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function Bell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  async function load() {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const json = await res.json();
    setItems(json.items ?? []);
  }

  useEffect(() => {
    load();

    // Realtime keeps the badge honest without a poll loop; the interval is a
    // fallback for when the socket drops and nobody notices.
    const supabase = createClient();
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        ({ new: row }) => setItems((prev) => [row as Notification, ...prev].slice(0, 30))
      )
      .subscribe();

    const timer = setInterval(load, 120_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [userId]);

  const unread = items.filter((n) => !n.read_at).length;

  async function markAll() {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  async function markOne(id: number) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        style={{ position: "relative", padding: "4px 10px" }}
      >
        Inbox
        {unread > 0 && (
          <span
            style={{
              marginLeft: 6,
              background: "var(--amber)",
              color: "#1a1a1a",
              borderRadius: 999,
              padding: "1px 7px",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            zIndex: 50,
            padding: 0,
          }}
        >
          <div className="row between" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
            <strong style={{ fontSize: 13 }}>Inbox</strong>
            {unread > 0 && (
              <button className="ghost" onClick={markAll} style={{ fontSize: 12 }}>
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 && <div className="empty" style={{ padding: 20 }}>Nothing yet.</div>}

          {items.map((n) => {
            const row = (
              <div
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--line)",
                  borderLeft: `2px solid ${n.read_at ? "transparent" : TINT[n.kind] ?? "var(--amber)"}`,
                  background: n.read_at ? "transparent" : "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: n.read_at ? 400 : 600 }}>{n.title}</div>
                {n.body && <div className="note" style={{ marginTop: 2, fontSize: 12 }}>{n.body}</div>}
                <div className="note mono" style={{ marginTop: 4, fontSize: 11 }}>{ago(n.created_at)}</div>
              </div>
            );

            return n.href ? (
              <Link key={n.id} href={n.href} onClick={() => markOne(n.id)} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
                {row}
              </Link>
            ) : (
              <div key={n.id} onClick={() => markOne(n.id)}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
