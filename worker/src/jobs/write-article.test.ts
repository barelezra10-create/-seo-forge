import { describe, it, expect } from "vitest";
import { parseArticleResponse } from "./write-article";

describe("parseArticleResponse", () => {
  it("parses a valid JSON response", () => {
    const json = JSON.stringify({
      ledeAnswer: "An MCA is a lump sum of capital exchanged for a percentage of future receivables.",
      quickFacts: ["Fact 1", "Fact 2", "Fact 3", "Fact 4"],
      body: "## Overview\n\nBody copy.",
    });
    const parsed = parseArticleResponse(json);
    expect(parsed.ledeAnswer).toContain("MCA");
    expect(parsed.quickFacts).toHaveLength(4);
    expect(parsed.body).toContain("Overview");
  });

  it("strips a leading/trailing code fence if present", () => {
    const json = "```json\n" + JSON.stringify({
      ledeAnswer: "x",
      quickFacts: ["a"],
      body: "b",
    }) + "\n```";
    const parsed = parseArticleResponse(json);
    expect(parsed.body).toBe("b");
  });

  it("throws if required keys missing", () => {
    expect(() => parseArticleResponse(JSON.stringify({ ledeAnswer: "x" }))).toThrow();
  });

  it("rejects content with em dashes", () => {
    const emDash = String.fromCharCode(0x2014);
    const json = JSON.stringify({
      ledeAnswer: `An MCA is a tool ${emDash} not a loan.`,
      quickFacts: ["a"],
      body: "b",
    });
    expect(() => parseArticleResponse(json)).toThrow(/em dash/i);
  });
});
