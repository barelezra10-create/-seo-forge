import { tables } from "@seo-forge/shared";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../orchestrator/_db-singleton.js";
import type { OpportunityDraft } from "./types.js";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

export type DetectInput = { siteId: string };

export async function detectStrikingDistance(i: DetectInput): Promise<OpportunityDraft[]> {
  const db = getDb();

  const [snapshot] = await db
    .select()
    .from(tables.gscSnapshot)
    .where(eq(tables.gscSnapshot.siteId, i.siteId))
    .orderBy(desc(tables.gscSnapshot.snapshotDate))
    .limit(1);
  if (!snapshot) return [];

  const payload = snapshot.payload as {
    strikingDistance?: Array<{
      query: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
  };
  const sdQueries = payload.strikingDistance ?? [];
  if (sdQueries.length === 0) return [];

  const indexRows = await db
    .select({ slug: tables.contentIndex.slug })
    .from(tables.contentIndex)
    .where(eq(tables.contentIndex.siteId, i.siteId));
  const coveredSlugs = new Set(indexRows.map((r) => r.slug));

  return sdQueries
    .filter((q) => !coveredSlugs.has(slugify(q.query)))
    .map((q) => ({
      siteId: i.siteId,
      type: "striking_distance" as const,
      title: `Striking distance: "${q.query}" (#${q.position.toFixed(1)})`,
      description: `Ranks at position ${q.position.toFixed(1)} with ${q.impressions} impressions / ${q.clicks} clicks last 28d. Writing a focused article could push it to page 1.`,
      payload: {
        keyword: q.query,
        position: q.position,
        clicks: q.clicks,
        impressions: q.impressions,
        ctr: q.ctr,
      },
      dedupKey: `striking_distance:${i.siteId}:${slugify(q.query)}`,
    }));
}
