import { createClient } from "@/lib/supabase/server";
import { StatusRail } from "@/components/StatusRail";
import { ReviewPanel } from "@/components/ReviewPanel";
import { VersionList } from "@/components/VersionList";

export const dynamic = "force-dynamic";

export default async function AssetPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: asset }, { data: versions }, { data: profile }] = await Promise.all([
    supabase.from("assets").select("*, projects(id, name)").eq("id", params.id).single(),
    supabase
      .from("asset_versions")
      .select("*, approvals(*), comments(*)")
      .eq("asset_id", params.id)
      .order("n", { ascending: false }),
    supabase.from("profiles").select("role").eq("id", user?.id ?? "").single(),
  ]);

  if (!asset) return <main><div className="empty">That asset does not exist.</div></main>;

  const { data: jobs } = await supabase
    .from("generation_jobs")
    .select("id, state, error, model, created_at")
    .eq("asset_id", params.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const pending = (jobs ?? []).find((j) => j.state === "queued" || j.state === "running");
  const failed = (jobs ?? []).find((j) => j.state === "failed");
  const totalCost = (versions ?? []).reduce((s, v: any) => s + Number(v.cost_usd), 0);

  return (
    <main>
      <div className="eyebrow">{(asset.projects as any)?.name} · {asset.kind}</div>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <h1>{asset.title}</h1>
        <div style={{ width: 180 }}><StatusRail status={asset.status} /></div>
      </div>
      <div className="cost note" style={{ marginTop: 6 }}>
        {(versions ?? []).length} versions · ${totalCost.toFixed(4)} spent
      </div>

      {pending && (
        <div className="card" style={{ marginTop: 20, borderColor: "var(--amber)" }}>
          Render in progress on <span className="mono">{pending.model}</span>. This page updates when it lands —
          refresh in a minute.
        </div>
      )}
      {failed && !pending && (
        <div className="card" style={{ marginTop: 20, borderColor: "var(--rust)" }}>
          <strong>Last render failed.</strong>
          <div className="err" style={{ marginTop: 4 }}>{failed.error}</div>
        </div>
      )}

      <ReviewPanel
        assetId={asset.id}
        status={asset.status}
        versionId={asset.current_version_id}
        role={profile?.role ?? "creator"}
      />

      <h2 style={{ marginTop: 36, marginBottom: 12 }}>Version history</h2>
      <VersionList versions={(versions ?? []) as any} currentId={asset.current_version_id} />
    </main>
  );
}
