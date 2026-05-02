import { tables } from "@seo-forge/shared";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../orchestrator/_db-singleton.js";
import { embedText } from "../embeddings/voyage.js";
import type { OpportunityDraft } from "./types.js";

export type DetectContentGapInput = {
  siteId: string;
  voyageKey: string;
  /** Max cosine distance for a sister article to count as "topically close" (default 0.45) */
  maxDistance?: number;
  /** How many top queries to check (default 10) */
  maxQueriesToCheck?: number;
};

export async function detectContentGap(i: DetectContentGapInput): Promise<OpportunityDraft[]> {
  const db = getDb();
  const maxDistance = i.maxDistance ?? 0.45;
  const maxQ = i.maxQueriesToCheck ?? 10;

  const [snapshot] = await db
    .select()
    .from(tables.gscSnapshot)
    .where(eq(tables.gscSnapshot.siteId, i.siteId))
    .orderBy(desc(tables.gscSnapshot.snapshotDate))
    .limit(1);
  if (!snapshot) return [];

  const payload = snapshot.payload as {
    topQueries?: Array<{ query: string; clicks: number; impressions: number; position: number }>;
  };
  const queries = (payload.topQueries ?? []).slice(0, maxQ);
  if (queries.length === 0) return [];

  const drafts: OpportunityDraft[] = [];
  for (const q of queries) {
    const embedding = await embedText(q.query, i.voyageKey);
    const vec = `[${embedding.join(",")}]`;
    const hits = await db.execute<{ id: number; site_id: string; url: string; title: string; distance: number }>(sql`
      SELECT id, site_id, url, title, topic_embedding <=> ${vec}::vector AS distance
      FROM content_index
      WHERE site_id != ${i.siteId}
        AND topic_embedding IS NOT NULL
        AND topic_embedding <=> ${vec}::vector < ${maxDistance}
      ORDER BY topic_embedding <=> ${vec}::vector ASC
      LIMIT 1
    `);
    const rows = hits as unknown as Array<{ id: number; site_id: string; url: string; title: string; distance: number }>;
    const top = rows[0];
    if (!top) continue;
    drafts.push({
      siteId: i.siteId,
      type: "content_gap" as const,
      title: `Cross-link gap: ${q.query} -> ${top.title}`,
      description: `Site ranks for "${q.query}" but doesn't link to your existing sister-site article on the same topic. Adding the link in the next refresh could pass authority.`,
      payload: {
        keyword: q.query,
        targetSiteId: top.site_id,
        targetUrl: top.url,
        targetTitle: top.title,
        distance: top.distance,
        queryClicks: q.clicks,
        queryImpressions: q.impressions,
      },
      dedupKey: `content_gap:${i.siteId}:${q.query.toLowerCase()}:${top.site_id}`,
    });
  }
  return drafts;
}
