import cron from "node-cron";
import { processNextPublishJob, enqueueDailyPublishJobs } from "./publish-cron.js";
import { snapshotAllSitesGsc } from "./gsc-snapshot-cron.js";
import { snapshotAllSitesAhrefs } from "./ahrefs-snapshot-cron.js";
import { runOpportunityDetectors } from "../opportunities/opportunities.js";

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

// Ahrefs snapshot at 3am
cron.schedule("0 3 * * *", async () => {
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
