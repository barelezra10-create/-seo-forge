import { describe, it, expect } from "vitest";
import { mcaGuideAdapter } from "./adapter";

describe("mcaGuideAdapter", () => {
  it("declares siteId, contentDir, fileFormat, defaultSeed", () => {
    expect(mcaGuideAdapter.siteId).toBe("mca-guide");
    expect(mcaGuideAdapter.contentDir).toBe("content/articles");
    expect(mcaGuideAdapter.fileFormat).toBe("mdx");
    expect(mcaGuideAdapter.defaultSeed.length).toBeGreaterThan(0);
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

  it("renderFile produces expected MDX with frontmatter, body, and sister links section", () => {
    const out = mcaGuideAdapter.renderFile({
      brief: { targetKeyword: "MCA basics", intent: "info", outline: ["What"], audience: "founders" },
      geo: { ledeAnswer: "An MCA is X.", quickFacts: ["Fact 1", "Fact 2"] },
      body: "## What\n\nBody copy here.",
      sisterLinks: [
        { url: "https://fintiex.com/loans/personal-loans-101", title: "Personal Loans 101" },
      ],
    });
    expect(out.path).toBe("content/articles/mca-basics.mdx");
    expect(out.content).toContain("---");
    expect(out.content).toContain("title:");
    expect(out.content).toContain("An MCA is X.");
    expect(out.content).toContain("Quick Facts");
    expect(out.content).toContain("Personal Loans 101");
    expect(out.content).toContain("application/ld+json");
  });

  it("renderFile content has no em dash", () => {
    const out = mcaGuideAdapter.renderFile({
      brief: { targetKeyword: "test", intent: "info", outline: [], audience: "" },
      geo: { ledeAnswer: "An MCA is a tool, not a loan.", quickFacts: ["Fact 1"] },
      body: "## A section\n\nBody here.",
      sisterLinks: [],
    });
    expect(out.content).not.toContain("—"); // em dash
  });
});
