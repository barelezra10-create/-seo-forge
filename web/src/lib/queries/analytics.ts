import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { desc, eq, sql } from "drizzle-orm";

export type GscQuery = { query: string; clicks: number; impressions: number; ctr: number; position: number };
export type StrikingDistanceQuery = GscQuery;

export type GscSnapshot = {
  siteId: string;
  snapshotDate: string;
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  topQueries: GscQuery[];
  strikingDistance: StrikingDistanceQuery[];
};

export async function getLatestGscSnapshot(siteId: string): Promise<GscSnapshot | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(tables.gscSnapshot)
    .where(eq(tables.gscSnapshot.siteId, siteId))
    .orderBy(desc(tables.gscSnapshot.snapshotDate))
    .limit(1);
  if (!row) return null;
  const payload = row.payload as { topQueries?: GscQuery[]; strikingDistance?: StrikingDistanceQuery[] };
  return {
    siteId: row.siteId,
    snapshotDate: String(row.snapshotDate),
    totalClicks: row.totalClicks,
    totalImpressions: row.totalImpressions,
    avgCtr: row.avgCtr,
    avgPosition: row.avgPosition,
    topQueries: payload.topQueries ?? [],
    strikingDistance: payload.strikingDistance ?? [],
  };
}

export type GscTrendPoint = { date: string; clicks: number; impressions: number };

export async function getGscTrend(siteId: string, days = 30): Promise<GscTrendPoint[]> {
  const db = getDb();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().slice(0, 10);
  const rows = await db.execute<{ snapshot_date: string; total_clicks: number; total_impressions: number }>(sql`
    SELECT snapshot_date, total_clicks, total_impressions
    FROM gsc_snapshot
    WHERE site_id = ${siteId} AND snapshot_date >= ${startStr}
    ORDER BY snapshot_date ASC
  `);
  return (rows as unknown as Array<{ snapshot_date: string; total_clicks: number; total_impressions: number }>).map((r) => ({
    date: String(r.snapshot_date),
    clicks: r.total_clicks,
    impressions: r.total_impressions,
  }));
}

export type AhrefsKeyword = { keyword: string; volume: number; difficulty: number | null; position: number; traffic: number };
export type AhrefsPage = { url: string; traffic: number; keywords: number };
export type AhrefsBacklink = { urlFrom: string; domainRatingSource: number; firstSeen: string | null; anchor: string };

export type AhrefsSnapshot = {
  siteId: string;
  snapshotDate: string;
  domainRating: number;
  refDomains: number;
  backlinks: number;
  organicKeywords: number;
  organicTraffic: number;
  topKeywords: AhrefsKeyword[];
  topPages: AhrefsPage[];
  recentBacklinks: AhrefsBacklink[];
};

export async function getLatestAhrefsSnapshot(siteId: string): Promise<AhrefsSnapshot | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(tables.ahrefsSnapshot)
    .where(eq(tables.ahrefsSnapshot.siteId, siteId))
    .orderBy(desc(tables.ahrefsSnapshot.snapshotDate))
    .limit(1);
  if (!row) return null;
  const payload = row.payload as { topKeywords?: AhrefsKeyword[]; topPages?: AhrefsPage[]; recentBacklinks?: AhrefsBacklink[] };
  return {
    siteId: row.siteId,
    snapshotDate: String(row.snapshotDate),
    domainRating: row.domainRating,
    refDomains: row.refDomains,
    backlinks: row.backlinks,
    organicKeywords: row.organicKeywords,
    organicTraffic: row.organicTraffic,
    topKeywords: payload.topKeywords ?? [],
    topPages: payload.topPages ?? [],
    recentBacklinks: payload.recentBacklinks ?? [],
  };
}
