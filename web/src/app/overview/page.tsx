import { TopBar } from "@/components/layout/TopBar";
import { getAllSites } from "@/lib/queries/sites";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

export default async function OverviewPage() {
  const sites = await getAllSites();
  const totalArticles = sites.reduce((sum, s) => sum + s.articleCount, 0);
  return (
    <>
      <TopBar title="Overview" />
      <main className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
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
              <p className="text-sm text-zinc-500 mb-1">Articles this month</p>
              <p className="text-3xl font-bold">-</p>
              <p className="text-xs text-zinc-400 mt-1">populated in Task 14 (analytics)</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
