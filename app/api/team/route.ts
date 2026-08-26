import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const ROLES = ["admin", "reviewer", "creator"] as const;

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first.", status: 401 as const };

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();

  if (me?.role !== "admin") {
    return { error: "Only an admin can manage the team.", status: 403 as const };
  }
  return { user };
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const db = createServiceClient();

  switch (body.action) {
    /**
     * Create the account outright. The admin sets the first password and hands
     * it over; there is no invite mail to configure and nothing to expire.
     */
    case "create": {
      const { email, password, fullName, role } = body;
      if (!email || !password) {
        return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
      }
      if (String(password).length < 8) {
        return NextResponse.json(
          { error: "Use at least 8 characters — this password gets handed to a person." },
          { status: 400 }
        );
      }
      if (role && !ROLES.includes(role)) {
        return NextResponse.json({ error: "Unknown role." }, { status: 400 });
      }

      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName || null },
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // The signup trigger writes the profile; set the role on top of it.
      if (role && role !== "creator") {
        await db.from("profiles").update({ role }).eq("id", data.user.id);
      }

      return NextResponse.json({ userId: data.user.id });
    }

    case "role": {
      const { userId, role } = body;
      if (!userId || !ROLES.includes(role)) {
        return NextResponse.json({ error: "userId and a valid role are required." }, { status: 400 });
      }

      // An admin demoting themselves while alone locks everyone out of role
      // management, and nothing in the UI would explain why.
      if (userId === auth.user.id && role !== "admin") {
        const { count } = await db
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

      const { error } = await db.from("profiles").update({ role }).eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "password": {
      const { userId, password } = body;
      if (!userId || String(password ?? "").length < 8) {
        return NextResponse.json(
          { error: "A userId and a password of at least 8 characters are required." },
          { status: 400 }
        );
      }
      const { error } = await db.auth.admin.updateUserById(userId, { password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    case "grant": {
      const { userId, seriesId } = body;
      if (!userId || !seriesId) {
        return NextResponse.json({ error: "userId and seriesId are required." }, { status: 400 });
      }
      const { error } = await db
        .from("show_access")
        .upsert(
          { user_id: userId, series_id: seriesId, granted_by: auth.user.id },
          { onConflict: "series_id,user_id" }
        );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "revoke": {
      const { userId, seriesId } = body;
      await db.from("show_access").delete().eq("user_id", userId).eq("series_id", seriesId);
      return NextResponse.json({ ok: true });
    }

    /**
     * Deleting the auth user cascades to the profile and the grants. Their
     * work stays; the usage rows fall back to unattributed.
     */
    case "remove": {
      const { userId } = body;
      if (userId === auth.user.id) {
        return NextResponse.json({ error: "You cannot remove yourself." }, { status: 409 });
      }
      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }
}
