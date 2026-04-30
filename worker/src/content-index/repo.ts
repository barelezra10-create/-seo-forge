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
    await this.db.execute(sql`
      INSERT INTO content_index
        (site_id, url, slug, title, h1, first_paragraph, topic_embedding, published_at, last_indexed)
      VALUES
        (${row.siteId}, ${row.url}, ${row.slug}, ${row.title}, ${row.h1},
         ${row.firstParagraph}, ${vec}::vector, ${row.publishedAt.toISOString()}, NOW())
      ON CONFLICT (url) DO UPDATE SET
        title = EXCLUDED.title,
        h1 = EXCLUDED.h1,
        first_paragraph = EXCLUDED.first_paragraph,
        topic_embedding = EXCLUDED.topic_embedding,
        last_indexed = NOW()
    `);
  }

  async findSimilarOnOtherSites(s: SimilaritySearch): Promise<SimilarityHit[]> {
    const vec = `[${s.embedding.join(",")}]`;
    const rows = await this.db.execute<{
      id: number;
      site_id: string;
      url: string;
      title: string;
      distance: number;
    }>(sql`
      SELECT id, site_id, url, title, topic_embedding <=> ${vec}::vector AS distance
      FROM content_index
      WHERE site_id != ${s.excludeSiteId}
        AND topic_embedding IS NOT NULL
        AND topic_embedding <=> ${vec}::vector < ${s.maxDistance}
      ORDER BY topic_embedding <=> ${vec}::vector ASC
      LIMIT ${s.limit}
    `);
    return rows.map((r) => ({
      id: r.id,
      siteId: r.site_id,
      url: r.url,
      title: r.title,
      distance: r.distance,
    }));
  }
}
