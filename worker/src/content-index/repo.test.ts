import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, tables } from "@seo-forge/shared";
import { sql } from "drizzle-orm";
import { ContentIndexRepo } from "./repo";

const url = process.env.DATABASE_URL ?? "postgres://seo_forge:seo_forge@localhost:5432/seo_forge";
const { db, close } = createDb(url);
const repo = new ContentIndexRepo(db);

beforeAll(async () => {
  await db.execute(sql`DELETE FROM content_index WHERE site_id IN ('test-a', 'test-b')`);
  await db.insert(tables.sites).values([
    { id: "test-a", name: "A", domain: "a.com", repoUrl: "x", contentDir: "x" },
    { id: "test-b", name: "B", domain: "b.com", repoUrl: "x", contentDir: "x" },
  ]).onConflictDoNothing();
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM content_index WHERE site_id IN ('test-a', 'test-b')`);
  await db.execute(sql`DELETE FROM sites WHERE id IN ('test-a', 'test-b')`);
  await close();
});

describe("ContentIndexRepo", () => {
  it("inserts and reads back an article", async () => {
    const v = Array(1024).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    await repo.upsert({
      siteId: "test-a",
      url: "https://a.com/x",
      slug: "x",
      title: "X",
      h1: "X",
      firstParagraph: "first",
      topicEmbedding: v,
      publishedAt: new Date(),
    });
    const rows = await db.select().from(tables.contentIndex).where(sql`url = ${"https://a.com/x"}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("X");
  });

  it("findSimilarOnOtherSites returns nearest articles excluding source site", async () => {
    const target = Array(1024).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    const close = Array(1024).fill(0).map((_, i) => (i === 0 ? 0.99 : 0.01));
    const far = Array(1024).fill(0).map((_, i) => (i === 0 ? 0 : 1));
    await repo.upsert({
      siteId: "test-b",
      url: "https://b.com/close",
      slug: "close",
      title: "Close",
      h1: "Close",
      firstParagraph: "p",
      topicEmbedding: close,
      publishedAt: new Date(),
    });
    await repo.upsert({
      siteId: "test-b",
      url: "https://b.com/far",
      slug: "far",
      title: "Far",
      h1: "Far",
      firstParagraph: "p",
      topicEmbedding: far,
      publishedAt: new Date(),
    });
    const results = await repo.findSimilarOnOtherSites({
      embedding: target,
      excludeSiteId: "test-a",
      limit: 2,
      maxDistance: 0.5,
    });
    expect(results.map((r) => r.url)).toContain("https://b.com/close");
    expect(results[0]!.url).toBe("https://b.com/close");
  });
});
