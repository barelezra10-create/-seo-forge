import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createDb, tables } from "@seo-forge/shared";
import { sql } from "drizzle-orm";
import { detectContentGap } from "./content-gap";
import * as voyage from "../embeddings/voyage";

const url = process.env.DATABASE_URL!;
const { db, close } = createDb(url);

beforeAll(async () => {
  await db.insert(tables.sites).values([
    { id: "test-cg-a", name: "A", domain: "a.com", repoUrl: "x", contentDir: "x" },
    { id: "test-cg-b", name: "B", domain: "b.com", repoUrl: "x", contentDir: "x" },
  ]).onConflictDoNothing();

  // Site B has an article about "personal loans"; embedding [1, 0, ...]
  const matchVec = `[${[1, ...Array(1023).fill(0)].join(",")}]`;
  await db.execute(sql`
    INSERT INTO content_index (site_id, url, slug, title, h1, first_paragraph, topic_embedding, published_at, last_indexed)
    VALUES ('test-cg-b', 'https://b.com/personal-loans', 'personal-loans', 'Personal Loans Guide', 'h', 'p', ${matchVec}::vector, NOW(), NOW())
    ON CONFLICT (url) DO NOTHING
  `);

  // Site A has a GSC snapshot with a query about "personal loans"
  await db.execute(sql`
    INSERT INTO gsc_snapshot (site_id, snapshot_date, total_clicks, total_impressions, avg_ctr, avg_position, payload)
    VALUES ('test-cg-a', '2026-05-02', 0, 0, 0, 0, ${JSON.stringify({
      topQueries: [{ query: "personal loans rates", clicks: 50, impressions: 800, ctr: 0.0625, position: 7 }],
      strikingDistance: [],
    })}::jsonb)
    ON CONFLICT (site_id, snapshot_date) DO UPDATE SET payload = EXCLUDED.payload
  `);
});
afterAll(async () => {
  await db.execute(sql`DELETE FROM content_index WHERE site_id IN ('test-cg-a', 'test-cg-b')`);
  await db.execute(sql`DELETE FROM gsc_snapshot WHERE site_id IN ('test-cg-a', 'test-cg-b')`);
  await db.execute(sql`DELETE FROM sites WHERE id IN ('test-cg-a', 'test-cg-b')`);
  await close();
});

describe("detectContentGap", () => {
  it("finds sister-site articles topically close to a top query and emits an opportunity", async () => {
    // Mock embedText to return the same vector as the seeded article so cosine distance ~ 0
    vi.spyOn(voyage, "embedText").mockResolvedValue([1, ...Array(1023).fill(0)] as never);

    const drafts = await detectContentGap({
      siteId: "test-cg-a",
      voyageKey: "x",
      maxDistance: 0.5,
      maxQueriesToCheck: 5,
    });
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts[0]!.type).toBe("content_gap");
    expect(drafts[0]!.payload.targetUrl).toBe("https://b.com/personal-loans");

    vi.restoreAllMocks();
  });

  it("returns empty when no sister sites have content", async () => {
    vi.spyOn(voyage, "embedText").mockResolvedValue([0, ...Array(1023).fill(0)] as never);
    const drafts = await detectContentGap({
      siteId: "nonexistent",
      voyageKey: "x",
      maxDistance: 0.1,
      maxQueriesToCheck: 5,
    });
    expect(drafts).toEqual([]);
    vi.restoreAllMocks();
  });
});
