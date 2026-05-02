import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createDb, tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";
import { snapshotSiteAhrefs } from "./ahrefs-snapshot-cron";
import * as ax from "../data/ahrefs-extras";

const url = process.env.DATABASE_URL!;
const { db, close } = createDb(url);

beforeAll(async () => {
  await db.insert(tables.sites).values({
    id: "test-ahrefs",
    name: "Test Ahrefs",
    domain: "test-ahrefs.com",
    repoUrl: "x",
    contentDir: "x",
  }).onConflictDoNothing();
});
afterAll(async () => {
  await db.execute(sql`DELETE FROM ahrefs_snapshot WHERE site_id = 'test-ahrefs'`);
  await db.execute(sql`DELETE FROM sites WHERE id = 'test-ahrefs'`);
  await close();
});

describe("snapshotSiteAhrefs", () => {
  it("aggregates all four fetchers into one snapshot row", async () => {
    vi.spyOn(ax, "fetchDomainRating").mockResolvedValueOnce({ domainRating: 12.5, refDomains: 30 });
    vi.spyOn(ax, "fetchOrganicKeywords").mockResolvedValueOnce([
      { keyword: "k1", volume: 100, difficulty: 5, position: 12, traffic: 5 },
      { keyword: "k2", volume: 50, difficulty: null, position: 18, traffic: 2 },
    ]);
    vi.spyOn(ax, "fetchTopPages").mockResolvedValueOnce([
      { url: "https://test-ahrefs.com/a", traffic: 10, keywords: 3 },
    ]);
    vi.spyOn(ax, "fetchRecentBacklinks").mockResolvedValueOnce([]);

    await snapshotSiteAhrefs({ siteId: "test-ahrefs", domain: "test-ahrefs.com", apiKey: "x" });

    const [row] = await db
      .select()
      .from(tables.ahrefsSnapshot)
      .where(eq(tables.ahrefsSnapshot.siteId, "test-ahrefs"));
    expect(row).toBeDefined();
    expect(row!.domainRating).toBe(12.5);
    expect(row!.refDomains).toBe(30);
    expect(row!.organicKeywords).toBe(2);
    expect(row!.organicTraffic).toBe(7);
    vi.restoreAllMocks();
  });
});
