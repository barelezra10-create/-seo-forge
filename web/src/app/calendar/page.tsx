import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listUpcomingPlans } from "@/lib/queries/plans";
import { getAllSites } from "@/lib/queries/sites";

const STATUS_BADGES: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
  skipped: "bg-zinc-100 text-zinc-500",
  failed: "bg-red-100 text-red-700",
};

function groupByDate(plans: Awaited<ReturnType<typeof listUpcomingPlans>>) {
  const map = new Map<string, typeof plans>();
  for (const p of plans) {
    const arr = map.get(p.plannedDate) ?? [];
    arr.push(p);
    map.set(p.plannedDate, arr);
  }
  return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
}

export default async function CalendarPage() {
  const [plans, sites] = await Promise.all([listUpcomingPlans(14), getAllSites()]);
  const sitesById = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const grouped = groupByDate(plans);

  return (
    <>
      <TopBar
        title="Calendar"
        actions={
          <form action="/api/plans/regenerate" method="POST">
            <Button type="submit" variant="outline" size="sm">
              Regenerate
            </Button>
          </form>
        }
      />
      <main className="p-6 space-y-6 max-w-5xl">
        {grouped.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center text-zinc-500">
              <p className="font-medium mb-1">No plans yet.</p>
              <p className="text-sm">
                Click &quot;Regenerate&quot; to plan the next 7 days, or wait for the 5am cron.
              </p>
            </CardContent>
          </Card>
        ) : (
          grouped.map(([date, plansForDate]) => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              <div className="space-y-3">
                {plansForDate.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="pt-5 pb-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGES[p.status]}`}
                            >
                              {p.status}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {sitesById[p.siteId] ?? p.siteId}
                            </span>
                            <span className="text-xs text-zinc-400">·</span>
                            <span className="text-xs text-zinc-500">
                              {p.research.source} · vol {p.research.volume ?? 0} · KD{" "}
                              {p.research.kd ?? "?"}
                            </span>
                          </div>
                          <h3 className="font-semibold mb-1">{p.targetKeyword}</h3>
                          {p.research.outline && p.research.outline.length > 0 && (
                            <p className="text-sm text-zinc-600 mb-2 line-clamp-1">
                              {p.research.outline[0]}
                            </p>
                          )}
                          {p.sisterLinks.length > 0 && (
                            <div className="text-xs text-zinc-500 mt-2">
                              <span className="font-medium">Will mention: </span>
                              {p.sisterLinks.map((l, i) => (
                                <span key={l.url}>
                                  {i > 0 && ", "}
                                  <a
                                    href={l.url}
                                    target="_blank"
                                    className="text-blue-600 hover:underline"
                                  >
                                    {l.title}
                                  </a>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {p.status === "planned" && (
                          <div className="flex gap-2 shrink-0">
                            <form action={`/api/plans/${p.id}/skip`} method="POST">
                              <Button type="submit" variant="outline" size="sm">
                                Skip
                              </Button>
                            </form>
                            <form action={`/api/plans/${p.id}/publish-now`} method="POST">
                              <Button type="submit" size="sm">
                                Publish now
                              </Button>
                            </form>
                          </div>
                        )}
                        {p.status === "published" && p.publishedJobId && (
                          <a
                            href={`/jobs/${p.publishedJobId}`}
                            className="text-xs text-blue-600 hover:underline shrink-0"
                          >
                            view job →
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </>
  );
}
