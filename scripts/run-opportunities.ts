import { runOpportunityDetectors } from "../worker/src/opportunities/opportunities.js";
import { closeDb } from "../worker/src/orchestrator/_db-singleton.js";

async function main() {
  const voyageKey = process.env.VOYAGE_API_KEY;
  if (!voyageKey) {
    console.error("VOYAGE_API_KEY required");
    process.exit(1);
  }
  const result = await runOpportunityDetectors({ voyageKey });
  console.log(`done: detected=${result.detected} expired=${result.expired}`);
  console.log("per site:", result.perSite);
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
