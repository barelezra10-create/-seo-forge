import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SiteAdapter, RenderInput, RenderedFile, ArticleBrief } from "../adapter.js";

export type BdiCategoryId =
  | "types-of-debt"
  | "tax-debt"
  | "bankruptcy"
  | "debt-settlement"
  | "cash-flow"
  | "know-your-rights"
  | "industry-guides";

const ARTICLES_RELATIVE_PATH = "src/data/articles.ts";

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
  "to",
  "vs",
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

/**
 * Choose the closest BDI category for a given keyword/topic.
 * Order matters: more specific categories are checked first.
 */
export function pickCategory(keyword: string): BdiCategoryId {
  const k = keyword.toLowerCase();
  if (/(restaurant|trucking|construction|retail|medical|dental|salon|contractor|industry)/.test(k)) {
    return "industry-guides";
  }
  if (/(tax|irs|state tax|payroll tax|941|levy)/.test(k)) return "tax-debt";
  if (/(bankruptcy|chapter 7|chapter 11|chapter 13|subchapter v)/.test(k)) return "bankruptcy";
  if (/(settle|settlement|negotiat|workout|restructur)/.test(k)) return "debt-settlement";
  if (/(cash flow|turnaround|liquid|working capital|runway)/.test(k)) return "cash-flow";
  if (/(rights|lawsuit|sued|judgment|coj|confession of judgment|fdcpa|defense|garnish|levy)/.test(k)) {
    return "know-your-rights";
  }
  return "types-of-debt";
}

/**
 * Escape a string for embedding inside a TypeScript double-quoted string literal.
 * Order matters: backslashes first, then double quotes, then control chars.
 * No em dashes are produced; if the input contains them we replace with " - "
 * to keep the brand voice rule.
 */
export function escapeTsString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\s*—\s*/g, " - ") // em dash to hyphen, normalize surrounding whitespace
    .replace(/\s*–\s*/g, "-") // en dash to hyphen
    .replace(/`/g, "\\`")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

export type BdiSection = { heading: string; content: string };

/**
 * Parse a markdown body into BDI-shape sections, splitting on H2 headings.
 * Each H2 becomes a section heading; everything until the next H2 (or EOF)
 * becomes the section content. Content above the first H2 is ignored
 * (the lede answer is used as the article excerpt instead).
 */
export function parseBodyToSections(body: string): BdiSection[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const sections: BdiSection[] = [];
  let current: BdiSection | null = null;
  for (const line of lines) {
    const h2Match = /^##\s+(.+?)\s*$/.exec(line);
    if (h2Match && !line.startsWith("###")) {
      if (current) sections.push(current);
      const heading = h2Match[1] ?? "";
      current = { heading: heading.trim(), content: "" };
      continue;
    }
    if (current) {
      current.content += (current.content ? "\n" : "") + line;
    }
  }
  if (current) sections.push(current);
  // Trim trailing whitespace on each section's content, collapse 3+ newlines.
  return sections
    .map((s) => ({
      heading: s.heading,
      content: s.content.replace(/\n{3,}/g, "\n\n").trim(),
    }))
    .filter((s) => s.heading.length > 0 && s.content.length > 0);
}

export function estimateReadTime(body: string): number {
  // Rough: 1500 chars per minute, minimum 3 minutes.
  return Math.max(3, Math.ceil(body.length / 1500));
}

/**
 * Build the TypeScript snippet for a single `a(...)` call to be spliced
 * into the articles array. Indentation matches the existing file (2 spaces).
 */
export function buildArticleEntry(args: {
  slug: string;
  title: string;
  category: BdiCategoryId;
  excerpt: string;
  readTime: number;
  date: string;
  sections: BdiSection[];
}): string {
  const sectionLines = args.sections
    .map(
      (s) =>
        `      { heading: "${escapeTsString(s.heading)}", content: "${escapeTsString(s.content)}" },`,
    )
    .join("\n");
  return [
    `  a("${escapeTsString(args.slug)}", "${escapeTsString(args.title)}", "${args.category}",`,
    `    "${escapeTsString(args.excerpt)}",`,
    `    ${args.readTime}, "${args.date}", [`,
    sectionLines,
    `    ]),`,
  ].join("\n");
}

/**
 * Splice an entry near the top of `articles: Article[] = [` array.
 * Inserts immediately AFTER the array open bracket, but skips a single
 * leading section comment line (e.g., "// ── TYPES OF DEBT ─...") so the
 * new entry sits as the first concrete article under that section.
 */
export function spliceEntry(fileContent: string, entry: string): string {
  const openMarker = /export const articles\s*:\s*Article\[\]\s*=\s*\[\s*\n/;
  const m = openMarker.exec(fileContent);
  if (!m) {
    throw new Error("Could not find 'export const articles: Article[] = [' in articles.ts");
  }
  const insertAt = m.index + m[0].length;
  const after = fileContent.slice(insertAt);

  // If the very next non-empty line is a `//` comment (section divider),
  // insert AFTER that line so the comment header stays on top.
  const lines = after.split("\n");
  let offsetLines = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      offsetLines = i + 1;
      continue;
    }
    if (line.trim().startsWith("//")) {
      offsetLines = i + 1;
    }
    break;
  }
  const offsetChars = lines.slice(0, offsetLines).join("\n").length + (offsetLines > 0 ? 1 : 0);
  const head = fileContent.slice(0, insertAt + offsetChars);
  const tail = fileContent.slice(insertAt + offsetChars);
  return head + entry + "\n\n" + tail;
}

export const bdiAdapter: SiteAdapter = {
  siteId: "bdi",
  contentDir: "src/data",
  fileFormat: "ts",
  defaultSeed: "business debt",
  urlPathPrefix: "article",

  buildSlug(brief: ArticleBrief) {
    return slugify(brief.targetKeyword);
  },

  buildPath(_slug: string) {
    // BDI stores all articles in a single TS file. The slug does not become
    // a separate file path; we always rewrite this one file.
    return ARTICLES_RELATIVE_PATH;
  },

  async renderFile(input: RenderInput, repoPath: string): Promise<RenderedFile[]> {
    const slug = this.buildSlug(input.brief);
    const path = this.buildPath(slug);
    const today = new Date().toISOString().slice(0, 10);
    const title = titleCase(input.brief.targetKeyword);
    const category = pickCategory(input.brief.targetKeyword);
    const excerpt = input.geo.ledeAnswer.trim();
    const readTime = estimateReadTime(input.body);

    let sections = parseBodyToSections(input.body);

    // Append a "Related reading" section if sister links exist.
    if (input.sisterLinks.length > 0) {
      const relatedContent = input.sisterLinks
        .map((l) => `- ${l.title}: ${l.url}`)
        .join("\n");
      sections = [...sections, { heading: "Related Reading", content: relatedContent }];
    }

    if (sections.length === 0) {
      // Fallback: stuff the entire body into a single section so we don't
      // lose the article when claude-code returns no H2 headings.
      sections = [{ heading: title, content: input.body.trim() }];
    }

    const entry = buildArticleEntry({
      slug,
      title,
      category,
      excerpt,
      readTime,
      date: today,
      sections,
    });

    const absPath = join(repoPath, path);
    const original = await readFile(absPath, "utf-8");
    const updated = spliceEntry(original, entry);
    return [{ path, content: updated, slug }];
  },
};
