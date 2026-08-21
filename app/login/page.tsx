"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function sendLink() {
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
    }
  }

  return (
    <main className="shell" style={{ maxWidth: 380, paddingTop: 120 }}>
      <div className="eyebrow">AI Studio</div>
      <h1>Sign in</h1>
      <p className="note" style={{ marginTop: 8 }}>
        Use your agency email. We send a link, so there is no password to keep track of.
      </p>

      {state === "sent" ? (
        <div className="card" style={{ marginTop: 20 }}>
          Link sent to <span className="mono">{email}</span>. Open it on this device.
        </div>
      ) : (
        <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
          <input
            type="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email && sendLink()}
          />
          <button onClick={sendLink} disabled={!email || state === "sending"}>
            {state === "sending" ? "Sending…" : "Send sign-in link"}
          </button>
          {state === "error" && <div className="err">{message}</div>}
        </div>
      )}
    </main>
  );
}
