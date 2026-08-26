import { createClient } from "@/lib/supabase/server";
import { UsageView } from "@/components/UsageView";

export const dynamic = "force-dynamic";

export default async function UsagePage({
  searchParams,
}: {
  searchParams: { provider?: string; days?: string };
}) {
  const supabase = createClient();
  const days = Number(searchParams.days ?? 30);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [{ data: daily }, { data: events }] = await Promise.all([
    supabase.from("usage_daily").select("*").gte("day", since.slice(0, 10)).order("day"),
    supabase
      .from("usage_events")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  return (
    <main>
      <div className="eyebrow">Spend</div>
      <h1>Usage</h1>

      <UsageView
        daily={(daily ?? []) as any}
        events={(events ?? []) as any}
        days={days}
        provider={searchParams.provider ?? null}
      />
    </main>
  );
}
