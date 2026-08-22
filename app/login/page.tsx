"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setBusy(false);
      if (error) return setError(error.message);
      if (!data.session) {
        return setNotice("Account created. Check your email to confirm, then sign in.");
      }
      router.push("/dashboard");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="shell" style={{ maxWidth: 380, paddingTop: 100 }}>
      <div className="eyebrow">AI Studio</div>
      <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>
      <p className="note" style={{ marginTop: 8 }}>
        {mode === "signin"
          ? "Use your agency email and password."
          : "Set up an account for the team workspace."}
      </p>

      <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
        {mode === "signup" && (
          <input
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}

        <input
          type="email"
          placeholder="you@agency.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && email && password && submit()}
        />

        <button onClick={submit} disabled={busy || !email || !password}>
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        {error && <div className="err">{error}</div>}
        {notice && <div className="note">{notice}</div>}

        <button
          className="ghost"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
            setNotice("");
          }}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
