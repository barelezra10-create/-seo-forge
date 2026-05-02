import type { SiteAdapter, RenderInput } from "../adapter.js";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

const SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "with",
]);

function titleCase(s: string): string {
  const words = s.trim().split(/\s+/);
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i !== 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export const mcaGuideAdapter: SiteAdapter = {
  siteId: "mca-guide",
  contentDir: "content/articles",
  fileFormat: "mdx",
  defaultSeed: "merchant cash advance",
  urlPathPrefix: "articles",

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
    const title = titleCase(input.brief.targetKeyword);

    const frontmatter = [
      "---",
      `title: "${title.replace(/"/g, '\\"')}"`,
      `description: "${input.geo.ledeAnswer.replace(/"/g, '\\"').slice(0, 160)}"`,
      `publishedAt: "${today}"`,
      `author: "Bar Alezrah"`,
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

    const content = [frontmatter, lede, quickFacts, body, sisterLinksBlock].join("\n");
    return { path, content, slug };
  },
};
