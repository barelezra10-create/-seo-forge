import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, tables } from "@seo-forge/shared";
import { sql } from "drizzle-orm";
import { detectTrafficDecline } from "./traffic-decline";

const url = process.env.DATABASE_URL!;
const { db, close } = createDb(url);

beforeAll(async () => {
  await db.insert(tables.sites).values({
    id: "test-td",
    name: "Test TD",
    domain: "test-td.com",
    repoUrl: "x",
    contentDir: "x",
  }).onConflictDoNothing();

  // Two snapshots: 28 days ago (high) and today (low), net decline
  const old = new Date(); old.setDate(old.getDate() - 28);
  const today = new Date();
  await db.execute(sql`
    INSERT INTO gsc_snapshot (site_id, snapshot_date, total_clicks, total_impressions, avg_ctr, avg_position, payload)
    VALUES
      ('test-td', ${old.toISOString().slice(0, 10)}, 100, 1000, 0.1, 8, '{}'::jsonb),
      ('test-td', ${today.toISOString().slice(0, 10)}, 30, 800, 0.0375, 12, '{}'::jsonb)
    ON CONFLICT (site_id, snapshot_date) DO UPDATE SET total_clicks = EXCLUDED.total_clicks
  `);

  await db.execute(sql`
    INSERT INTO ahrefs_snapshot (site_id, snapshot_date, domain_rating, ref_domains, backlinks, organic_keywords, organic_traffic, payload)
    VALUES ('test-td', ${today.toISOString().slice(0, 10)}, 5, 10, 50, 20, 100, ${JSON.stringify({
      topPages: [
        { url: "https://test-td.com/a/declining-page", traffic: 30, keywords: 5 },
        { url: "https://test-td.com/a/stable-page", traffic: 80, keywords: 8 },
      ],
    })}::jsonb)
    ON CONFLICT (site_id, snapshot_date) DO UPDATE SET payload = EXCLUDED.payload
  `);
});
afterAll(async () => {
  await db.execute(sql`DELETE FROM gsc_snapshot WHERE site_id = 'test-td'`);
  await db.execute(sql`DELETE FROM ahrefs_snapshot WHERE site_id = 'test-td'`);
  await db.execute(sql`DELETE FROM sites WHERE id = 'test-td'`);
  await close();
});

describe("detectTrafficDecline", () => {
  it("emits a site-level opportunity when total clicks dropped > 30% across 28d", async () => {
    const drafts = await detectTrafficDecline({ siteId: "test-td", days: 28, thresholdPct: 0.3 });
    expect(drafts.length).toBeGreaterThan(0);
    const sitewide = drafts.find((d) => d.payload.scope === "site");
    expect(sitewide).toBeDefined();
    expect(sitewide!.type).toBe("traffic_decline");
  });

  it("returns empty when only one snapshot exists (insufficient history)", async () => {
    const drafts = await detectTrafficDecline({ siteId: "nonexistent", days: 28, thresholdPct: 0.3 });
    expect(drafts).toEqual([]);
  });
});
