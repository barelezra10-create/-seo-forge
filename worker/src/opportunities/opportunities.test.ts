import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createDb, tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";
import { runOpportunityDetectors } from "./opportunities";
import * as sd from "./striking-distance";
import * as td from "./traffic-decline";
import * as cg from "./content-gap";

const url = process.env.DATABASE_URL!;
const { db, close } = createDb(url);

beforeAll(async () => {
  await db.insert(tables.sites).values({
    id: "test-opp",
    name: "Test Opp",
    domain: "test-opp.com",
    repoUrl: "x",
    contentDir: "x",
  }).onConflictDoNothing();
});
afterAll(async () => {
  await db.execute(sql`DELETE FROM opportunities WHERE site_id = 'test-opp'`);
  await db.execute(sql`DELETE FROM sites WHERE id = 'test-opp'`);
  await close();
});

describe("runOpportunityDetectors", () => {
  it("inserts new opportunities, dedupes against existing open ones, expires stale", async () => {
    // First run: 2 opportunities surface
    vi.spyOn(sd, "detectStrikingDistance").mockResolvedValueOnce([
      {
        siteId: "test-opp",
        type: "striking_distance",
        title: "SD: foo",
        description: "desc",
        payload: { keyword: "foo" },
        dedupKey: "striking_distance:test-opp:foo",
      },
      {
        siteId: "test-opp",
        type: "striking_distance",
        title: "SD: bar",
        description: "desc",
        payload: { keyword: "bar" },
        dedupKey: "striking_distance:test-opp:bar",
      },
    ]);
    vi.spyOn(td, "detectTrafficDecline").mockResolvedValueOnce([]);
    vi.spyOn(cg, "detectContentGap").mockResolvedValueOnce([]);

    const r1 = await runOpportunityDetectors({ voyageKey: "x", siteIds: ["test-opp"] });
    expect(r1.detected).toBe(2);
    expect(r1.expired).toBe(0);

    const open1 = await db
      .select()
      .from(tables.opportunities)
      .where(eq(tables.opportunities.siteId, "test-opp"));
    expect(open1.length).toBe(2);

    // Second run: only "foo" still surfaces, "bar" should expire
    vi.spyOn(sd, "detectStrikingDistance").mockResolvedValueOnce([
      {
        siteId: "test-opp",
        type: "striking_distance",
        title: "SD: foo",
        description: "desc updated",
        payload: { keyword: "foo" },
        dedupKey: "striking_distance:test-opp:foo",
      },
    ]);
    vi.spyOn(td, "detectTrafficDecline").mockResolvedValueOnce([]);
    vi.spyOn(cg, "detectContentGap").mockResolvedValueOnce([]);

    const r2 = await runOpportunityDetectors({ voyageKey: "x", siteIds: ["test-opp"] });
    expect(r2.expired).toBe(1); // "bar" expired

    const stillOpen = await db
      .select()
      .from(tables.opportunities)
      .where(sql`site_id = 'test-opp' AND status = 'open'`);
    expect(stillOpen.length).toBe(1);

    vi.restoreAllMocks();
  });
});
