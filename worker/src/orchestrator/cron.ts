import cron from "node-cron";
import {
  processNextPublishJob,
  enqueueDailyPublishJobs,
  processNextPlannerJob,
  processNextSingleDayPlannerJob,
  processNextDraftJob,
  processNextVerifyPublishJob,
} from "./publish-cron.js";
import { snapshotAllSitesGsc } from "./gsc-snapshot-cron.js";
import { snapshotAllSitesAhrefs } from "./ahrefs-snapshot-cron.js";
import { runOpportunityDetectors } from "../opportunities/opportunities.js";
import { planAllSitesForDate, planAllSitesForMonth } from "./planner-cron.js";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};

console.log("[cron] starting orchestrator");

// Process publish queue every 30 seconds
cron.schedule("*/30 * * * * *", async () => {
  try {
    const result = await processNextPublishJob();
    if (result) console.log(`[cron] processed publish job ${result.jobId}`);
  } catch (e) {
    console.error("[cron] publish job error:", (e as Error).message);
  }
});

// Process planner queue every 30 seconds
cron.schedule("*/30 * * * * *", async () => {
  try {
    const r = await processNextPlannerJob();
    if (r) console.log(`[cron] processed planner job ${r.jobId}`);
  } catch (e) {
    console.error("[cron] planner job error:", (e as Error).message);
  }
});

// Process single-day planner queue every 30 seconds
cron.schedule("*/30 * * * * *", async () => {
  try {
    const r = await processNextSingleDayPlannerJob();
    if (r) console.log(`[cron] processed single-day planner job ${r.jobId}`);
  } catch (e) {
    console.error("[cron] single-day planner job error:", (e as Error).message);
  }
});

// Process draft queue every 30 seconds
cron.schedule("*/30 * * * * *", async () => {
  try {
    const r = await processNextDraftJob();
    if (r) console.log(`[cron] processed draft job ${r.jobId}`);
  } catch (e) {
    console.error("[cron] draft job error:", (e as Error).message);
  }
});

// Process verify-publish queue every 60 seconds (network-bound, longer wait OK)
cron.schedule("0 * * * * *", async () => {
  try {
    const r = await processNextVerifyPublishJob();
    if (r) console.log(`[cron] processed verify-publish job ${r.jobId}`);
  } catch (e) {
    console.error("[cron] verify-publish job error:", (e as Error).message);
  }
});

// On the 1st of each month at 5am, plan the WHOLE month across all sites.
// The daily 5am cron below still runs as a safety net (idempotent: existing
// plan rows for a date are upserted).
cron.schedule("0 5 1 * *", async () => {
  try {
    const today = new Date();
    const r = await planAllSitesForMonth({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      voyageKey: env("VOYAGE_API_KEY"),
      ahrefsKey: env("AHREFS_API_KEY"),
      gscRefreshToken: env("GSC_REFRESH_TOKEN"),
      gscClientId: env("GSC_CLIENT_ID"),
      gscClientSecret: env("GSC_CLIENT_SECRET"),
    });
    console.log(`[cron] monthly planner: planned=${r.planned} skipped=${r.skipped} (${r.daysCovered} days)`);
  } catch (e) {
    console.error("[cron] monthly planner error:", (e as Error).message);
  }
});

// Plan tomorrow's articles at 5am every day (catch-up + safety net for the monthly run)
cron.schedule("0 5 * * *", async () => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const r = await planAllSitesForDate({
      date: tomorrow.toISOString().slice(0, 10),
      voyageKey: env("VOYAGE_API_KEY"),
      ahrefsKey: env("AHREFS_API_KEY"),
      gscRefreshToken: env("GSC_REFRESH_TOKEN"),
      gscClientId: env("GSC_CLIENT_ID"),
      gscClientSecret: env("GSC_CLIENT_SECRET"),
    });
    console.log(`[cron] planner: planned=${r.planned} skipped=${r.skipped}`);
  } catch (e) {
    console.error("[cron] planner error:", (e as Error).message);
  }
});

// Enqueue daily auto-publish at 6am
cron.schedule("0 6 * * *", async () => {
  try {
    const count = await enqueueDailyPublishJobs();
    console.log(`[cron] enqueued ${count} daily publish jobs`);
  } catch (e) {
    console.error("[cron] daily enqueue error:", (e as Error).message);
  }
});

// GSC snapshot at 2am
cron.schedule("0 2 * * *", async () => {
  try {
    const r = await snapshotAllSitesGsc({
      refreshToken: env("GSC_REFRESH_TOKEN"),
      clientId: env("GSC_CLIENT_ID"),
      clientSecret: env("GSC_CLIENT_SECRET"),
    });
    console.log(`[cron] GSC snapshot: ok=${r.ok} failed=${r.failed}`);
  } catch (e) {
    console.error("[cron] GSC snapshot error:", (e as Error).message);
  }
});

// Ahrefs snapshot weekly, Sunday 3am — stretches Ahrefs API budget 7x
cron.schedule("0 3 * * 0", async () => {
  try {
    const r = await snapshotAllSitesAhrefs({ apiKey: env("AHREFS_API_KEY") });
    console.log(`[cron] Ahrefs snapshot: ok=${r.ok} failed=${r.failed}`);
  } catch (e) {
    console.error("[cron] Ahrefs snapshot error:", (e as Error).message);
  }
});

// Opportunities at 4am (after both snapshots)
cron.schedule("0 4 * * *", async () => {
  try {
    const r = await runOpportunityDetectors({ voyageKey: env("VOYAGE_API_KEY") });
    console.log(`[cron] opportunities: detected=${r.detected} expired=${r.expired}`);
  } catch (e) {
    console.error("[cron] opportunities error:", (e as Error).message);
  }
});

// Keep process alive
process.stdin.resume();
