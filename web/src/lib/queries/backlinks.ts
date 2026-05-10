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

export type InternalExchangeRow = {
  source: "published" | "planned";
  sourceSiteId: string;
  sourceSiteName: string;
  sourceTitle: string;
  sourceUrl: string | null; // null for planned-but-unpublished
  targetSiteId: string;
  targetSiteName: string;
  targetTitle: string;
  targetUrl: string;
  createdAt: string; // ISO
};

/**
 * Internal cross-links the platform has placed (or is about to place) between
 * sister sites. Union of two sources:
 *   - PUBLISHED articles: content_index rows where claude_transcript is not
 *     null. The transcript's sisterLinks array records the URLs the agent
 *     inlined into the live article.
 *   - PLANNED articles: article_plans rows where sister_links is non-empty
 *     and status is 'planned'. These are predicted cross-links the next
 *     publish will create.
 */
export async function listInternalExchange(limit = 500): Promise<InternalExchangeRow[]> {
  const db = getDb();

  // Published cross-links from content_index
  const publishedRows = await db.execute<{
    source_site_id: string;
    source_site_name: string;
    source_title: string;
    source_url: string;
    target_url: string;
    target_site_id: string | null;
    target_site_name: string | null;
    target_title: string | null;
    created_at: string;
  }>(sql`
    SELECT
      ci.site_id AS source_site_id,
      ss.name AS source_site_name,
      ci.title AS source_title,
      ci.url AS source_url,
      link->>'url' AS target_url,
      target.site_id AS target_site_id,
      ts.name AS target_site_name,
      target.title AS target_title,
      to_char(COALESCE(ci.published_at, ci.last_indexed) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM content_index ci
    JOIN sites ss ON ss.id = ci.site_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ci.claude_transcript->'sisterLinks', '[]'::jsonb)) WITH ORDINALITY AS arr(link, ord)
    LEFT JOIN content_index target ON target.url = (link->>'url')
    LEFT JOIN sites ts ON ts.id = target.site_id
    WHERE ci.claude_transcript IS NOT NULL
    ORDER BY ci.last_indexed DESC, ord ASC
    LIMIT ${limit}
  `);

  // Planned cross-links from article_plans
  const plannedRows = await db.execute<{
    source_site_id: string;
    source_site_name: string;
    source_title: string;
    target_url: string;
    target_site_id: string | null;
    target_site_name: string | null;
    target_title: string | null;
    created_at: string;
  }>(sql`
    SELECT
      ap.site_id AS source_site_id,
      ss.name AS source_site_name,
      ap.target_keyword AS source_title,
      link->>'url' AS target_url,
      target.site_id AS target_site_id,
      ts.name AS target_site_name,
      target.title AS target_title,
      to_char(ap.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM article_plans ap
    JOIN sites ss ON ss.id = ap.site_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ap.sister_links, '[]'::jsonb)) WITH ORDINALITY AS arr(link, ord)
    LEFT JOIN content_index target ON target.url = (link->>'url')
    LEFT JOIN sites ts ON ts.id = target.site_id
    WHERE ap.status = 'planned'
    ORDER BY ap.planned_date ASC, ord ASC
    LIMIT ${limit}
  `);

  const published: InternalExchangeRow[] = (publishedRows as unknown as Array<{
    source_site_id: string;
    source_site_name: string;
    source_title: string;
    source_url: string;
    target_url: string;
    target_site_id: string | null;
    target_site_name: string | null;
    target_title: string | null;
    created_at: string;
  }>).map((r) => ({
    source: "published",
    sourceSiteId: r.source_site_id,
    sourceSiteName: r.source_site_name,
    sourceTitle: r.source_title,
    sourceUrl: r.source_url,
    targetSiteId: r.target_site_id ?? "external",
    targetSiteName: r.target_site_name ?? new URL(r.target_url).hostname.replace(/^www\./, ""),
    targetTitle: r.target_title ?? r.target_url,
    targetUrl: r.target_url,
    createdAt: r.created_at,
  }));

  const planned: InternalExchangeRow[] = (plannedRows as unknown as Array<{
    source_site_id: string;
    source_site_name: string;
    source_title: string;
    target_url: string;
    target_site_id: string | null;
    target_site_name: string | null;
    target_title: string | null;
    created_at: string;
  }>).map((r) => ({
    source: "planned",
    sourceSiteId: r.source_site_id,
    sourceSiteName: r.source_site_name,
    sourceTitle: r.source_title,
    sourceUrl: null,
    targetSiteId: r.target_site_id ?? "external",
    targetSiteName: r.target_site_name ?? new URL(r.target_url).hostname.replace(/^www\./, ""),
    targetTitle: r.target_title ?? r.target_url,
    targetUrl: r.target_url,
    createdAt: r.created_at,
  }));

  return [...published, ...planned].slice(0, limit);
}

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
