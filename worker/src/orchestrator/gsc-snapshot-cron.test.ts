import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createDb, tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";
import { snapshotSiteGsc } from "./gsc-snapshot-cron";
import * as gsc from "../data/gsc";

const url = process.env.DATABASE_URL!;
const { db, close } = createDb(url);

beforeAll(async () => {
  await db.insert(tables.sites).values({
    id: "test-gsc",
    name: "Test GSC",
    domain: "test-gsc.com",
    repoUrl: "x",
    contentDir: "x",
  }).onConflictDoNothing();
});
afterAll(async () => {
  await db.execute(sql`DELETE FROM gsc_snapshot WHERE site_id = 'test-gsc'`);
  await db.execute(sql`DELETE FROM sites WHERE id = 'test-gsc'`);
  await close();
});

describe("snapshotSiteGsc", () => {
  it("aggregates rows and writes a snapshot", async () => {
    vi.spyOn(gsc, "fetchStrikingDistanceQueries").mockResolvedValueOnce([
      { query: "q1", clicks: 100, impressions: 1000, ctr: 0.1, position: 9 },
      { query: "q2", clicks: 50, impressions: 800, ctr: 0.0625, position: 11 },
    ]);
    await snapshotSiteGsc({
      siteId: "test-gsc",
      siteUrl: "https://test-gsc.com/",
      refreshToken: "x",
      clientId: "x",
      clientSecret: "x",
    });
    const [row] = await db
      .select()
      .from(tables.gscSnapshot)
      .where(eq(tables.gscSnapshot.siteId, "test-gsc"));
    expect(row).toBeDefined();
    expect(row!.totalClicks).toBe(150);
    expect(row!.totalImpressions).toBe(1800);
    vi.restoreAllMocks();
  });
});
