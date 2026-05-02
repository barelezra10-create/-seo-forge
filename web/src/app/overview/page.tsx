import { TopBar } from "@/components/layout/TopBar";
import { SiteCard, type SiteCardData } from "@/components/overview/SiteCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAllSites } from "@/lib/queries/sites";
import { getLatestGscSnapshot, getGscTrend, getLatestAhrefsSnapshot } from "@/lib/queries/analytics";
import { formatNumber } from "@/lib/utils";

export default async function OverviewPage() {
  const sites = await getAllSites();

  const enriched: SiteCardData[] = await Promise.all(
    sites.map(async (s) => {
      const [gsc, ahrefs, trend] = await Promise.all([
        getLatestGscSnapshot(s.id),
        getLatestAhrefsSnapshot(s.id),
        getGscTrend(s.id, 30),
      ]);
      return {
        id: s.id,
        name: s.name,
        domain: s.domain,
        killSwitch: s.killSwitch,
        articleCount: s.articleCount,
        gscClicks28d: gsc?.totalClicks ?? 0,
        gscImpressions28d: gsc?.totalImpressions ?? 0,
        domainRating: ahrefs?.domainRating ?? 0,
        trend: trend.map((t) => ({ date: t.date, value: t.clicks })),
      };
    }),
  );

  const totalArticles = sites.reduce((sum, s) => sum + s.articleCount, 0);
  const totalClicks = enriched.reduce((s, x) => s + x.gscClicks28d, 0);
  const totalImpressions = enriched.reduce((s, x) => s + x.gscImpressions28d, 0);

  return (
    <>
      <TopBar
        title="Overview"
        actions={
          <form action="/api/refresh-analytics" method="POST">
            <Button type="submit" variant="outline" size="sm">Refresh now</Button>
          </form>
        }
      />
      <main className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-zinc-500 mb-1">Sites</p>
              <p className="text-3xl font-bold">{sites.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-zinc-500 mb-1">Articles indexed</p>
              <p className="text-3xl font-bold">{formatNumber(totalArticles)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-zinc-500 mb-1">GSC clicks 28d</p>
              <p className="text-3xl font-bold">{formatNumber(totalClicks)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-zinc-500 mb-1">GSC impressions 28d</p>
              <p className="text-3xl font-bold">{formatNumber(totalImpressions)}</p>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Sites</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {enriched.map((s) => (
              <SiteCard key={s.id} data={s} />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
