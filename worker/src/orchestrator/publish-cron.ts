import { tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./_db-singleton.js";
import { runPipeline } from "../pipeline/pipeline.js";
import { planAllSitesForDate, planSiteForDate } from "./planner-cron.js";
import { runWriteArticle } from "../jobs/write-article.js";
import type { KeywordBrief } from "../jobs/write-article.prompt.js";
import { verifyPublishedArticle } from "../jobs/verify-publish.js";

export type ProcessResult = { jobId: number; result: unknown };

export async function processNextPublishJob(): Promise<ProcessResult | null> {
  const db = getDb();
  const claimed = await db.execute<{ id: number; payload: { siteId: string; planId?: number } }>(sql`
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
  const rows = claimed as unknown as Array<{ id: number | string; payload: { siteId: string; planId?: number } }>;
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
    const result = await runPipeline({
      siteId: job.payload.siteId,
      jobId: job.id,
      planId: job.payload.planId,
    });
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
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const site of sites) {
    if (!site.autoPublish) continue;

    // Look for today's plan; only enqueue if a planned row exists.
    const [plan] = await db
      .select()
      .from(tables.articlePlans)
      .where(
        sql`site_id = ${site.id} AND planned_date = ${today} AND status = 'planned'`,
      );
    if (!plan) {
      console.log(`[enqueue] ${site.id}: no plan for ${today}, skipping`);
      continue;
    }

    await db.insert(tables.jobs).values({
      type: "publish",
      siteId: site.id,
      status: "pending",
      payload: { siteId: site.id, planId: plan.id, source: "daily-cron" },
    });
    count++;
  }
  return count;
}

export async function processNextPlannerJob(): Promise<{ jobId: number } | null> {
  const db = getDb();
  const claimed = await db.execute<{ id: number; payload: { date: string } }>(sql`
    UPDATE jobs SET status = 'claimed', claimed_at = NOW()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND type = 'planner'
      ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, payload
  `);
  const rows = claimed as unknown as Array<{ id: number | string; payload: { date: string } }>;
  if (rows.length === 0) return null;
  const raw = rows[0]!;
  const job = { id: Number(raw.id), payload: raw.payload };

  await db
    .update(tables.jobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(tables.jobs.id, job.id));

  try {
    const r = await planAllSitesForDate({
      date: job.payload.date,
      voyageKey: process.env.VOYAGE_API_KEY!,
      ahrefsKey: process.env.AHREFS_API_KEY!,
      gscRefreshToken: process.env.GSC_REFRESH_TOKEN!,
      gscClientId: process.env.GSC_CLIENT_ID!,
      gscClientSecret: process.env.GSC_CLIENT_SECRET!,
    });
    await db
      .update(tables.jobs)
      .set({ status: "succeeded", finishedAt: new Date(), result: r })
      .where(eq(tables.jobs.id, job.id));
    return { jobId: job.id };
  } catch (e) {
    await db
      .update(tables.jobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: (e as Error).message.slice(0, 1000),
      })
      .where(eq(tables.jobs.id, job.id));
    throw e;
  }
}

export async function processNextDraftJob(): Promise<ProcessResult | null> {
  const db = getDb();
  const claimed = await db.execute<{ id: number; payload: { planId: number } }>(sql`
    UPDATE jobs SET status = 'claimed', claimed_at = NOW()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND type = 'draft'
        AND (run_after IS NULL OR run_after <= NOW())
      ORDER BY created_at ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, payload
  `);
  const rows = claimed as unknown as Array<{ id: number | string; payload: { planId: number } }>;
  if (rows.length === 0) return null;
  const raw = rows[0]!;
  const job = { id: Number(raw.id), payload: raw.payload };

  await db
    .update(tables.jobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(tables.jobs.id, job.id));

  await appendJobLog(job.id, `[${new Date().toISOString()}] starting draft for plan ${job.payload.planId}`);

  try {
    const planId = Number(job.payload.planId);
    if (!Number.isFinite(planId)) throw new Error(`invalid planId in payload`);

    const [plan] = await db
      .select()
      .from(tables.articlePlans)
      .where(eq(tables.articlePlans.id, planId));
    if (!plan) throw new Error(`Plan ${planId} not found`);
    if (plan.status !== "planned") {
      throw new Error(`Plan ${planId} is ${plan.status}, expected planned`);
    }

    const [site] = await db
      .select()
      .from(tables.sites)
      .where(eq(tables.sites.id, plan.siteId));
    if (!site) throw new Error(`Site ${plan.siteId} not found`);

    const research = (plan.research ?? {}) as {
      source?: "ahrefs" | "gsc";
      volume?: number;
      kd?: number;
      audience?: string;
      outline?: string[];
    };
    const brief: KeywordBrief = {
      targetKeyword: plan.targetKeyword,
      intent: plan.intent,
      outline: research.outline ?? [
        `Direct answer: define ${plan.targetKeyword}`,
        `Context: when this matters for the reader`,
        `Specifics with numbers and examples`,
        `Common pitfalls / what to avoid`,
        `Action steps`,
      ],
      audience: research.audience ?? "founders running cash-flow businesses",
      source: research.source ?? "ahrefs",
      volume: research.volume ?? 0,
      kd: research.kd ?? 0,
    };
    const sisterLinks = ((plan.sisterLinks ?? []) as Array<{
      url: string;
      title: string;
    }>).map((l) => ({ url: l.url, title: l.title }));

    await appendJobLog(
      job.id,
      `[${new Date().toISOString()}] running claude-code for "${brief.targetKeyword}" (5-15 min)...`,
    );

    const article = await runWriteArticle({
      brief,
      sisterLinks,
      brandVoice: site.brandVoice,
      siteName: site.name,
      domain: site.domain,
    });

    await db
      .update(tables.articlePlans)
      .set({
        draft: article,
        draftGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tables.articlePlans.id, planId));

    const result = { planId, charCount: article.body.length };
    await appendJobLog(
      job.id,
      `[${new Date().toISOString()}] draft cached (${article.body.length} chars body)`,
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

export async function processNextVerifyPublishJob(): Promise<ProcessResult | null> {
  const db = getDb();
  const claimed = await db.execute<{
    id: number;
    payload: { planId: number | null; articleUrl: string; sisterUrls: string[] };
  }>(sql`
    UPDATE jobs SET status = 'claimed', claimed_at = NOW()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND type = 'verify-publish'
        AND (run_after IS NULL OR run_after <= NOW())
      ORDER BY created_at ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, payload
  `);
  const rows = claimed as unknown as Array<{
    id: number | string;
    payload: { planId: number | null; articleUrl: string; sisterUrls: string[] };
  }>;
  if (rows.length === 0) return null;
  const raw = rows[0]!;
  const job = { id: Number(raw.id), payload: raw.payload };

  await db
    .update(tables.jobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(tables.jobs.id, job.id));
  await appendJobLog(job.id, `[${new Date().toISOString()}] verify-publish for ${job.payload.articleUrl}`);

  try {
    const preview = await verifyPublishedArticle({
      url: job.payload.articleUrl,
      sisterUrls: job.payload.sisterUrls ?? [],
      log: (line) => appendJobLog(job.id, `[${new Date().toISOString()}] ${line}`),
    });
    if (job.payload.planId) {
      await db
        .update(tables.articlePlans)
        .set({ publishedLivePreview: preview, updatedAt: new Date() })
        .where(eq(tables.articlePlans.id, job.payload.planId));
    }
    await db
      .update(tables.jobs)
      .set({ status: "succeeded", finishedAt: new Date(), result: preview as unknown })
      .where(eq(tables.jobs.id, job.id));
    return { jobId: job.id, result: preview };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 1000);
    await appendJobLog(job.id, `[${new Date().toISOString()}] verify-publish failed: ${msg}`);
    await db
      .update(tables.jobs)
      .set({ status: "failed", finishedAt: new Date(), error: msg })
      .where(eq(tables.jobs.id, job.id));
    throw e;
  }
}

export async function processNextSingleDayPlannerJob(): Promise<{ jobId: number } | null> {
  const db = getDb();
  const claimed = await db.execute<{
    id: number;
    payload: { date: string; siteId: string; excludeKeywords?: string[] };
  }>(sql`
    UPDATE jobs SET status = 'claimed', claimed_at = NOW()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND type = 'planner-single'
      ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, payload
  `);
  const rows = claimed as unknown as Array<{
    id: number | string;
    payload: { date: string; siteId: string; excludeKeywords?: string[] };
  }>;
  if (rows.length === 0) return null;
  const raw = rows[0]!;
  const job = { id: Number(raw.id), payload: raw.payload };

  await db
    .update(tables.jobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(tables.jobs.id, job.id));

  try {
    const r = await planSiteForDate({
      siteId: job.payload.siteId,
      date: job.payload.date,
      voyageKey: process.env.VOYAGE_API_KEY!,
      ahrefsKey: process.env.AHREFS_API_KEY!,
      gscRefreshToken: process.env.GSC_REFRESH_TOKEN!,
      gscClientId: process.env.GSC_CLIENT_ID!,
      gscClientSecret: process.env.GSC_CLIENT_SECRET!,
      excludeKeywords: job.payload.excludeKeywords,
    });
    await db
      .update(tables.jobs)
      .set({ status: "succeeded", finishedAt: new Date(), result: r })
      .where(eq(tables.jobs.id, job.id));
    return { jobId: job.id };
  } catch (e) {
    await db
      .update(tables.jobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: (e as Error).message.slice(0, 1000),
      })
      .where(eq(tables.jobs.id, job.id));
    throw e;
  }
}
