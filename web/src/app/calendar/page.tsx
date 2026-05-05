import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getPlansForMonthAndSite,
  getPublishedArticlesForMonthAndSite,
  type PublishedArticle,
} from "@/lib/queries/plans";
import { getAllSites } from "@/lib/queries/sites";

const INTENT_BADGES: Record<string, string> = {
  informational: "bg-purple-100 text-purple-700",
  commercial: "bg-emerald-100 text-emerald-700",
  transactional: "bg-amber-100 text-amber-700",
  navigational: "bg-sky-100 text-sky-700",
};

const INTENT_LABELS: Record<string, string> = {
  informational: "Guide",
  commercial: "Listicle",
  transactional: "Service",
  navigational: "Brand",
};

const STATUS_DOT: Record<string, string> = {
  planned: "bg-zinc-300",
  published: "bg-green-500",
  skipped: "bg-zinc-200",
  failed: "bg-red-500",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SearchParams = Promise<{ site?: string; year?: string; month?: string }>;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const sites = await getAllSites();
  const siteId =
    sp.site && sites.some((s) => s.id === sp.site) ? sp.site : sites[0]?.id;
  if (!siteId) {
    return (
      <>
        <TopBar title="Calendar" />
        <main className="p-6">
          <Card>
            <CardContent className="pt-12 pb-12 text-center text-zinc-500">
              Add a site first.
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  const today = new Date();
  const year = sp.year ? Number(sp.year) : today.getFullYear();
  const month = sp.month ? Number(sp.month) : today.getMonth() + 1; // 1-12

  const [plans, published] = await Promise.all([
    getPlansForMonthAndSite(siteId, year, month),
    getPublishedArticlesForMonthAndSite(siteId, year, month),
  ]);
  const plansByDate = new Map<string, (typeof plans)[number]>();
  for (const p of plans) plansByDate.set(p.plannedDate, p);
  // Index published articles by date. Multiple articles per day possible
  // (e.g. early backfill + later SEO Forge publish); UI shows the first.
  const publishedByDate = new Map<string, PublishedArticle[]>();
  for (const a of published) {
    const arr = publishedByDate.get(a.publishedDate) ?? [];
    arr.push(a);
    publishedByDate.set(a.publishedDate, arr);
  }

  // Build the visible month grid (always render up to 6 rows x 7 cols; weeks start Sunday)
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(firstOfMonth.getUTCDate() - startWeekday);
  const cells: {
    dateStr: string;
    day: number;
    inMonth: boolean;
    isToday: boolean;
  }[] = [];
  const todayStr = today.toISOString().slice(0, 10);
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    cells.push({
      dateStr,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1,
      isToday: dateStr === todayStr,
    });
  }

  // Trim trailing all-out-of-month rows (max 6 rows shown; remove last row if entirely out of month)
  const lastRow = cells.slice(35);
  const showSixRows = lastRow.some((c) => c.inMonth);
  const visibleCells = showSixRows ? cells : cells.slice(0, 35);

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const prevMonth =
    month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextMonth =
    month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const navLink = (y: number, m: number) =>
    `/calendar?site=${encodeURIComponent(siteId)}&year=${y}&month=${m}`;

  return (
    <>
      <TopBar
        title="Content calendar"
        actions={
          <form action="/api/plans/regenerate" method="POST">
            <Button type="submit" variant="outline" size="sm">
              Regenerate month
            </Button>
          </form>
        }
      />
      <main className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <form className="flex items-center gap-2">
            <label htmlFor="site-select" className="text-sm text-zinc-500">
              Site:
            </label>
            <select
              id="site-select"
              name="site"
              defaultValue={siteId}
              className="border border-zinc-200 rounded-md px-3 py-1.5 text-sm bg-white"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <button
              type="submit"
              className="border border-zinc-200 rounded-md px-3 py-1.5 text-sm bg-white hover:bg-zinc-50"
            >
              Switch
            </button>
          </form>
          <div className="flex items-center gap-2">
            <Link
              href={navLink(prevMonth.y, prevMonth.m)}
              className="border border-zinc-200 rounded-md px-3 py-1.5 text-sm bg-white hover:bg-zinc-50"
              aria-label="Previous month"
            >
              &larr;
            </Link>
            <span className="text-lg font-semibold min-w-[180px] text-center">
              {monthLabel}
            </span>
            <Link
              href={navLink(nextMonth.y, nextMonth.m)}
              className="border border-zinc-200 rounded-md px-3 py-1.5 text-sm bg-white hover:bg-zinc-50"
              aria-label="Next month"
            >
              &rarr;
            </Link>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase text-center"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {visibleCells.map((cell) => {
              const plan = plansByDate.get(cell.dateStr);
              const publishedHere = publishedByDate.get(cell.dateStr) ?? [];
              const seoForgePublished = publishedHere.filter((a) => a.hasTranscript);
              const dotStatus = plan
                ? plan.status
                : seoForgePublished.length > 0
                  ? "published"
                  : null;
              return (
                <div
                  key={cell.dateStr}
                  className={`border-r border-b border-zinc-200 last:border-r-0 min-h-[140px] p-2 flex flex-col gap-1 ${
                    cell.inMonth ? "bg-white" : "bg-zinc-50/50"
                  } ${cell.isToday ? "ring-2 ring-inset ring-blue-300" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-medium ${
                        cell.inMonth ? "text-zinc-900" : "text-zinc-400"
                      }`}
                    >
                      {cell.day}
                    </span>
                    {dotStatus && (
                      <span
                        className={`h-2 w-2 rounded-full ${
                          STATUS_DOT[dotStatus] ?? "bg-zinc-200"
                        }`}
                        title={dotStatus}
                      />
                    )}
                  </div>

                  {plan ? (
                    <div className="flex-1 flex flex-col gap-1">
                      <span
                        className={`inline-block self-start text-[10px] px-1.5 py-0.5 rounded ${
                          INTENT_BADGES[plan.intent] ??
                          "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {INTENT_LABELS[plan.intent] ?? plan.intent}
                      </span>
                      <p className="text-xs font-medium text-zinc-800 leading-tight line-clamp-3">
                        {plan.targetKeyword}
                      </p>
                      {plan.sisterLinks.length > 0 && (
                        <p className="text-[10px] text-zinc-400">
                          &uarr; {plan.sisterLinks.length} link
                          {plan.sisterLinks.length === 1 ? "" : "s"}
                        </p>
                      )}
                      {plan.status === "planned" && cell.inMonth && (
                        <div className="mt-auto flex gap-1">
                          <form
                            action={`/api/plans/${plan.id}/publish-now`}
                            method="POST"
                            className="flex-1"
                          >
                            <button
                              type="submit"
                              className="w-full text-[10px] bg-blue-600 hover:bg-blue-700 text-white rounded px-1.5 py-1 font-medium"
                            >
                              Publish
                            </button>
                          </form>
                          <form
                            action={`/api/plans/${plan.id}/skip`}
                            method="POST"
                          >
                            <button
                              type="submit"
                              className="text-[10px] border border-zinc-200 hover:bg-zinc-100 rounded px-1.5 py-1 text-zinc-600"
                              title="Skip this day"
                            >
                              &times;
                            </button>
                          </form>
                        </div>
                      )}
                      {plan.status === "published" && plan.publishedJobId && (
                        <Link
                          href={`/jobs/${plan.publishedJobId}`}
                          className="text-[10px] text-blue-600 hover:underline mt-auto"
                        >
                          view job &rarr;
                        </Link>
                      )}
                    </div>
                  ) : seoForgePublished.length > 0 ? (
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="inline-block self-start text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                        Published
                      </span>
                      {seoForgePublished.slice(0, 2).map((a) => (
                        <Link
                          key={a.id}
                          href={`/articles/${a.siteId}/${a.slug}`}
                          className="text-xs font-medium text-zinc-800 leading-tight line-clamp-2 hover:underline"
                        >
                          {a.title}
                        </Link>
                      ))}
                      {seoForgePublished.length > 2 && (
                        <p className="text-[10px] text-zinc-400">
                          +{seoForgePublished.length - 2} more
                        </p>
                      )}
                      <a
                        href={seoForgePublished[0]!.url}
                        target="_blank"
                        rel="noopener"
                        className="text-[10px] text-blue-600 hover:underline mt-auto"
                      >
                        view live &rarr;
                      </a>
                    </div>
                  ) : publishedHere.length > 0 ? (
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="inline-block self-start text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
                        Pre-existing
                      </span>
                      <p className="text-xs text-zinc-500 leading-tight line-clamp-2">
                        {publishedHere.length} article
                        {publishedHere.length === 1 ? "" : "s"} indexed
                      </p>
                    </div>
                  ) : cell.inMonth ? (
                    <form
                      action="/api/plans/plan-day"
                      method="POST"
                      className="flex-1 flex"
                    >
                      <input type="hidden" name="date" value={cell.dateStr} />
                      <input type="hidden" name="siteId" value={siteId} />
                      <button
                        type="submit"
                        className="flex-1 text-[11px] text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 rounded p-1 text-left"
                      >
                        Generate keyword
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      </main>
    </>
  );
}
