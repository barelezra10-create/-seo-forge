import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { and, desc, eq, sql } from "drizzle-orm";

export type ArticleRow = {
  id: number;
  siteId: string;
  url: string;
  slug: string;
  title: string;
  publishedAt: Date | null;
};

export async function getRecentArticles(siteId: string, limit = 20): Promise<ArticleRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: tables.contentIndex.id,
      siteId: tables.contentIndex.siteId,
      url: tables.contentIndex.url,
      slug: tables.contentIndex.slug,
      title: tables.contentIndex.title,
      publishedAt: tables.contentIndex.publishedAt,
    })
    .from(tables.contentIndex)
    .where(eq(tables.contentIndex.siteId, siteId))
    .orderBy(desc(tables.contentIndex.lastIndexed))
    .limit(limit);
  return rows;
}

export async function getArticleCountThisMonth(siteId: string): Promise<number> {
  const db = getDb();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const result = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int as count
    FROM content_index
    WHERE site_id = ${siteId} AND last_indexed >= ${start.toISOString()}
  `);
  // postgres-js returns rows as an array-like; access via [0]
  const row = (result as unknown as Array<{ count: number }>)[0];
  return row?.count ?? 0;
}

export type ArticleSearchOpts = {
  siteId?: string;
  query?: string;
  limit?: number;
  offset?: number;
};

export async function searchArticles(opts: ArticleSearchOpts = {}): Promise<ArticleRow[]> {
  const db = getDb();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const conds = [];
  if (opts.siteId) conds.push(eq(tables.contentIndex.siteId, opts.siteId));
  if (opts.query) conds.push(sql`title ILIKE ${`%${opts.query}%`}`);
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);

  if (where) {
    return await db
      .select({
        id: tables.contentIndex.id,
        siteId: tables.contentIndex.siteId,
        url: tables.contentIndex.url,
        slug: tables.contentIndex.slug,
        title: tables.contentIndex.title,
        publishedAt: tables.contentIndex.publishedAt,
      })
      .from(tables.contentIndex)
      .where(where)
      .orderBy(desc(tables.contentIndex.lastIndexed))
      .limit(limit)
      .offset(offset);
  }
  return await db
    .select({
      id: tables.contentIndex.id,
      siteId: tables.contentIndex.siteId,
      url: tables.contentIndex.url,
      slug: tables.contentIndex.slug,
      title: tables.contentIndex.title,
      publishedAt: tables.contentIndex.publishedAt,
    })
    .from(tables.contentIndex)
    .orderBy(desc(tables.contentIndex.lastIndexed))
    .limit(limit)
    .offset(offset);
}

export type ArticleDetail = ArticleRow & {
  firstParagraph: string | null;
  claudeTranscript: {
    prompt?: string;
    rawResponse?: string;
    durationMs?: number;
    keyword?: string;
    sisterLinks?: string[];
  } | null;
};

export async function getArticleBySlug(siteId: string, slug: string): Promise<ArticleDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: tables.contentIndex.id,
      siteId: tables.contentIndex.siteId,
      url: tables.contentIndex.url,
      slug: tables.contentIndex.slug,
      title: tables.contentIndex.title,
      publishedAt: tables.contentIndex.publishedAt,
      firstParagraph: tables.contentIndex.firstParagraph,
      claudeTranscript: tables.contentIndex.claudeTranscript,
    })
    .from(tables.contentIndex)
    .where(and(eq(tables.contentIndex.siteId, siteId), eq(tables.contentIndex.slug, slug)));
  return (row as ArticleDetail) ?? null;
}
