import { type Db, tables } from "@seo-forge/shared";
import { sql } from "drizzle-orm";
import {
  fetchDomainRating,
  fetchOrganicKeywords,
  fetchTopPages,
  fetchRecentBacklinks,
} from "../data/ahrefs-extras.js";
import { getDb } from "./_db-singleton.js";

export type AhrefsSnapshotInput = {
  siteId: string;
  domain: string;
  apiKey: string;
};

export async function snapshotSiteAhrefs(i: AhrefsSnapshotInput, db?: Db): Promise<void> {
  const [drRes, keywords, pages, backlinks] = await Promise.all([
    fetchDomainRating({ domain: i.domain, apiKey: i.apiKey }),
    fetchOrganicKeywords({ domain: i.domain, apiKey: i.apiKey, limit: 50 }),
    fetchTopPages({ domain: i.domain, apiKey: i.apiKey, limit: 30 }),
    fetchRecentBacklinks({ domain: i.domain, apiKey: i.apiKey, limit: 30 }),
  ]);

  const organicKeywords = keywords.length;
  const organicTraffic = keywords.reduce((s, k) => s + k.traffic, 0);
  const totalBacklinks = backlinks.length;

  const today = new Date().toISOString().slice(0, 10);
  const conn = db ?? getDb();
  await conn.execute(sql`
    INSERT INTO ahrefs_snapshot
      (site_id, snapshot_date, domain_rating, ref_domains, backlinks, organic_keywords, organic_traffic, payload)
    VALUES
      (${i.siteId}, ${today}, ${drRes.domainRating}, ${drRes.refDomains}, ${totalBacklinks},
       ${organicKeywords}, ${organicTraffic},
       ${JSON.stringify({ topKeywords: keywords, topPages: pages, recentBacklinks: backlinks })}::jsonb)
    ON CONFLICT (site_id, snapshot_date) DO UPDATE SET
      domain_rating = EXCLUDED.domain_rating,
      ref_domains = EXCLUDED.ref_domains,
      backlinks = EXCLUDED.backlinks,
      organic_keywords = EXCLUDED.organic_keywords,
      organic_traffic = EXCLUDED.organic_traffic,
      payload = EXCLUDED.payload
  `);
}

export async function snapshotAllSitesAhrefs(opts: {
  apiKey: string;
}): Promise<{ ok: number; failed: number }> {
  const conn = getDb();
  const sites = await conn.select().from(tables.sites);
  let ok = 0,
    failed = 0;
  for (const site of sites) {
    try {
      await snapshotSiteAhrefs(
        { siteId: site.id, domain: site.domain, apiKey: opts.apiKey },
        conn,
      );
      ok++;
    } catch (e) {
      console.error(`[ahrefs-snapshot] ${site.id} failed:`, (e as Error).message);
      failed++;
    }
  }
  return { ok, failed };
}
