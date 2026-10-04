"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
type Thread = { threadId: string; title: string; updatedAt: string };

/**
 * A help desk that lives on every page. It quietly records the errors the app
 * raises (any /api call that fails, plus uncaught script errors), so when
 * something breaks the person presses "Explain this error" here instead of
 * copying it somewhere else.
 */
const errorLog: string[] = [];
const listeners = new Set<() => void>();
let installed = false;

function record(entry: string) {
  const clean = entry.replace(/\s+/g, " ").trim().slice(0, 400);
  if (!clean) return;
  // Pollers repeat the same failure every few seconds; keep it once.
  if (errorLog[errorLog.length - 1]?.endsWith(clean)) return;
  const stamp = new Date().toLocaleTimeString();
  errorLog.push(`[${stamp}] ${clean}`);
  if (errorLog.length > 20) errorLog.shift();
  listeners.forEach((l) => l());
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, window.location.href);
      if (!res.ok && path.origin === window.location.origin && path.pathname.startsWith("/api/") && !path.pathname.startsWith("/api/help")) {
        const body = await res.clone().text().catch(() => "");
        let message = body;
        try {
          const json = JSON.parse(body);
          message = json.error ?? json.message ?? body;
        } catch {
          /* not JSON — keep the text */
        }
        let action = "";
        try {
          action = init?.body && typeof init.body === "string" ? JSON.parse(init.body).action ?? "" : "";
        } catch {
          /* body was not JSON */
        }
        record(`${init?.method ?? "GET"} ${path.pathname}${action ? ` (${action})` : ""} → ${res.status} ${res.statusText}: ${String(message).slice(0, 300)}`);
      }
    } catch {
      /* never let logging break the request */
    }
    return res;
  };

  window.addEventListener("error", (e) => record(`Script error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) =>
    record(`Unhandled: ${(e.reason && (e.reason.message || String(e.reason))) || "unknown"}`)
  );
}

function visibleErrors(): string[] {
  return [...document.querySelectorAll(".err")]
    .map((el) => (el as HTMLElement).innerText.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function pageText(): string {
  const main = document.querySelector("main") ?? document.body;
  return (main as HTMLElement).innerText.slice(0, 6000);
}

export function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    install();
    const onError = () => {
      setLastError(errorLog[errorLog.length - 1] ?? null);
      setUnseen((n) => n + 1);
    };
    listeners.add(onError);
    return () => {
      listeners.delete(onError);
    };
  }, []);

  // History lives in the database: open the panel where the person left off.
  async function load(thread?: string) {
    try {
      const res = await fetch(`/api/help${thread ? `?thread=${thread}` : ""}`);
      const json = await res.json();
      setThreads(json.threads ?? []);
      setThreadId(json.threadId ?? null);
      setMessages(json.messages ?? []);
    } catch {
      /* history is a convenience; the chat still works without it */
    }
    setLoaded(true);
  }

  useEffect(() => {
    if (open && !loaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function newChat() {
    setThreadId(null);
    setMessages([]);
    setShowHistory(false);
  }

  async function removeThread(id: string) {
    await fetch(`/api/help?thread=${id}`, { method: "DELETE" }).catch(() => null);
    setThreads((t) => t.filter((x) => x.threadId !== id));
    if (id === threadId) newChat();
  }

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          question: q,
          messages: next,
          context: {
            path: window.location.pathname,
            errors: [...errorLog, ...visibleErrors().map((e) => `On screen: ${e}`)],
            page: pageText(),
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      setMessages([...next, { role: "assistant", content: json.reply ?? json.error ?? "No answer came back." }]);
      if (json.threadId) {
        const isNew = json.threadId !== threadId;
        setThreadId(json.threadId);
        setThreads((t) => {
          const rest = t.filter((x) => x.threadId !== json.threadId);
          const title = isNew ? q.slice(0, 80) : t.find((x) => x.threadId === json.threadId)?.title ?? q.slice(0, 80);
          return [{ threadId: json.threadId, title, updatedAt: new Date().toISOString() }, ...rest];
        });
      }
    } catch (e) {
      setMessages([...next, { role: "assistant", content: `Could not reach the help assistant: ${(e as Error).message}` }]);
    }
    setBusy(false);
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen((o) => !o);
          setUnseen(0);
        }}
        aria-label="Help"
        style={{
          position: "fixed", right: 20, bottom: 20, zIndex: 50,
          width: 48, height: 48, borderRadius: 24, padding: 0,
          fontSize: 20, fontWeight: 700, boxShadow: "0 4px 16px rgba(0,0,0,.18)",
        }}
      >
        ?
        {unseen > 0 && !open && (
          <span style={{
            position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
            background: "#c0392b", color: "#fff", fontSize: 11, lineHeight: "18px", padding: "0 5px",
          }}>
            {unseen}
          </span>
        )}
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "fixed", right: 20, bottom: 80, zIndex: 50,
            width: "min(420px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 120px))",
            display: "flex", flexDirection: "column", gap: 8, padding: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,.22)",
          }}
        >
          <div className="row between">
            <strong>Help</strong>
            <div className="row" style={{ gap: 6 }}>
              <button className="ghost" onClick={() => setShowHistory((h) => !h)} style={{ fontSize: 12, padding: "2px 8px" }}>
                {showHistory ? "Back" : `History${threads.length ? ` (${threads.length})` : ""}`}
              </button>
              <button className="ghost" onClick={newChat} disabled={busy} style={{ fontSize: 12, padding: "2px 8px" }}>
                New chat
              </button>
              <button className="ghost" onClick={() => setOpen(false)} style={{ fontSize: 12, padding: "2px 8px" }}>
                Close
              </button>
            </div>
          </div>

          {showHistory && (
            <div style={{ flex: 1, overflowY: "auto", display: "grid", gap: 4, alignContent: "start" }}>
              {threads.length === 0 && <p className="note" style={{ margin: 0 }}>No past chats yet.</p>}
              {threads.map((t) => (
                <div
                  key={t.threadId}
                  className="row between"
                  style={{
                    gap: 6, padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                    background: t.threadId === threadId ? "rgba(0,0,0,.06)" : "transparent",
                  }}
                  onClick={() => {
                    setShowHistory(false);
                    load(t.threadId);
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.title || "(untitled)"}
                    </div>
                    <div className="note" style={{ fontSize: 11 }}>{new Date(t.updatedAt).toLocaleString()}</div>
                  </div>
                  <button
                    className="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this chat?")) removeThread(t.threadId);
                    }}
                    style={{ fontSize: 11, padding: "1px 6px" }}
                    aria-label="Delete chat"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {!showHistory && lastError && (
            <div className="err" style={{ fontSize: 12, display: "grid", gap: 6 }}>
              <span style={{ wordBreak: "break-word" }}>{lastError}</span>
              <button
                onClick={() => ask("ဒီ error က ဘာလဲ၊ ဘယ်လို ဖြေရှင်းရမလဲ? / What does this error mean and how do I fix it?")}
                disabled={busy}
                style={{ justifySelf: "start", fontSize: 12, padding: "3px 10px" }}
              >
                Explain this error
              </button>
            </div>
          )}

          <div ref={scroller} style={{ flex: 1, overflowY: "auto", display: showHistory ? "none" : "grid", gap: 8, alignContent: "start" }}>
            {messages.length === 0 && (
              <p className="note" style={{ margin: 0 }}>
                Ask anything about this page — what a button does, why something failed, what to do next. It sees the page you are on and any error the app just raised. မြန်မာလိုလည်း မေးလို့ရပါတယ်။
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  justifySelf: m.role === "user" ? "end" : "start",
                  maxWidth: "88%", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55,
                  padding: "8px 10px", borderRadius: 8,
                  background: m.role === "user" ? "var(--pine, #2f5d50)" : "rgba(0,0,0,.05)",
                  color: m.role === "user" ? "#fff" : "inherit",
                }}
              >
                {m.content}
              </div>
            ))}
            {busy && <span className="note">Thinking…</span>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            style={{ display: showHistory ? "none" : "flex", gap: 6 }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
              rows={2}
              placeholder="Ask about this page…"
              style={{ flex: 1, fontSize: 13, fontFamily: "inherit", resize: "none" }}
            />
            <button type="submit" disabled={busy || !draft.trim()} style={{ alignSelf: "stretch" }}>
              Ask
            </button>
          </form>
        </div>
      )}
    </>
  );
}
