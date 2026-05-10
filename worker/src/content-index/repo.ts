import { type Db } from "@seo-forge/shared";
import { sql } from "drizzle-orm";

export type ContentIndexRow = {
  siteId: string;
  url: string;
  slug: string;
  title: string;
  h1: string;
  firstParagraph: string;
  topicEmbedding: number[];
  publishedAt: Date;
  claudeTranscript?: unknown;
};

export type SimilaritySearch = {
  embedding: number[];
  excludeSiteId: string;
  limit: number;
  maxDistance: number;
};

export type SimilarityHit = {
  id: number;
  siteId: string;
  url: string;
  title: string;
  distance: number;
};

export class ContentIndexRepo {
  constructor(private db: Db) {}

  async upsert(row: ContentIndexRow): Promise<void> {
    const vec = `[${row.topicEmbedding.join(",")}]`;
    const transcript =
      row.claudeTranscript !== undefined && row.claudeTranscript !== null
        ? sql`${JSON.stringify(row.claudeTranscript)}::jsonb`
        : sql`NULL::jsonb`;
    await this.db.execute(sql`
      INSERT INTO content_index
        (site_id, url, slug, title, h1, first_paragraph, topic_embedding, published_at, last_indexed, claude_transcript)
      VALUES
        (${row.siteId}, ${row.url}, ${row.slug}, ${row.title}, ${row.h1},
         ${row.firstParagraph}, ${vec}::vector, ${row.publishedAt.toISOString()}, NOW(), ${transcript})
      ON CONFLICT (url) DO UPDATE SET
        title = EXCLUDED.title,
        h1 = EXCLUDED.h1,
        first_paragraph = EXCLUDED.first_paragraph,
        topic_embedding = EXCLUDED.topic_embedding,
        claude_transcript = EXCLUDED.claude_transcript,
        last_indexed = NOW()
    `);
  }

  /**
   * Find topically similar articles on OTHER sites for cross-linking.
   *
   * Two correctness rules added 2026-05:
   *   1. At most ONE result per sister site (DISTINCT ON site_id) so a site
   *      with a much larger content_index doesn't dominate the results.
   *   2. Skip non-article URLs (tools, calculators, glossary). Cross-links
   *      should be article-to-article for editorial flow + better SEO.
   */
  async findSimilarOnOtherSites(s: SimilaritySearch): Promise<SimilarityHit[]> {
    const vec = `[${s.embedding.join(",")}]`;
    // Step 1: get the closest article per sister site (DISTINCT ON site_id),
    // filtered to article-shaped URLs only.
    const perSite = await this.db.execute<{
      id: number;
      site_id: string;
      url: string;
      title: string;
      distance: number;
    }>(sql`
      SELECT DISTINCT ON (site_id)
        id, site_id, url, title, topic_embedding <=> ${vec}::vector AS distance
      FROM content_index
      WHERE site_id != ${s.excludeSiteId}
        AND topic_embedding IS NOT NULL
        AND topic_embedding <=> ${vec}::vector < ${s.maxDistance}
        AND url NOT ILIKE '%/tools/%'
        AND url NOT ILIKE '%/calculator%'
        AND url NOT ILIKE '%/glossary%'
        AND url NOT ILIKE '%/category/%'
        AND url NOT ILIKE '%/categories%'
      ORDER BY site_id, topic_embedding <=> ${vec}::vector ASC
    `);
    // Step 2: re-sort across sister sites by distance, take top N.
    const sorted = (perSite as unknown as Array<{
      id: number;
      site_id: string;
      url: string;
      title: string;
      distance: number;
    }>)
      .slice()
      .sort((a, b) => a.distance - b.distance)
      .slice(0, s.limit);
    return sorted.map((r) => ({
      id: r.id,
      siteId: r.site_id,
      url: r.url,
      title: r.title,
      distance: r.distance,
    }));
  }
}
