import { describe, it, expect } from "vitest";
import { mcaGuideAdapter } from "./adapter";

describe("mcaGuideAdapter", () => {
  it("declares siteId, contentDir, fileFormat, defaultSeed", () => {
    expect(mcaGuideAdapter.siteId).toBe("mca-guide");
    expect(mcaGuideAdapter.contentDir).toBe("content/articles");
    expect(mcaGuideAdapter.fileFormat).toBe("mdx");
    expect(mcaGuideAdapter.defaultSeed.length).toBeGreaterThan(0);
    expect(mcaGuideAdapter.urlPathPrefix).toBe("articles");
  });

  it("builds slug from keyword", () => {
    expect(
      mcaGuideAdapter.buildSlug({
        targetKeyword: "What is an MCA loan",
        intent: "info",
        outline: [],
        audience: "",
      }),
    ).toBe("what-is-an-mca-loan");
  });

  it("buildPath joins contentDir + slug + .mdx", () => {
    expect(mcaGuideAdapter.buildPath("foo-bar")).toBe("content/articles/foo-bar.mdx");
  });

  it("renderFile produces expected MDX with frontmatter, body, and sister links section", async () => {
    const files = await mcaGuideAdapter.renderFile(
      {
        brief: { targetKeyword: "MCA basics", intent: "info", outline: ["What"], audience: "founders" },
        geo: { ledeAnswer: "An MCA is X.", quickFacts: ["Fact 1", "Fact 2"] },
        body: "## What\n\nBody copy here.",
        sisterLinks: [
          { url: "https://fintiex.com/loans/personal-loans-101", title: "Personal Loans 101" },
        ],
      },
      "/tmp/unused",
    );
    expect(files).toHaveLength(1);
    const out = files[0]!;
    expect(out.path).toBe("content/articles/mca-basics.mdx");
    expect(out.content).toContain("---");
    expect(out.content).toContain("title:");
    expect(out.content).toContain("publishedAt:");
    expect(out.content).toContain('author: "Bar Alezrah"');
    expect(out.content).toContain("An MCA is X.");
    expect(out.content).toContain("Quick Facts");
    expect(out.content).toContain("Personal Loans 101");
    // JSON-LD must NOT be inlined: MDX 2/3 treats `{` inside <script> as a JSX
    // expression boundary. MCA Guide injects structured data via Next metadata.
    expect(out.content).not.toContain("application/ld+json");
  });

  it("renderFile title-cases the target keyword", async () => {
    const files = await mcaGuideAdapter.renderFile(
      {
        brief: {
          targetKeyword: "merchant cash advance lawyer",
          intent: "info",
          outline: [],
          audience: "",
        },
        geo: { ledeAnswer: "Lede.", quickFacts: ["Fact"] },
        body: "## A\n\nBody.",
        sisterLinks: [],
      },
      "/tmp/unused",
    );
    expect(files[0]!.content).toContain('title: "Merchant Cash Advance Lawyer"');
  });

  it("renderFile keeps small connector words lowercase in title", async () => {
    const files = await mcaGuideAdapter.renderFile(
      {
        brief: {
          targetKeyword: "the best mca for restaurants",
          intent: "info",
          outline: [],
          audience: "",
        },
        geo: { ledeAnswer: "Lede.", quickFacts: ["Fact"] },
        body: "## A\n\nBody.",
        sisterLinks: [],
      },
      "/tmp/unused",
    );
    // First word always capitalized; "for" stays lowercase because it's a
    // small connector. "Mca" only Title Case'd because the picker hands us
    // lowercase keywords; that's acceptable for the simple helper.
    expect(files[0]!.content).toContain('title: "The Best Mca for Restaurants"');
  });

  it("renderFile content has no em dash", async () => {
    const files = await mcaGuideAdapter.renderFile(
      {
        brief: { targetKeyword: "test", intent: "info", outline: [], audience: "" },
        geo: { ledeAnswer: "An MCA is a tool, not a loan.", quickFacts: ["Fact 1"] },
        body: "## A section\n\nBody here.",
        sisterLinks: [],
      },
      "/tmp/unused",
    );
    expect(files[0]!.content).not.toContain("—"); // em dash
  });
});
