import { snapshotAllSitesGsc } from "../worker/src/orchestrator/gsc-snapshot-cron.js";
import { closeDb } from "../worker/src/orchestrator/_db-singleton.js";

async function main() {
  const refreshToken = process.env.GSC_REFRESH_TOKEN;
  const clientId = process.env.GSC_CLIENT_ID;
  const clientSecret = process.env.GSC_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    console.error("GSC_* env vars required");
    process.exit(1);
  }

  const result = await snapshotAllSitesGsc({ refreshToken, clientId, clientSecret });
  console.log(`done: ok=${result.ok} failed=${result.failed}`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
