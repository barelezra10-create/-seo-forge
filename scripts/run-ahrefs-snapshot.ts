import { snapshotAllSitesAhrefs } from "../worker/src/orchestrator/ahrefs-snapshot-cron.js";
import { closeDb } from "../worker/src/orchestrator/_db-singleton.js";

async function main() {
  const apiKey = process.env.AHREFS_API_KEY;
  if (!apiKey) {
    console.error("AHREFS_API_KEY required");
    process.exit(1);
  }

  const result = await snapshotAllSitesAhrefs({ apiKey });
  console.log(`done: ok=${result.ok} failed=${result.failed}`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
