import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { getAllSites } from "@/lib/queries/sites";
import { formatNumber } from "@/lib/utils";

export default async function SitesPage() {
  const sites = await getAllSites();
  return (
    <>
      <TopBar title="Sites" />
      <main className="p-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sites.map((site) => (
          <Link key={site.id} href={`/sites/${site.id}`}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{site.name}</h3>
                  {site.killSwitch && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">paused</span>
                  )}
                </div>
                <p className="text-sm text-zinc-500 mb-4">{site.domain}</p>
                <div className="text-sm">
                  <span className="font-medium">{formatNumber(site.articleCount)}</span>{" "}
                  <span className="text-zinc-500">articles indexed</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </main>
    </>
  );
}
