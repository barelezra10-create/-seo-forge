import { type Db, tables } from "@seo-forge/shared";
import { sql } from "drizzle-orm";
import { fetchStrikingDistanceQueries } from "../data/gsc.js";
import { getDb } from "./_db-singleton.js";

export type GscSnapshotInput = {
  siteId: string;
  siteUrl: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  days?: number;
};

export async function snapshotSiteGsc(i: GscSnapshotInput, db?: Db): Promise<void> {
  // Fetch ALL queries (no position filter) to compute aggregates
  const allQueries = await fetchStrikingDistanceQueries({
    siteUrl: i.siteUrl,
    refreshToken: i.refreshToken,
    clientId: i.clientId,
    clientSecret: i.clientSecret,
    days: i.days ?? 28,
    minPosition: 1,
    maxPosition: 100,
    minImpressions: 0,
  });
  const totalClicks = allQueries.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = allQueries.reduce((s, r) => s + r.impressions, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition =
    allQueries.length > 0
      ? allQueries.reduce((s, r) => s + r.position, 0) / allQueries.length
      : 0;
  const topQueries = [...allQueries].sort((a, b) => b.clicks - a.clicks).slice(0, 50);
  const strikingDistance = allQueries.filter(
    (q) => q.position >= 8 && q.position <= 25 && q.impressions >= 50,
  );

  const today = new Date().toISOString().slice(0, 10);
  const conn = db ?? getDb();
  await conn.execute(sql`
    INSERT INTO gsc_snapshot
      (site_id, snapshot_date, total_clicks, total_impressions, avg_ctr, avg_position, payload)
    VALUES
      (${i.siteId}, ${today}, ${totalClicks}, ${totalImpressions}, ${avgCtr}, ${avgPosition},
       ${JSON.stringify({ topQueries, strikingDistance })}::jsonb)
    ON CONFLICT (site_id, snapshot_date) DO UPDATE SET
      total_clicks = EXCLUDED.total_clicks,
      total_impressions = EXCLUDED.total_impressions,
      avg_ctr = EXCLUDED.avg_ctr,
      avg_position = EXCLUDED.avg_position,
      payload = EXCLUDED.payload
  `);
}

export async function snapshotAllSitesGsc(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ ok: number; failed: number }> {
  const conn = getDb();
  const sites = await conn.select().from(tables.sites);
  let ok = 0,
    failed = 0;
  for (const site of sites) {
    try {
      await snapshotSiteGsc(
        {
          siteId: site.id,
          siteUrl: `https://${site.domain}/`,
          refreshToken: opts.refreshToken,
          clientId: opts.clientId,
          clientSecret: opts.clientSecret,
        },
        conn,
      );
      ok++;
    } catch (e) {
      console.error(`[gsc-snapshot] ${site.id} failed:`, (e as Error).message);
      failed++;
    }
  }
  return { ok, failed };
}
