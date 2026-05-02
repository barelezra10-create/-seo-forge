import { tables } from "@seo-forge/shared";
import { sql } from "drizzle-orm";
import { getDb } from "../orchestrator/_db-singleton.js";
import * as sd from "./striking-distance.js";
import * as td from "./traffic-decline.js";
import * as cg from "./content-gap.js";
import type { OpportunityDraft } from "./types.js";

export type RunOpportunitiesInput = {
  voyageKey: string;
  /** If unset, runs against ALL sites in the sites table. */
  siteIds?: string[];
};

export type RunOpportunitiesResult = {
  detected: number;
  expired: number;
  perSite: Array<{ siteId: string; detected: number; expired: number }>;
};

export async function runOpportunityDetectors(
  i: RunOpportunitiesInput,
): Promise<RunOpportunitiesResult> {
  const db = getDb();

  let siteIds: string[] = [];
  if (i.siteIds && i.siteIds.length > 0) {
    siteIds = i.siteIds;
  } else {
    const rows = await db.select({ id: tables.sites.id }).from(tables.sites);
    siteIds = rows.map((r) => r.id);
  }

  let totalDetected = 0;
  let totalExpired = 0;
  const perSite: RunOpportunitiesResult["perSite"] = [];

  for (const siteId of siteIds) {
    const drafts: OpportunityDraft[] = [];
    try {
      const out = await sd.detectStrikingDistance({ siteId });
      drafts.push(...out);
    } catch (e) {
      console.error(`[opportunities] striking-distance for ${siteId}:`, (e as Error).message);
    }
    try {
      const out = await td.detectTrafficDecline({ siteId });
      drafts.push(...out);
    } catch (e) {
      console.error(`[opportunities] traffic-decline for ${siteId}:`, (e as Error).message);
    }
    try {
      const out = await cg.detectContentGap({ siteId, voyageKey: i.voyageKey });
      drafts.push(...out);
    } catch (e) {
      console.error(`[opportunities] content-gap for ${siteId}:`, (e as Error).message);
    }

    const draftKeys = new Set(drafts.map((d) => d.dedupKey));

    // Read open opportunities for this site
    const existing = await db
      .select({ id: tables.opportunities.id, payload: tables.opportunities.payload })
      .from(tables.opportunities)
      .where(sql`site_id = ${siteId} AND status = 'open'`);

    const existingKeys = new Set(
      existing
        .map((e) => (e.payload as { dedupKey?: string }).dedupKey)
        .filter(Boolean) as string[],
    );

    // Insert drafts whose dedupKey isn't already open
    let detected = 0;
    for (const d of drafts) {
      if (existingKeys.has(d.dedupKey)) continue;
      await db.insert(tables.opportunities).values({
        siteId: d.siteId,
        type: d.type,
        title: d.title,
        description: d.description,
        status: "open",
        payload: { ...d.payload, dedupKey: d.dedupKey },
      });
      detected++;
    }

    // Expire opportunities that are open in DB but no longer in the latest detection.
    // Pass dedup keys as a JSON array, then unnest in SQL — avoids postgres.js array-binding edge cases.
    const draftKeysArr = Array.from(draftKeys);
    const expireResult = await db.execute(sql`
      UPDATE opportunities
      SET status = 'expired', acted_at = NOW()
      WHERE site_id = ${siteId}
        AND status = 'open'
        AND NOT (
          payload->>'dedupKey' IN (
            SELECT jsonb_array_elements_text(${JSON.stringify(draftKeysArr)}::jsonb)
          )
        )
      RETURNING id
    `);
    const expired = (expireResult as unknown as Array<{ id: number }>).length;

    totalDetected += detected;
    totalExpired += expired;
    perSite.push({ siteId, detected, expired });
  }

  return { detected: totalDetected, expired: totalExpired, perSite };
}
