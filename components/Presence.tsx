"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const PING_MS = 30_000;
// How long after the last keystroke or click the person still counts as active.
const ACTIVE_MS = 60_000;

/**
 * Sends a heartbeat while the tab is visible.
 *
 * Two numbers come out of this: minutes with the app open, and minutes with
 * someone actually at the keyboard. The second one is the honest one, and the
 * difference between them is usually the interesting part.
 *
 * Mounted once in the app layout. It renders nothing.
 */
export function Presence() {
  const path = usePathname();
  const lastInput = useRef(Date.now());

  useEffect(() => {
    const touch = () => { lastInput.current = Date.now(); };
    const events = ["keydown", "pointerdown", "wheel", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    // The route tells us what they were looking at, so time attributes to the
    // right project without any extra plumbing on each page.
    const labId    = /^\/lab\/([0-9a-f-]{36})/.exec(path)?.[1]    ?? null;
    const seriesId = /^\/studio\/([0-9a-f-]{36})/.exec(path)?.[1] ?? null;

    async function ping() {
      if (document.visibilityState !== "visible") return;
      const state = Date.now() - lastInput.current < ACTIVE_MS ? "active" : "idle";
      try {
        await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labId, seriesId, state }),
          keepalive: true,
        });
      } catch {
        // A dropped heartbeat costs one bucket. Not worth retrying.
      }
    }

    ping();
    const timer = setInterval(ping, PING_MS);

    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [path]);

  return null;
}
