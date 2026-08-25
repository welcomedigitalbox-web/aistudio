import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { draftPremise, draftOutline, writeChapter, exportToStudio } from "@/lib/agents/lab";

export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const db = createServiceClient();

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

      case "approve-chapter": {
        const { chapterId, approved } = body;
        await db.from("lab_chapters").update({ approved }).eq("id", chapterId);
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
