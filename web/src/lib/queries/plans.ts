import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";

export type PlanRow = {
  id: number;
  siteId: string;
  plannedDate: string;
  targetKeyword: string;
  intent: string;
  research: {
    source?: string;
    volume?: number;
    kd?: number;
    position?: number | null;
    audience?: string;
    outline?: string[];
  };
  sisterLinks: Array<{ siteId: string; url: string; title: string; distance: number }>;
  status: "planned" | "published" | "skipped" | "failed";
  publishedJobId: number | null;
  draft: {
    ledeAnswer: string;
    quickFacts: string[];
    body: string;
    prompt?: string;
    rawResponse?: string;
    durationMs?: number;
  } | null;
  draftGeneratedAt: Date | string | null;
};

export async function listUpcomingPlans(daysAhead = 45): Promise<PlanRow[]> {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 1); // include yesterday's "did we publish?"
  const rows = await db
    .select()
    .from(tables.articlePlans)
    .where(sql`planned_date >= ${cutoff.toISOString().slice(0, 10)}`)
    .orderBy(tables.articlePlans.plannedDate, tables.articlePlans.siteId);
  // daysAhead reserved for future filtering; keep parameter for callers.
  void daysAhead;
  return rows as unknown as PlanRow[];
}

export async function getPlansForMonthAndSite(
  siteId: string,
  year: number,
  month: number /* 1-12 */,
): Promise<PlanRow[]> {
  const db = getDb();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(tables.articlePlans)
    .where(sql`site_id = ${siteId} AND planned_date >= ${startStr} AND planned_date < ${endStr}`)
    .orderBy(tables.articlePlans.plannedDate);
  return rows as unknown as PlanRow[];
}

export type PublishedArticle = {
  id: number;
  siteId: string;
  url: string;
  slug: string;
  title: string;
  publishedDate: string; // YYYY-MM-DD, derived from published_at or last_indexed
  hasTranscript: boolean; // true if SEO Forge wrote it (vs pre-existing backfilled article)
};

/**
 * Articles that landed on this site during the given month. Pulled from
 * content_index — both SEO-Forge-published (claude_transcript NOT NULL) and
 * pre-existing backfilled articles count, but the calendar UI distinguishes
 * by hasTranscript.
 */
export async function getPublishedArticlesForMonthAndSite(
  siteId: string,
  year: number,
  month: number /* 1-12 */,
): Promise<PublishedArticle[]> {
  const db = getDb();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const rows = await db.execute<{
    id: number;
    site_id: string;
    url: string;
    slug: string;
    title: string;
    published_date: string;
    has_transcript: boolean;
  }>(sql`
    SELECT
      id,
      site_id,
      url,
      slug,
      title,
      to_char(COALESCE(published_at, last_indexed), 'YYYY-MM-DD') AS published_date,
      (claude_transcript IS NOT NULL) AS has_transcript
    FROM content_index
    WHERE site_id = ${siteId}
      AND COALESCE(published_at, last_indexed) >= ${startStr}
      AND COALESCE(published_at, last_indexed) < ${endStr}
    ORDER BY COALESCE(published_at, last_indexed) DESC
  `);
  return (rows as unknown as Array<{
    id: number;
    site_id: string;
    url: string;
    slug: string;
    title: string;
    published_date: string;
    has_transcript: boolean;
  }>).map((r) => ({
    id: r.id,
    siteId: r.site_id,
    url: r.url,
    slug: r.slug,
    title: r.title,
    publishedDate: String(r.published_date),
    hasTranscript: r.has_transcript,
  }));
}

export async function getPlan(id: number): Promise<PlanRow | null> {
  const db = getDb();
  const [row] = await db.select().from(tables.articlePlans).where(eq(tables.articlePlans.id, id));
  return (row as unknown as PlanRow | undefined) ?? null;
}
