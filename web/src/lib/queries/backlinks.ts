import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { desc, sql } from "drizzle-orm";

export type BacklinkRow = {
  siteId: string;
  siteName: string;
  urlFrom: string;
  domainRatingSource: number;
  firstSeen: string | null;
  anchor: string;
};

/**
 * Recent backlinks across all sites, pulled from the latest ahrefs_snapshot
 * payload per site. Each site's recentBacklinks list is flattened and tagged
 * with siteId/siteName for display.
 */
export async function listRecentBacklinks(limit = 200): Promise<BacklinkRow[]> {
  const db = getDb();
  const rows = await db.execute<{
    site_id: string;
    site_name: string;
    payload: { recentBacklinks?: Array<{ urlFrom: string; domainRatingSource: number; firstSeen: string | null; anchor: string }> };
  }>(sql`
    SELECT DISTINCT ON (a.site_id) a.site_id, s.name AS site_name, a.payload
    FROM ahrefs_snapshot a
    JOIN sites s ON s.id = a.site_id
    ORDER BY a.site_id, a.snapshot_date DESC
  `);

  const flat: BacklinkRow[] = [];
  for (const r of rows as unknown as Array<{
    site_id: string;
    site_name: string;
    payload: { recentBacklinks?: Array<{ urlFrom: string; domainRatingSource: number; firstSeen: string | null; anchor: string }> };
  }>) {
    const list = r.payload.recentBacklinks ?? [];
    for (const b of list) {
      flat.push({
        siteId: r.site_id,
        siteName: r.site_name,
        urlFrom: b.urlFrom,
        domainRatingSource: b.domainRatingSource ?? 0,
        firstSeen: b.firstSeen,
        anchor: b.anchor ?? "",
      });
    }
  }
  flat.sort((a, b) => {
    const ta = a.firstSeen ? new Date(a.firstSeen).getTime() : 0;
    const tb = b.firstSeen ? new Date(b.firstSeen).getTime() : 0;
    return tb - ta;
  });
  return flat.slice(0, limit);
}

export type BacklinkStats = {
  siteId: string;
  siteName: string;
  domain: string;
  domainRating: number;
  refDomains: number;
  backlinks: number;
  snapshotDate: string;
};

export async function getBacklinkStatsBySite(): Promise<BacklinkStats[]> {
  const db = getDb();
  const rows = await db.execute<{
    site_id: string;
    site_name: string;
    domain: string;
    domain_rating: number;
    ref_domains: number;
    backlinks: number;
    snapshot_date: string;
  }>(sql`
    SELECT DISTINCT ON (a.site_id)
      a.site_id, s.name AS site_name, s.domain,
      a.domain_rating, a.ref_domains, a.backlinks,
      to_char(a.snapshot_date, 'YYYY-MM-DD') AS snapshot_date
    FROM ahrefs_snapshot a
    JOIN sites s ON s.id = a.site_id
    ORDER BY a.site_id, a.snapshot_date DESC
  `);
  return (rows as unknown as Array<{
    site_id: string;
    site_name: string;
    domain: string;
    domain_rating: number;
    ref_domains: number;
    backlinks: number;
    snapshot_date: string;
  }>)
    .map((r) => ({
      siteId: r.site_id,
      siteName: r.site_name,
      domain: r.domain,
      domainRating: r.domain_rating,
      refDomains: r.ref_domains,
      backlinks: r.backlinks,
      snapshotDate: String(r.snapshot_date),
    }))
    .sort((a, b) => b.refDomains - a.refDomains);
}
