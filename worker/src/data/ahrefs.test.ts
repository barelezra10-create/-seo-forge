import { describe, it, expect } from "vitest";
import { fetchKeywordIdeas } from "./ahrefs";

const KEY = process.env.AHREFS_API_KEY;
const SKIP = !KEY;

describe("fetchKeywordIdeas", () => {
  it.skipIf(SKIP)("returns keyword ideas for a seed", async () => {
    const ideas = await fetchKeywordIdeas({
      seed: "merchant cash advance",
      country: "us",
      limit: 25,
      maxKd: 30,
      apiKey: KEY!,
    });
    expect(Array.isArray(ideas)).toBe(true);
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas[0]).toHaveProperty("keyword");
    expect(ideas[0]).toHaveProperty("volume");
    expect(ideas[0]).toHaveProperty("kd");
  });
});
