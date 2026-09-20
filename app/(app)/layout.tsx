import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Presence } from "@/components/Presence";
import { Bell } from "@/components/Bell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();

  // Anyone can end up with something to review -- a creator who shares a story
  // is a reviewer on someone else's. So the tab is shown by role OR by grant.
  const { count: queued } = await supabase
    .from("review_queue").select("chapter_id", { count: "exact", head: true });

  const showReview = me?.role === "admin" || me?.role === "reviewer" || (queued ?? 0) > 0;

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/studio" className="brand">AI STUDIO</Link>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/lab">Lab</Link>
          <Link href="/studio">Studio</Link>
          {showReview && (
            <Link href="/review">
              Review
              {(queued ?? 0) > 0 && (
                <span className="mono" style={{ color: "var(--amber)", marginLeft: 4 }}>
                  {queued}
                </span>
              )}
            </Link>
          )}
          <Link href="/usage">Usage</Link>
          {me?.role === "admin" && <Link href="/team">Team</Link>}
        </nav>
        <div className="spacer" />
        <Bell userId={user.id} />
        <span className="mono note" style={{ marginLeft: 12 }}>{user.email}</span>
      </header>
      <Presence />
      {children}
    </div>
  );
}
