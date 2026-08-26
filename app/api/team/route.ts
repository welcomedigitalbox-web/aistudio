import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const ROLES = ["admin", "reviewer", "creator"] as const;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Only an admin can change roles." }, { status: 403 });
  }

  const { userId, role } = await req.json();
  if (!userId || !ROLES.includes(role)) {
    return NextResponse.json({ error: "userId and a valid role are required." }, { status: 400 });
  }

  // An admin demoting themselves while alone locks everyone out of role
  // management, and nothing in the UI would explain why.
  if (userId === user.id && role !== "admin") {
    const { count } = await createServiceClient()
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "You are the only admin. Promote someone else first." },
        { status: 409 }
      );
    }
  }

  const { error } = await createServiceClient()
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
