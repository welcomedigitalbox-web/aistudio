import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { draftPremise, draftOutline, writeChapter, exportToStudio } from "@/lib/agents/lab";
import { labRole, canEdit, canReview, canSee, labIdForChapter } from "@/lib/labAccess";

export const maxDuration = 300;

/** Actions that touch an existing lab, and what they need to be allowed to do. */
const NEEDS: Record<string, "see" | "edit" | "review"> = {
  "add-source": "edit",
  "remove-source": "edit",
  premise: "edit",
  outline: "edit",
  chapter: "edit",
  "save-chapter": "edit",
  "save-premise": "edit",
  "submit-chapter": "edit",
  export: "edit",
  "approve-chapter": "review",
  share: "edit",
  unshare: "edit",
};

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const db = createServiceClient();

  // Everything below writes with the service key, so the gate is here rather
  // than in a policy. Creating is the only action with no lab to check.
  const need = NEEDS[action];
  if (need) {
    const labId = body.labId ?? (body.chapterId ? await labIdForChapter(body.chapterId) : null);
    if (!labId) {
      return NextResponse.json({ error: "That story does not exist." }, { status: 404 });
    }
    const role = await labRole(labId, user.id);
    const ok = need === "edit" ? canEdit(role) : need === "review" ? canReview(role) : canSee(role);
    if (!ok) {
      return NextResponse.json(
        {
          error:
            role === null
              ? "That story is not shared with you."
              : need === "review"
                ? "Approving is a reviewer's job. Ask one to take a look."
                : "You have read-only access to this story.",
        },
        { status: 403 }
      );
    }
    body.labId = labId;
  }

  try {
    switch (action) {
      case "create": {
        const { title, brief, output, targetWords } = body;
        if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

        const { data, error } = await db
          .from("lab_projects")
          .insert({
            title,
            brief: brief || null,
            output: output || "treatment",
            target_words: targetWords || null,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ labId: data.id });
      }

      case "add-source": {
        const { labId, sourceId, role, note } = body;
        const { error } = await db
          .from("lab_sources")
          .upsert(
            { lab_id: labId, source_id: sourceId, role: role || "free", note: note || null },
            { onConflict: "lab_id,source_id" }
          );
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      case "remove-source": {
        const { labId, sourceId } = body;
        await db.from("lab_sources").delete().eq("lab_id", labId).eq("source_id", sourceId);
        return NextResponse.json({ ok: true });
      }

      case "premise":
        return NextResponse.json(await draftPremise(body.labId, body.note));

      case "outline":
        return NextResponse.json(await draftOutline(body.labId, body.note));

      case "chapter":
        return NextResponse.json(await writeChapter(body.chapterId, body.note));

      case "save-chapter": {
        const { chapterId, text } = body;
        const { error } = await db
          .from("lab_chapters")
          .update({ body: text })
          .eq("id", chapterId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      /** Creator says a chapter is finished. Fires the reviewer notification. */
      case "submit-chapter": {
        const { chapterId } = body;
        const { data: ch } = await db
          .from("lab_chapters").select("body").eq("id", chapterId).single();

        if (!ch?.body || !ch.body.trim()) {
          return NextResponse.json(
            { error: "Write the chapter before sending it for review." },
            { status: 409 }
          );
        }

        const { error } = await db
          .from("lab_chapters")
          .update({ submitted_at: new Date().toISOString(), submitted_by: user.id })
          .eq("id", chapterId);

        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      case "approve-chapter": {
        const { chapterId, approved, note } = body;
        const { error } = await db
          .from("lab_chapters")
          .update({
            approved,
            approved_at: approved ? new Date().toISOString() : null,
            approved_by: approved ? user.id : null,
            review_note: note ?? null,
            // Sending it back reopens the queue slot for the next submission.
            submitted_at: approved ? undefined : null,
          })
          .eq("id", chapterId);

        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      /** Sharing. Only the owner reaches this — NEEDS gates it above. */
      case "share": {
        const { labId, email, access = "viewer" } = body;
        if (!["viewer", "editor", "reviewer"].includes(access)) {
          return NextResponse.json({ error: "Unknown access level." }, { status: 400 });
        }

        const { data: target } = await db
          .from("profiles").select("id").ilike("email", String(email ?? "").trim()).maybeSingle();

        if (!target) {
          return NextResponse.json(
            { error: "Nobody on the team has that email. Add them under Team first." },
            { status: 404 }
          );
        }
        if (target.id === user.id) {
          return NextResponse.json({ error: "That story is already yours." }, { status: 409 });
        }

        const { error } = await db
          .from("lab_access")
          .upsert(
            { lab_id: labId, user_id: target.id, access, granted_by: user.id },
            { onConflict: "lab_id,user_id" }
          );

        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      case "unshare": {
        const { labId, userId } = body;
        await db.from("lab_access").delete().eq("lab_id", labId).eq("user_id", userId);
        return NextResponse.json({ ok: true });
      }

      case "save-premise": {
        const { labId, premise } = body;
        await db.from("lab_projects").update({ premise }).eq("id", labId);
        return NextResponse.json({ ok: true });
      }

      case "export":
        return NextResponse.json(await exportToStudio(body.labId));

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
