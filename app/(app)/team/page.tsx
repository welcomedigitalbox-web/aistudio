import { createClient } from "@/lib/supabase/server";
import { TeamManager } from "@/components/TeamManager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: me }, { data: people }, { data: shows }, { data: grants }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user?.id ?? "").single(),
    supabase.from("profiles").select("id, email, full_name, role, created_at").order("email"),
    supabase.from("series").select("id, title").eq("archived", false).order("title"),
    supabase.from("show_access").select("user_id, series_id"),
  ]);

  const isAdmin = me?.role === "admin";

  if (!isAdmin) {
    return (
      <main>
        <div className="eyebrow">People</div>
        <h1>Team</h1>
        <div className="empty" style={{ marginTop: 24 }}>
          Only an admin can manage the team.
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="eyebrow">People</div>
      <h1>Team</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>
        Creators make the work on the shows they are given. Reviewers approve, and see
        everything. Admins do both, plus this page.
      </p>

      <div style={{ marginTop: 24 }}>
        <TeamManager
          people={(people ?? []) as any}
          shows={(shows ?? []) as any}
          grants={(grants ?? []) as any}
          meId={user?.id ?? ""}
        />
      </div>
    </main>
  );
}
