"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ReviewPanel({
  assetId,
  status,
  versionId,
  role,
}: {
  assetId: string;
  status: string;
  versionId: string | null;
  role: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canReview = role === "admin" || role === "reviewer";

  async function setStatus(next: string, decision?: string) {
    if (!versionId) {
      setError("Generate a version before moving this through review.");
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (decision) {
      const { error: e } = await supabase.from("approvals").insert({
        version_id: versionId,
        approver_id: user!.id,
        decision,
        note: note || null,
      });
      if (e) {
        setError(e.message);
        setBusy(false);
        return;
      }
    }

    const { error: e2 } = await supabase
      .from("assets")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", assetId);

    setBusy(false);
    if (e2) setError(e2.message);
    else {
      setNote("");
      router.refresh();
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <span className="eyebrow">Review</span>

      {status === "draft" && (
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="note">Send this to the team when the version is worth looking at.</span>
          <button onClick={() => setStatus("internal_review")} disabled={busy}>Send to review</button>
        </div>
      )}

      {status === "internal_review" && canReview && (
        <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
          <textarea
            placeholder="What needs to change? (optional for approval)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ minHeight: 70 }}
          />
          <div className="row" style={{ gap: 8 }}>
            <button onClick={() => setStatus("approved", "approved")} disabled={busy}>Approve</button>
            <button className="ghost" onClick={() => setStatus("draft", "changes_requested")} disabled={busy}>
              Request changes
            </button>
            <button className="ghost" onClick={() => setStatus("rejected", "rejected")} disabled={busy}>
              Reject
            </button>
          </div>
        </div>
      )}

      {status === "internal_review" && !canReview && (
        <div className="note" style={{ marginTop: 8 }}>Waiting on a reviewer.</div>
      )}

      {status === "approved" && (
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="note">Approved and ready to go out.</span>
          <button onClick={() => setStatus("published")} disabled={busy}>Mark published</button>
        </div>
      )}

      {status === "published" && <div className="note" style={{ marginTop: 8 }}>Published.</div>}
      {status === "rejected" && <div className="note" style={{ marginTop: 8 }}>Rejected. Generate a new version to restart.</div>}

      {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
