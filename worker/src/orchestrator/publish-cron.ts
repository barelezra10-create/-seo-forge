import { tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./_db-singleton.js";
import { runPipeline } from "../pipeline/pipeline.js";

export type ProcessResult = { jobId: number; result: unknown };

export async function processNextPublishJob(): Promise<ProcessResult | null> {
  const db = getDb();
  const claimed = await db.execute<{ id: number; payload: { siteId: string } }>(sql`
    UPDATE jobs SET status = 'claimed', claimed_at = NOW()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND type = 'publish'
        AND (run_after IS NULL OR run_after <= NOW())
      ORDER BY created_at ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, payload
  `);
  const rows = claimed as unknown as Array<{ id: number | string; payload: { siteId: string } }>;
  if (rows.length === 0) return null;
  const raw = rows[0]!;
  const job = { id: Number(raw.id), payload: raw.payload };

  await db
    .update(tables.jobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(tables.jobs.id, job.id));

  // Append a "started" log entry
  await appendJobLog(job.id, `[${new Date().toISOString()}] starting publish for ${job.payload.siteId}`);

  try {
    const result = await runPipeline({ siteId: job.payload.siteId, jobId: job.id });
    await appendJobLog(
      job.id,
      `[${new Date().toISOString()}] published: ${(result as { url?: string }).url ?? "?"}`,
    );
    await db
      .update(tables.jobs)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        result: result as unknown,
      })
      .where(eq(tables.jobs.id, job.id));
    return { jobId: job.id, result };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 1000);
    await appendJobLog(job.id, `[${new Date().toISOString()}] failed: ${msg}`);
    await db
      .update(tables.jobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: msg,
      })
      .where(eq(tables.jobs.id, job.id));
    throw e;
  }
}

export async function appendJobLog(jobId: number, line: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    UPDATE jobs SET payload = jsonb_set(
      COALESCE(payload, '{}'::jsonb),
      '{log}',
      COALESCE(payload->'log', '[]'::jsonb) || ${JSON.stringify([line])}::jsonb
    )
    WHERE id = ${jobId}
  `);
}

export async function enqueueDailyPublishJobs(): Promise<number> {
  const db = getDb();
  const sites = await db.select().from(tables.sites).where(eq(tables.sites.killSwitch, false));
  let count = 0;
  for (const site of sites) {
    if (!site.autoPublish) continue;
    await db.insert(tables.jobs).values({
      type: "publish",
      siteId: site.id,
      status: "pending",
      payload: { siteId: site.id, source: "daily-cron" },
    });
    count++;
  }
  return count;
}
