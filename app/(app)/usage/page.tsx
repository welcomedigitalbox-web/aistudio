import { createClient } from "@/lib/supabase/server";
import { UsageView } from "@/components/UsageView";

export const dynamic = "force-dynamic";

export default async function UsagePage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const days = Number(searchParams.days ?? 30);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [{ data: me }, { data: daily }, { data: events }, { data: people }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user?.id ?? "").single(),
    supabase.from("usage_daily").select("*").gte("day", since.slice(0, 10)).order("day"),
    supabase
      .from("usage_events")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("profiles").select("id, email, full_name, role").order("email"),
  ]);

  return (
    <main>
      <div className="eyebrow">Spend</div>
      <h1>Usage</h1>

      <UsageView
        daily={(daily ?? []) as any}
        events={(events ?? []) as any}
        people={(people ?? []) as any}
        days={days}
        isAdmin={me?.role === "admin"}
      />
    </main>
  );
}
