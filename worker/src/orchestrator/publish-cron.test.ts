import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createDb, tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";
import { processNextPublishJob, enqueueDailyPublishJobs } from "./publish-cron";
import * as pipeline from "../pipeline/pipeline";

const url = process.env.DATABASE_URL!;
const { db, close } = createDb(url);

beforeAll(async () => {
  await db
    .insert(tables.sites)
    .values([
      {
        id: "test-pub-on",
        name: "Pub On",
        domain: "pub-on.com",
        repoUrl: "x",
        contentDir: "x",
        autoPublish: true,
        killSwitch: false,
      },
      {
        id: "test-pub-off",
        name: "Pub Off",
        domain: "pub-off.com",
        repoUrl: "x",
        contentDir: "x",
        autoPublish: false,
        killSwitch: false,
      },
      {
        id: "test-pub-killed",
        name: "Pub Killed",
        domain: "pub-killed.com",
        repoUrl: "x",
        contentDir: "x",
        autoPublish: true,
        killSwitch: true,
      },
    ])
    .onConflictDoNothing();
});
afterAll(async () => {
  await db.execute(sql`DELETE FROM jobs WHERE site_id LIKE 'test-pub-%'`);
  await db.execute(sql`DELETE FROM sites WHERE id LIKE 'test-pub-%'`);
  await close();
});

describe("processNextPublishJob", () => {
  it("returns null when no pending publish jobs", async () => {
    // Clear ALL pending publish jobs so the function has nothing to claim. Without this,
    // a stale prod auto-publish job would get claimed and make the test hang.
    await db.execute(sql`DELETE FROM jobs WHERE status = 'pending' AND type = 'publish'`);
    const result = await processNextPublishJob();
    expect(result).toBeNull();
  });

  it("claims a pending job, runs runPipeline, marks succeeded", async () => {
    const [job] = await db
      .insert(tables.jobs)
      .values({
        type: "publish",
        siteId: "test-pub-on",
        status: "pending",
        payload: { siteId: "test-pub-on" },
      })
      .returning({ id: tables.jobs.id });
    expect(job).toBeDefined();

    vi.spyOn(pipeline, "runPipeline").mockResolvedValueOnce({
      siteId: "test-pub-on",
      slug: "test-slug",
      url: "https://pub-on.com/articles/test-slug",
      commitSha: "abc123",
      targetKeyword: "test",
    });

    const result = await processNextPublishJob();
    expect(result).not.toBeNull();
    expect(result!.jobId).toBe(job!.id);

    const [updated] = await db.select().from(tables.jobs).where(eq(tables.jobs.id, job!.id));
    expect(updated!.status).toBe("succeeded");
    expect(updated!.finishedAt).not.toBeNull();
    vi.restoreAllMocks();
  });

  it("marks failed when runPipeline throws", async () => {
    const [job] = await db
      .insert(tables.jobs)
      .values({
        type: "publish",
        siteId: "test-pub-on",
        status: "pending",
        payload: { siteId: "test-pub-on" },
      })
      .returning({ id: tables.jobs.id });

    vi.spyOn(pipeline, "runPipeline").mockRejectedValueOnce(new Error("boom"));

    await expect(processNextPublishJob()).rejects.toThrow("boom");

    const [updated] = await db.select().from(tables.jobs).where(eq(tables.jobs.id, job!.id));
    expect(updated!.status).toBe("failed");
    expect(updated!.error).toContain("boom");
    vi.restoreAllMocks();
  });
});

describe("enqueueDailyPublishJobs", () => {
  it("enqueues a publish job per site where autoPublish=true and killSwitch=false", async () => {
    await db.execute(
      sql`DELETE FROM jobs WHERE site_id LIKE 'test-pub-%' AND payload->>'source' = 'daily-cron'`,
    );
    const count = await enqueueDailyPublishJobs();
    expect(count).toBeGreaterThanOrEqual(1);

    const enqueued = await db
      .select()
      .from(tables.jobs)
      .where(sql`payload->>'source' = 'daily-cron' AND site_id LIKE 'test-pub-%'`);
    const siteIds = enqueued.map((j) => j.siteId).sort();
    expect(siteIds).toContain("test-pub-on");
    expect(siteIds).not.toContain("test-pub-off");
    expect(siteIds).not.toContain("test-pub-killed");
  });
});
