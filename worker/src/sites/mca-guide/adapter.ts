import type { SiteAdapter, RenderInput, ArticleBrief } from "../adapter.js";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function buildJsonLd(brief: ArticleBrief, lede: string): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: brief.targetKeyword,
    description: lede,
    author: { "@type": "Organization", name: "The MCA Guide" },
    publisher: { "@type": "Organization", name: "The MCA Guide" },
  };
  return JSON.stringify(data, null, 2);
}

export const mcaGuideAdapter: SiteAdapter = {
  siteId: "mca-guide",
  contentDir: "content/articles",
  fileFormat: "mdx",
  defaultSeed: "merchant cash advance",

  buildSlug(brief) {
    return slugify(brief.targetKeyword);
  },

  buildPath(slug) {
    return `${this.contentDir}/${slug}.${this.fileFormat}`;
  },

  renderFile(input: RenderInput) {
    const slug = this.buildSlug(input.brief);
    const path = this.buildPath(slug);
    const today = new Date().toISOString().slice(0, 10);

    const frontmatter = [
      "---",
      `title: "${input.brief.targetKeyword.replace(/"/g, '\\"')}"`,
      `description: "${input.geo.ledeAnswer.replace(/"/g, '\\"').slice(0, 160)}"`,
      `date: ${today}`,
      `slug: ${slug}`,
      `targetKeyword: "${input.brief.targetKeyword.replace(/"/g, '\\"')}"`,
      "---",
    ].join("\n");

    const lede = `\n${input.geo.ledeAnswer}\n`;

    const quickFacts =
      "\n## Quick Facts\n\n" +
      input.geo.quickFacts.map((f) => `- ${f}`).join("\n") +
      "\n";

    const body = `\n${input.body}\n`;

    const sisterLinksBlock =
      input.sisterLinks.length > 0
        ? "\n## Related reading\n\n" +
          input.sisterLinks.map((l) => `- [${l.title}](${l.url})`).join("\n") +
          "\n"
        : "";

    const jsonLd = `\n<script type="application/ld+json">\n${buildJsonLd(input.brief, input.geo.ledeAnswer)}\n</script>\n`;

    const content = [frontmatter, lede, quickFacts, body, sisterLinksBlock, jsonLd].join("\n");
    return { path, content, slug };
  },
};
