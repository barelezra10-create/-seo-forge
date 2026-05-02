/**
 * Ahrefs Site Explorer endpoints.
 *
 * Probe deviations (2026-05-02):
 *   - domain-rating: returns { domain_rating: { domain_rating, ahrefs_rank } }.
 *     ref_domains NOT included; we fetch it separately from refdomains-history.
 *   - organic-keywords: column names are keyword_difficulty / best_position / sum_traffic
 *     (NOT difficulty / position / traffic).
 *   - top-pages: column names are sum_traffic / keywords (NOT traffic).
 *   - all-backlinks: matches the plan.
 *
 * 403 responses (plan-tier issues) are caught and the function returns a sensible
 * default (0, []) rather than throwing — partial Ahrefs data beats no data at all.
 */
const AHREFS_BASE = "https://api.ahrefs.com/v3/site-explorer";

async function ahrefsGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<T> {
  const url = new URL(`${AHREFS_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("output", "json");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ahrefs ${path} ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function fetchDomainRating(opts: {
  domain: string;
  apiKey: string;
}): Promise<{ domainRating: number; refDomains: number }> {
  const today = new Date().toISOString().slice(0, 10);
  // DR endpoint
  let domainRating = 0;
  try {
    const drJson = await ahrefsGet<{
      domain_rating?: { domain_rating?: number; ahrefs_rank?: number } | number;
    }>(
      "domain-rating",
      { target: opts.domain, date: today },
      opts.apiKey,
    );
    const drField = drJson.domain_rating;
    if (typeof drField === "number") {
      domainRating = drField;
    } else if (drField && typeof drField === "object") {
      domainRating = typeof drField.domain_rating === "number" ? drField.domain_rating : 0;
    }
  } catch (e) {
    console.warn(
      `[ahrefs] domain-rating failed for ${opts.domain}:`,
      (e as Error).message,
    );
  }

  // ref_domains: fetched separately via refdomains-history (single-day window).
  let refDomains = 0;
  try {
    const rdJson = await ahrefsGet<{
      refdomains?: Array<{ date: string; refdomains: number }>;
    }>(
      "refdomains-history",
      {
        target: opts.domain,
        date_from: today,
        date_to: today,
        history_grouping: "daily",
      },
      opts.apiKey,
    );
    const rows = rdJson.refdomains ?? [];
    if (rows.length > 0) {
      refDomains = rows[rows.length - 1]!.refdomains ?? 0;
    }
  } catch (e) {
    console.warn(
      `[ahrefs] refdomains-history failed for ${opts.domain}:`,
      (e as Error).message,
    );
  }

  return { domainRating, refDomains };
}

export type AhrefsKeyword = {
  keyword: string;
  volume: number;
  difficulty: number | null;
  position: number;
  traffic: number;
};

export async function fetchOrganicKeywords(opts: {
  domain: string;
  apiKey: string;
  limit?: number;
}): Promise<AhrefsKeyword[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const json = await ahrefsGet<{
      keywords?: Array<{
        keyword: string;
        volume?: number;
        keyword_difficulty?: number | null;
        best_position?: number;
        sum_traffic?: number;
      }>;
    }>(
      "organic-keywords",
      {
        target: opts.domain,
        country: "us",
        date: today,
        select: "keyword,volume,keyword_difficulty,best_position,sum_traffic",
        order_by: "sum_traffic:desc",
        limit: String(opts.limit ?? 50),
      },
      opts.apiKey,
    );
    const rows = json.keywords ?? [];
    return rows.map((k) => ({
      keyword: k.keyword,
      volume: k.volume ?? 0,
      difficulty: k.keyword_difficulty ?? null,
      position: k.best_position ?? 0,
      traffic: k.sum_traffic ?? 0,
    }));
  } catch (e) {
    console.warn(
      `[ahrefs] organic-keywords failed for ${opts.domain}:`,
      (e as Error).message,
    );
    return [];
  }
}

export type AhrefsPage = { url: string; traffic: number; keywords: number };

export async function fetchTopPages(opts: {
  domain: string;
  apiKey: string;
  limit?: number;
}): Promise<AhrefsPage[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const json = await ahrefsGet<{
      pages?: Array<{ url: string; sum_traffic?: number; keywords?: number }>;
    }>(
      "top-pages",
      {
        target: opts.domain,
        country: "us",
        date: today,
        select: "url,sum_traffic,keywords",
        order_by: "sum_traffic:desc",
        limit: String(opts.limit ?? 30),
      },
      opts.apiKey,
    );
    const rows = json.pages ?? [];
    return rows.map((p) => ({
      url: p.url,
      traffic: p.sum_traffic ?? 0,
      keywords: p.keywords ?? 0,
    }));
  } catch (e) {
    console.warn(
      `[ahrefs] top-pages failed for ${opts.domain}:`,
      (e as Error).message,
    );
    return [];
  }
}

export type AhrefsBacklink = {
  urlFrom: string;
  domainRatingSource: number;
  firstSeen: string | null;
  anchor: string;
};

export async function fetchRecentBacklinks(opts: {
  domain: string;
  apiKey: string;
  limit?: number;
}): Promise<AhrefsBacklink[]> {
  try {
    const json = await ahrefsGet<{
      backlinks?: Array<{
        url_from: string;
        domain_rating_source?: number;
        first_seen?: string | null;
        anchor?: string;
      }>;
    }>(
      "all-backlinks",
      {
        target: opts.domain,
        select: "url_from,domain_rating_source,first_seen,anchor",
        order_by: "first_seen:desc",
        limit: String(opts.limit ?? 30),
      },
      opts.apiKey,
    );
    const rows = json.backlinks ?? [];
    return rows.map((b) => ({
      urlFrom: b.url_from,
      domainRatingSource: b.domain_rating_source ?? 0,
      firstSeen: b.first_seen ?? null,
      anchor: b.anchor ?? "",
    }));
  } catch (e) {
    console.warn(
      `[ahrefs] all-backlinks failed for ${opts.domain}:`,
      (e as Error).message,
    );
    return [];
  }
}
