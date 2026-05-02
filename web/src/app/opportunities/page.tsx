import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listOpenOpportunities } from "@/lib/queries/opportunities";
import { getAllSites } from "@/lib/queries/sites";

const TYPE_BADGES: Record<string, string> = {
  striking_distance: "bg-blue-100 text-blue-700",
  traffic_decline: "bg-orange-100 text-orange-700",
  content_gap: "bg-purple-100 text-purple-700",
  broken_link: "bg-red-100 text-red-700",
};

const TYPE_LABELS: Record<string, string> = {
  striking_distance: "Striking distance",
  traffic_decline: "Traffic decline",
  content_gap: "Content gap",
  broken_link: "Broken link",
};

type SearchParams = Promise<{ site?: string }>;

export default async function OpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [opps, sites] = await Promise.all([
    listOpenOpportunities(sp.site),
    getAllSites(),
  ]);
  const sitesById = Object.fromEntries(sites.map((s) => [s.id, s.name]));

  return (
    <>
      <TopBar title="Opportunities" />
      <main className="p-6 space-y-4">
        <form className="flex gap-2">
          <select
            name="site"
            defaultValue={sp.site ?? ""}
            className="border border-zinc-200 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            type="submit"
            className="border border-zinc-200 rounded-md px-4 py-2 text-sm bg-white hover:bg-zinc-50"
          >
            Filter
          </button>
        </form>

        {opps.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center text-zinc-500">
              <p className="font-medium mb-1">No open opportunities yet.</p>
              <p className="text-sm">
                Opportunities surface after the next snapshot run + opportunities pass.
                Click &quot;Refresh now&quot; on the overview to enqueue snapshots, or run
                <code className="text-xs bg-zinc-100 px-1.5 py-0.5 rounded ml-1">pnpm exec tsx scripts/run-opportunities.ts</code>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {opps.map((o) => {
              const keyword = (o.payload.keyword as string | undefined) ?? "";
              const targetUrl = (o.payload.targetUrl as string | undefined) ?? "";
              return (
                <Card key={o.id}>
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${TYPE_BADGES[o.type] ?? "bg-zinc-100"}`}>
                            {TYPE_LABELS[o.type] ?? o.type}
                          </span>
                          <span className="text-xs text-zinc-500">{sitesById[o.siteId] ?? o.siteId}</span>
                        </div>
                        <h3 className="font-semibold truncate">{o.title}</h3>
                        <p className="text-sm text-zinc-600 mt-1">{o.description}</p>
                        {targetUrl && (
                          <a href={targetUrl} target="_blank" className="text-xs text-blue-600 hover:underline mt-1 block truncate">
                            {"→ "}{targetUrl}
                          </a>
                        )}
                      </div>
                      {(o.type === "striking_distance" || o.type === "content_gap") && keyword && (
                        <form action={`/api/opportunities/${o.id}/act`} method="POST" className="shrink-0">
                          <Button type="submit" size="sm">
                            {o.type === "striking_distance" ? "Write article" : "Add link"}
                          </Button>
                        </form>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
