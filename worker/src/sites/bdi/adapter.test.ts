import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bdiAdapter,
  pickCategory,
  parseBodyToSections,
  estimateReadTime,
  escapeTsString,
  buildArticleEntry,
  spliceEntry,
} from "./adapter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = join(__dirname, "fixtures", "articles-sample.ts");

let tmp: string;
let repoPath: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "bdi-adapter-test-"));
  repoPath = join(tmp, "repo");
  await mkdir(join(repoPath, "src", "data"), { recursive: true });
  await copyFile(FIXTURE_PATH, join(repoPath, "src", "data", "articles.ts"));
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("bdiAdapter — declarations", () => {
  it("declares siteId, fileFormat, defaultSeed, urlPathPrefix", () => {
    expect(bdiAdapter.siteId).toBe("bdi");
    expect(bdiAdapter.fileFormat).toBe("ts");
    expect(bdiAdapter.defaultSeed).toBe("business debt");
    expect(bdiAdapter.urlPathPrefix).toBe("articles");
  });

  it("buildSlug slugifies the keyword", () => {
    expect(
      bdiAdapter.buildSlug({
        targetKeyword: "How To Settle Business Debt!",
        intent: "info",
        outline: [],
        audience: "",
      }),
    ).toBe("how-to-settle-business-debt");
  });

  it("buildPath always returns src/data/articles.ts (single-file format)", () => {
    expect(bdiAdapter.buildPath("anything")).toBe("src/data/articles.ts");
  });
});

describe("pickCategory", () => {
  it("routes tax keywords to tax-debt", () => {
    expect(pickCategory("how to handle IRS tax debt")).toBe("tax-debt");
  });
  it("routes bankruptcy keywords", () => {
    expect(pickCategory("chapter 11 bankruptcy guide")).toBe("bankruptcy");
  });
  it("routes settlement keywords", () => {
    expect(pickCategory("debt settlement negotiation")).toBe("debt-settlement");
  });
  it("routes industry keywords", () => {
    expect(pickCategory("restaurant business debt")).toBe("industry-guides");
    expect(pickCategory("trucking company debt")).toBe("industry-guides");
  });
  it("routes rights keywords", () => {
    expect(pickCategory("being sued for business debt")).toBe("know-your-rights");
  });
  it("routes cash flow keywords", () => {
    expect(pickCategory("business cash flow turnaround")).toBe("cash-flow");
  });
  it("falls back to types-of-debt", () => {
    expect(pickCategory("merchant cash advance basics")).toBe("types-of-debt");
  });
});

describe("parseBodyToSections", () => {
  it("splits markdown body on H2 headings", () => {
    const body = [
      "## First Section",
      "First paragraph here.",
      "",
      "More text.",
      "",
      "## Second Section",
      "Second paragraph.",
    ].join("\n");
    const sections = parseBodyToSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.heading).toBe("First Section");
    expect(sections[0]!.content).toContain("First paragraph here.");
    expect(sections[0]!.content).toContain("More text.");
    expect(sections[1]!.heading).toBe("Second Section");
    expect(sections[1]!.content).toBe("Second paragraph.");
  });

  it("ignores content above the first H2", () => {
    const body = "Stray lede line.\n\n## Real Section\n\nReal content.";
    const sections = parseBodyToSections(body);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe("Real Section");
  });

  it("returns empty array for body with no H2s", () => {
    expect(parseBodyToSections("just plain text\n\nno headings")).toEqual([]);
  });
});

describe("escapeTsString", () => {
  it("escapes backslashes, double quotes, backticks", () => {
    expect(escapeTsString('he said "hi" \\ done')).toBe('he said \\"hi\\" \\\\ done');
    expect(escapeTsString("`code`")).toBe("\\`code\\`");
  });
  it("converts newlines to \\n", () => {
    expect(escapeTsString("line1\nline2")).toBe("line1\\nline2");
  });
  it("replaces em dashes with hyphens", () => {
    expect(escapeTsString("a — b")).toBe("a - b");
    expect(escapeTsString("a—b")).toBe("a - b");
  });
  it("replaces en dashes with hyphens", () => {
    expect(escapeTsString("3–6 months")).toBe("3-6 months");
  });
});

describe("estimateReadTime", () => {
  it("scales with body length and has a 3 minute floor", () => {
    expect(estimateReadTime("short")).toBe(3);
    expect(estimateReadTime("x".repeat(7500))).toBe(5);
  });
});

describe("buildArticleEntry", () => {
  it("produces a syntactically reasonable a(...) call", () => {
    const entry = buildArticleEntry({
      slug: "test-slug",
      title: "Test Title",
      category: "types-of-debt",
      excerpt: "Excerpt.",
      readTime: 5,
      date: "2026-04-30",
      sections: [
        { heading: "S1", content: "C1" },
        { heading: "S2", content: 'has "quotes"' },
      ],
    });
    expect(entry).toContain('a("test-slug", "Test Title", "types-of-debt"');
    expect(entry).toContain('"Excerpt."');
    expect(entry).toContain('5, "2026-04-30"');
    expect(entry).toContain('{ heading: "S1", content: "C1" }');
    expect(entry).toContain('"has \\"quotes\\""');
    expect(entry).toMatch(/\]\),$/);
  });
});

describe("spliceEntry", () => {
  it("inserts after the array open bracket and skips a leading comment line", async () => {
    const original = await readFile(FIXTURE_PATH, "utf-8");
    const entry = '  a("new-slug", "New Title", "types-of-debt",\n    "x", 3, "2026-04-30", [\n      { heading: "h", content: "c" },\n    ]),';
    const updated = spliceEntry(original, entry);

    // The new entry should appear before the existing first entry.
    const idxNew = updated.indexOf("new-slug");
    const idxExisting = updated.indexOf("existing-mca-article");
    expect(idxNew).toBeGreaterThan(0);
    expect(idxExisting).toBeGreaterThan(idxNew);

    // The leading "// TYPES OF DEBT" comment should still be above the new entry.
    const commentIdx = updated.indexOf("// TYPES OF DEBT");
    expect(commentIdx).toBeGreaterThan(0);
    expect(commentIdx).toBeLessThan(idxNew);

    // Existing entries must still be present untouched.
    expect(updated).toContain("existing-mca-article");
    expect(updated).toContain("another-existing");
  });

  it("throws when the articles array marker is missing", () => {
    expect(() => spliceEntry("// no array here", "  a(\"x\", ..., []),")).toThrow();
  });
});

describe("bdiAdapter.renderFile (integration with fixture)", () => {
  it("reads the fixture, splices a new entry, returns one rendered file", async () => {
    const files = await bdiAdapter.renderFile(
      {
        brief: {
          targetKeyword: "what is a confession of judgment",
          intent: "info",
          outline: [],
          audience: "founders",
        },
        geo: {
          ledeAnswer: "A confession of judgment lets a creditor get a court order without a hearing.",
          quickFacts: [],
        },
        body: [
          "## How a COJ Works",
          "When you sign a COJ, you waive the right to be notified before judgment.",
          "",
          "## State Law Variations",
          "New York banned out-of-state COJs in 2019.",
        ].join("\n"),
        sisterLinks: [
          { url: "https://themcaguide.com/articles/coj-basics", title: "COJ Basics" },
        ],
      },
      repoPath,
    );

    expect(files).toHaveLength(1);
    const out = files[0]!;
    expect(out.path).toBe("src/data/articles.ts");
    expect(out.slug).toBe("what-is-a-confession-of-judgment");

    // Modified content keeps existing entries
    expect(out.content).toContain("existing-mca-article");
    expect(out.content).toContain("another-existing");

    // New entry is present, with correct category (rights / lawsuit -> know-your-rights)
    expect(out.content).toContain("what-is-a-confession-of-judgment");
    expect(out.content).toContain('"know-your-rights"');

    // Excerpt copied from ledeAnswer
    expect(out.content).toContain("A confession of judgment lets a creditor get a court order");

    // Sections from H2s present
    expect(out.content).toContain('"How a COJ Works"');
    expect(out.content).toContain('"State Law Variations"');

    // Sister links section appended
    expect(out.content).toContain("Related Reading");
    expect(out.content).toContain("COJ Basics");

    // No em dashes in the inserted output
    expect(out.content).not.toContain("—");

    // New entry sits before the existing first article
    expect(out.content.indexOf("what-is-a-confession-of-judgment")).toBeLessThan(
      out.content.indexOf("existing-mca-article"),
    );
  });

  it("falls back to a single section when body has no H2 headings", async () => {
    const files = await bdiAdapter.renderFile(
      {
        brief: { targetKeyword: "fallback case", intent: "info", outline: [], audience: "" },
        geo: { ledeAnswer: "A fallback excerpt.", quickFacts: [] },
        body: "Plain text body with no headings.",
        sisterLinks: [],
      },
      repoPath,
    );
    expect(files).toHaveLength(1);
    expect(files[0]!.content).toContain("Plain text body with no headings.");
  });
});
