import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Accepts the PDF, stores it, and creates the source row. Extraction happens
 * separately -- a long book takes longer than a request should.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const projectId = form.get("projectId") as string | null;
  const title = form.get("title") as string | null;
  const author = (form.get("author") as string) || null;
  const basis = form.get("basis") as string | null;
  const basisNote = (form.get("basisNote") as string) || null;

  if (!file || !projectId || !title || !basis) {
    return NextResponse.json(
      { error: "file, projectId, title and basis are required." },
      { status: 400 }
    );
  }
  if (!["own", "licensed", "public_domain"].includes(basis)) {
    return NextResponse.json({ error: "Invalid rights basis." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
  }
  if (file.size > 40 * 1024 * 1024) {
    return NextResponse.json({ error: "That PDF is over the 40MB limit." }, { status: 400 });
  }

  const db = createServiceClient();
  const key = `${projectId}/${crypto.randomUUID()}.pdf`;

  const { error: upErr } = await db.storage
    .from("sources")
    .upload(key, await file.arrayBuffer(), { contentType: "application/pdf" });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data, error } = await db
    .from("sources")
    .insert({
      project_id: projectId,
      title,
      author,
      basis,
      basis_note: basisNote,
      storage_key: key,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sourceId: data.id });
}
