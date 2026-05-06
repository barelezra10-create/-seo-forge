import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { listRecentBacklinks, getBacklinkStatsBySite } from "@/lib/queries/backlinks";
import { formatNumber } from "@/lib/utils";

function fmtDate(s: string | null): string {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function drBadgeClass(dr: number): string {
  if (dr >= 70) return "bg-emerald-100 text-emerald-700";
  if (dr >= 40) return "bg-blue-100 text-blue-700";
  if (dr >= 20) return "bg-amber-100 text-amber-700";
  return "bg-zinc-100 text-zinc-600";
}

type SearchParams = Promise<{ site?: string }>;

export default async function BacklinksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [allBacklinks, stats] = await Promise.all([
    listRecentBacklinks(500),
    getBacklinkStatsBySite(),
  ]);
  const filtered = sp.site ? allBacklinks.filter((b) => b.siteId === sp.site) : allBacklinks;

  return (
    <>
      <TopBar title="Backlinks" />
      <main className="p-6 space-y-6">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <Card key={s.siteId} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-zinc-500">{s.siteName}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${drBadgeClass(s.domainRating)}`}>
                    DR {s.domainRating.toFixed(0)}
                  </span>
                </div>
                <p className="text-2xl font-bold leading-none">{formatNumber(s.refDomains)}</p>
                <p className="text-xs text-zinc-500 mt-1">ref domains</p>
                <p className="text-xs text-zinc-400 mt-2">{formatNumber(s.backlinks)} total backlinks</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
              Recent backlinks {sp.site ? `(${sp.site})` : "(all sites)"}
            </h2>
            <form className="flex items-center gap-2">
              <select
                name="site"
                defaultValue={sp.site ?? ""}
                className="border border-zinc-200 rounded-md px-3 py-1.5 text-sm bg-white"
              >
                <option value="">All sites</option>
                {stats.map((s) => (
                  <option key={s.siteId} value={s.siteId}>{s.siteName}</option>
                ))}
              </select>
              <button
                type="submit"
                className="border border-zinc-200 rounded-md px-3 py-1.5 text-sm bg-white hover:bg-zinc-50"
              >
                Filter
              </button>
            </form>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="text-left px-4 py-3">First seen</th>
                    <th className="text-left px-4 py-3">Site</th>
                    <th className="text-left px-4 py-3">Source URL</th>
                    <th className="text-left px-4 py-3">Anchor</th>
                    <th className="text-right px-4 py-3">DR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {filtered.map((b, i) => (
                    <tr key={`${b.urlFrom}-${i}`} className="hover:bg-zinc-50">
                      <td className="px-4 py-2 text-zinc-500 text-xs whitespace-nowrap">{fmtDate(b.firstSeen)}</td>
                      <td className="px-4 py-2 text-zinc-500 text-xs whitespace-nowrap">{b.siteName}</td>
                      <td className="px-4 py-2 truncate max-w-md">
                        <a href={b.urlFrom} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                          {b.urlFrom.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80)}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-zinc-600 truncate max-w-xs">
                        {b.anchor ? `"${b.anchor}"` : <span className="text-zinc-400">no anchor</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={`text-xs px-2 py-0.5 rounded ${drBadgeClass(b.domainRatingSource)}`}>
                          {b.domainRatingSource.toFixed(0)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                        No backlinks yet. They appear after the next Ahrefs snapshot.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
