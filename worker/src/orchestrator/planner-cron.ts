import { tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";
import { gatherCandidates, selectKeyword, buildBrief } from "../jobs/keyword-research.js";
import { embedText } from "../embeddings/voyage.js";
import { ContentIndexRepo } from "../content-index/repo.js";
import { getDb } from "./_db-singleton.js";
import { ADAPTERS_BY_SITE_ID } from "../sites/adapters.js";

export type PlanInput = {
  siteId: string;
  date: string; // YYYY-MM-DD
  voyageKey: string;
  ahrefsKey: string;
  gscRefreshToken: string;
  gscClientId: string;
  gscClientSecret: string;
  /** Keywords to exclude from candidate selection (e.g., when regenerating a plan
   * the user didn't like). Slugified before matching. */
  excludeKeywords?: string[];
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

export async function planSiteForDate(
  i: PlanInput,
): Promise<{ planId: number | null; keyword: string | null }> {
  const db = getDb();
  const [site] = await db.select().from(tables.sites).where(eq(tables.sites.id, i.siteId));
  if (!site) return { planId: null, keyword: null };
  if (site.killSwitch || !site.autoPublish) return { planId: null, keyword: null };

  const adapter = ADAPTERS_BY_SITE_ID[i.siteId];
  const seed = adapter?.defaultSeed ?? "business loans";

  // Covered slugs from content_index (skip topics already published).
  const indexRows = await db
    .select({ slug: tables.contentIndex.slug })
    .from(tables.contentIndex)
    .where(eq(tables.contentIndex.siteId, i.siteId));
  const coveredSlugs = new Set(indexRows.map((r) => r.slug));

  // Also exclude slugs already planned for upcoming dates.
  const futurePlanRows = await db
    .select({ targetKeyword: tables.articlePlans.targetKeyword })
    .from(tables.articlePlans)
    .where(sql`site_id = ${i.siteId} AND planned_date >= CURRENT_DATE AND status = 'planned'`);
  for (const p of futurePlanRows) {
    coveredSlugs.add(slugify(p.targetKeyword));
  }

  // Caller-supplied exclude list (e.g., regenerate flow).
  if (i.excludeKeywords) {
    for (const k of i.excludeKeywords) coveredSlugs.add(slugify(k));
  }

  const candidates = await gatherCandidates({
    siteId: i.siteId,
    domain: site.domain,
    seed,
    coveredSlugs,
    ahrefsKey: i.ahrefsKey,
    gscRefreshToken: i.gscRefreshToken,
    gscClientId: i.gscClientId,
    gscClientSecret: i.gscClientSecret,
  });
  const picked = selectKeyword({ candidates, coveredSlugs });
  if (!picked) return { planId: null, keyword: null };

  const brief = buildBrief(picked, "founders running cash-flow businesses");

  // Predict sister-site links via embedding lookup.
  const briefEmbed = await embedText(
    `${brief.targetKeyword}\n${brief.outline.join("\n")}`,
    i.voyageKey,
  );
  const repo = new ContentIndexRepo(db);
  const sisterHits = await repo.findSimilarOnOtherSites({
    embedding: briefEmbed,
    excludeSiteId: i.siteId,
    limit: 2,
    maxDistance: 0.45,
  });

  const researchPayload = {
    source: brief.source,
    volume: brief.volume,
    kd: brief.kd,
    position: picked.position ?? null,
    audience: brief.audience,
    outline: brief.outline,
  };
  const sisterPayload = sisterHits.map((h) => ({
    siteId: h.siteId,
    url: h.url,
    title: h.title,
    distance: h.distance,
  }));

  const [inserted] = await db
    .insert(tables.articlePlans)
    .values({
      siteId: i.siteId,
      plannedDate: i.date,
      targetKeyword: brief.targetKeyword,
      intent: brief.intent,
      research: researchPayload,
      sisterLinks: sisterPayload,
      status: "planned",
    })
    .onConflictDoUpdate({
      target: [tables.articlePlans.siteId, tables.articlePlans.plannedDate],
      set: {
        targetKeyword: brief.targetKeyword,
        intent: brief.intent,
        research: researchPayload,
        sisterLinks: sisterPayload,
        updatedAt: new Date(),
      },
    })
    .returning({ id: tables.articlePlans.id });

  return { planId: inserted?.id ?? null, keyword: brief.targetKeyword };
}

export async function planAllSitesForDate(
  i: Omit<PlanInput, "siteId" | "date"> & { date: string },
): Promise<{ planned: number; skipped: number }> {
  const db = getDb();
  const sites = await db.select().from(tables.sites);
  let planned = 0;
  let skipped = 0;
  for (const site of sites) {
    if (site.killSwitch || !site.autoPublish) {
      skipped++;
      continue;
    }
    try {
      const result = await planSiteForDate({ ...i, siteId: site.id, date: i.date });
      if (result.planId) planned++;
      else skipped++;
    } catch (e) {
      console.error(`[planner] ${site.id} failed:`, (e as Error).message);
      skipped++;
    }
  }
  return { planned, skipped };
}

/**
 * Plan EVERY day in a calendar month across all eligible sites. Idempotent:
 * existing plan rows for a (site, date) are upserted by planSiteForDate.
 * Skips dates that have already passed (today and earlier) when called
 * mid-month so we don't backfill the past.
 */
export async function planAllSitesForMonth(
  i: Omit<PlanInput, "siteId" | "date"> & { year: number; month: number /* 1-12 */ },
): Promise<{ planned: number; skipped: number; daysCovered: number }> {
  const startOfMonth = new Date(Date.UTC(i.year, i.month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(i.year, i.month, 1));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  for (
    let d = new Date(startOfMonth);
    d < startOfNextMonth;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    if (d < today) continue; // skip past dates
    dates.push(d.toISOString().slice(0, 10));
  }

  let planned = 0;
  let skipped = 0;
  for (const date of dates) {
    const r = await planAllSitesForDate({ ...i, date });
    planned += r.planned;
    skipped += r.skipped;
  }
  return { planned, skipped, daysCovered: dates.length };
}
