import { Command } from "commander";
import { runPipeline } from "./pipeline/pipeline.js";

const program = new Command();
program.name("seo-forge").description("SEO Forge worker CLI").version("0.0.1");

program
  .command("ping")
  .description("Health check")
  .action(() => {
    console.log("pong");
  });

program
  .command("publish")
  .description("Run keyword research → write → publish pipeline for a single site")
  .requiredOption("--site <id>", "Site ID (e.g. mca-guide)")
  .action(async (opts: { site: string }) => {
    try {
      const result = await runPipeline({ siteId: opts.site });
      console.log("\n[publish] success:");
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    } catch (err) {
      console.error("\n[publish] failed:", err);
      process.exit(1);
    }
  });

program.parseAsync();
