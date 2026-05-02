import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { searchArticles } from "@/lib/queries/articles";
import { getAllSites } from "@/lib/queries/sites";

type SearchParams = Promise<{ site?: string; q?: string }>;

export default async function ArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [articles, sites] = await Promise.all([
    searchArticles({ siteId: sp.site, query: sp.q, limit: 100 }),
    getAllSites(),
  ]);
  const sitesById = Object.fromEntries(sites.map((s) => [s.id, s.name]));

  return (
    <>
      <TopBar title="Articles" />
      <main className="p-6 space-y-4">
        <form className="flex gap-2 flex-wrap">
          <select
            name="site"
            defaultValue={sp.site ?? ""}
            className="border border-zinc-200 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            name="q"
            placeholder="Search by title..."
            defaultValue={sp.q ?? ""}
            className="border border-zinc-200 rounded-md px-3 py-2 text-sm flex-1 max-w-sm bg-white"
          />
          <button
            type="submit"
            className="border border-zinc-200 rounded-md px-4 py-2 text-sm bg-white hover:bg-zinc-50"
          >
            Filter
          </button>
        </form>

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Site</th>
                  <th className="text-left px-4 py-3">Path</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {articles.map((a) => (
                  <tr key={a.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2">
                      <Link
                        href={`/articles/${a.siteId}/${a.slug}`}
                        className="font-medium hover:underline"
                      >
                        {a.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-zinc-500">
                      {sitesById[a.siteId] ?? a.siteId}
                    </td>
                    <td className="px-4 py-2">
                      <a
                        href={a.url}
                        target="_blank"
                        className="text-blue-600 hover:underline truncate inline-block max-w-md"
                      >
                        {(() => {
                          try {
                            return new URL(a.url).pathname;
                          } catch {
                            return a.url;
                          }
                        })()}
                      </a>
                    </td>
                  </tr>
                ))}
                {articles.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                      No articles match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
