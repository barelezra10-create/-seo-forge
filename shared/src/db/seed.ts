import { createDb, tables } from "../index";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const { db, close } = createDb(url);

await db
  .insert(tables.sites)
  .values({
    id: "mca-guide",
    name: "The MCA Guide",
    domain: "themcaguide.com",
    repoUrl: process.env.MCA_GUIDE_REPO_URL ?? "git@github.com:barcoastal/themcaguide.git",
    branch: "main",
    contentDir: process.env.MCA_GUIDE_CONTENT_DIR ?? "content/articles",
    fileFormat: "mdx",
    brandVoice: "Practical, plain-language, founder-focused. No fluff. Cite sources. Examples in dollars.",
  })
  .onConflictDoUpdate({
    target: tables.sites.id,
    set: {
      name: "The MCA Guide",
      domain: "themcaguide.com",
    },
  });

console.log("Seeded mca-guide site.");
await close();
