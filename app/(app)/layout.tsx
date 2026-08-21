import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/dashboard" className="brand">AI STUDIO</Link>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/projects">Projects</Link>
        </nav>
        <div className="spacer" />
        <span className="mono note">{user?.email}</span>
      </header>
      {children}
    </div>
  );
}
