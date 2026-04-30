import { Command } from "commander";

const program = new Command();
program
  .name("seo-forge")
  .description("SEO Forge worker CLI")
  .version("0.0.1");

program
  .command("ping")
  .description("Health check")
  .action(() => {
    console.log("pong");
  });

program.parse();
