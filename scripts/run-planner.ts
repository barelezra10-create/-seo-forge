import { planAllSitesForDate } from "../worker/src/orchestrator/planner-cron.js";
import { closeDb } from "../worker/src/orchestrator/_db-singleton.js";

async function main() {
  const date =
    process.argv[2] ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const r = await planAllSitesForDate({
    date,
    voyageKey: process.env.VOYAGE_API_KEY!,
    ahrefsKey: process.env.AHREFS_API_KEY!,
    gscRefreshToken: process.env.GSC_REFRESH_TOKEN!,
    gscClientId: process.env.GSC_CLIENT_ID!,
    gscClientSecret: process.env.GSC_CLIENT_SECRET!,
  });
  console.log(`Planned for ${date}: ${r.planned} planned, ${r.skipped} skipped`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
