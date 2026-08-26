import { createClient } from "@/lib/supabase/server";
import { TeamTable } from "@/components/TeamTable";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: me }, { data: people }, { data: spend }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user?.id ?? "").single(),
    supabase.from("profiles").select("id, email, full_name, role, created_at").order("email"),
    supabase.from("usage_by_person").select("*"),
  ]);

  // Roll provider rows up per person for the table.
  const byPerson = new Map<string, { cost: number; calls: number }>();
  for (const row of spend ?? []) {
    const prev = byPerson.get(row.person) ?? { cost: 0, calls: 0 };
    byPerson.set(row.person, {
      cost: prev.cost + Number(row.cost_usd),
      calls: prev.calls + Number(row.calls),
    });
  }

  return (
    <main>
      <div className="eyebrow">People</div>
      <h1>Team</h1>
      <p className="note" style={{ marginTop: 8, maxWidth: 620 }}>
        Creators make the work. Reviewers approve it. Admins do both and can change roles.
      </p>

      <div style={{ marginTop: 24 }}>
        <TeamTable
          people={(people ?? []) as any}
          spend={Object.fromEntries(byPerson)}
          isAdmin={me?.role === "admin"}
          meId={user?.id ?? ""}
        />
      </div>
    </main>
  );
}
