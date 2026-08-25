"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One button that reads the novel and produces both drafts. Neither is
 * approved by it -- the gates are still a person clicking.
 */
export function Bootstrap({
  seriesId,
  hasBible,
  hasCast,
  error,
}: {
  seriesId: string;
  hasBible: boolean;
  hasCast: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [result, setResult] = useState<string>("");

  async function run(only?: "bible" | "cast") {
    setBusy(true);
    setProblem("");
    setResult("");

    const res = await fetch("/api/studio/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, only }),
    });
    const json = await res.json();
    setBusy(false);

    if (!res.ok) return setProblem(json.error ?? "That did not work.");
    if (json.characters != null) {
      setResult(`${json.characters} characters, ${json.locations} locations`);
    }
    router.refresh();
  }

  const done = hasBible && hasCast;

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div>
        <strong>{done ? "Re-read the novel" : "Read the novel"}</strong>
        <div className="note" style={{ marginTop: 4 }}>
          {done
            ? "Runs both passes again. Existing characters keep their images; descriptions are overwritten."
            : "Writes the show bible and lists the cast with image-ready descriptions. Both are drafts — you approve them below."}
        </div>
      </div>

      <div className="row between">
        <span className="note">
          {busy ? "Reading — a full novel takes a minute or two." : "Costs roughly $0.30."}
        </span>
        <div className="row" style={{ gap: 8 }}>
          {done && (
            <>
              <button className="ghost" onClick={() => run("bible")} disabled={busy}>
                Bible only
              </button>
              <button className="ghost" onClick={() => run("cast")} disabled={busy}>
                Cast only
              </button>
            </>
          )}
          <button onClick={() => run()} disabled={busy}>
            {busy ? "Reading…" : done ? "Run both" : "Read and draft"}
          </button>
        </div>
      </div>

      {result && <div className="note">Drafted {result}. Read them before approving.</div>}
      {problem && <div className="err">{problem}</div>}
      {error && !problem && <div className="err">Last run failed: {error}</div>}
    </div>
  );
}
