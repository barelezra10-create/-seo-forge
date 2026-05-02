import { notFound } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSite } from "@/lib/queries/sites";
import { getRecentArticles, getArticleCountThisMonth } from "@/lib/queries/articles";

export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!site) notFound();

  const [articles, monthlyCount] = await Promise.all([
    getRecentArticles(siteId, 20),
    getArticleCountThisMonth(siteId),
  ]);

  return (
    <>
      <TopBar
        title={site.name}
        actions={
          <>
            <form action="/api/publish" method="POST">
              <input type="hidden" name="siteId" value={siteId} />
              <Button type="submit" disabled={site.killSwitch}>
                Publish now
              </Button>
            </form>
            <form action={`/api/sites/${siteId}`} method="POST">
              <input type="hidden" name="_method" value="PATCH" />
              <input type="hidden" name="killSwitch" value={String(!site.killSwitch)} />
              <Button type="submit" variant={site.killSwitch ? "default" : "destructive"} size="sm">
                {site.killSwitch ? "Unpause" : "Pause"}
              </Button>
            </form>
          </>
        }
      />
      <main className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-zinc-500 mb-1">Domain</p>
              <a
                href={`https://${site.domain}`}
                target="_blank"
                className="font-medium text-blue-600 hover:underline"
              >
                {site.domain}
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-zinc-500 mb-1">Articles this month</p>
              <p className="text-3xl font-bold">{monthlyCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-zinc-500 mb-1">Auto-publish</p>
              <p className="font-medium">{site.autoPublish ? "On" : "Off"}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent articles</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-zinc-200">
              {articles.map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/articles/${siteId}/${a.slug}`}
                      className="font-medium hover:underline block truncate"
                    >
                      {a.title}
                    </Link>
                    <p className="text-xs text-zinc-400 truncate">{a.url}</p>
                  </div>
                  <a
                    href={a.url}
                    target="_blank"
                    className="text-xs text-blue-600 hover:underline ml-3 shrink-0"
                  >
                    open ↗
                  </a>
                </li>
              ))}
              {articles.length === 0 && (
                <li className="py-4 text-center text-zinc-500 text-sm">No articles yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
