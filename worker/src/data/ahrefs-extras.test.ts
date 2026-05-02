import { describe, it, expect } from "vitest";
import {
  fetchDomainRating,
  fetchOrganicKeywords,
  fetchTopPages,
  fetchRecentBacklinks,
} from "./ahrefs-extras";

const KEY = process.env.AHREFS_API_KEY;
const SKIP = !KEY;

describe("ahrefs-extras", () => {
  it.skipIf(SKIP)(
    "fetchDomainRating returns numeric DR + refDomains for themcaguide.com",
    async () => {
      const dr = await fetchDomainRating({ domain: "themcaguide.com", apiKey: KEY! });
      expect(typeof dr.domainRating).toBe("number");
      expect(typeof dr.refDomains).toBe("number");
    },
  );
  it.skipIf(SKIP)(
    "fetchOrganicKeywords returns array (may be empty for small site)",
    async () => {
      const ks = await fetchOrganicKeywords({ domain: "themcaguide.com", apiKey: KEY! });
      expect(Array.isArray(ks)).toBe(true);
    },
  );
  it.skipIf(SKIP)("fetchTopPages returns array", async () => {
    const ps = await fetchTopPages({ domain: "themcaguide.com", apiKey: KEY! });
    expect(Array.isArray(ps)).toBe(true);
  });
  it.skipIf(SKIP)("fetchRecentBacklinks returns array", async () => {
    const bs = await fetchRecentBacklinks({ domain: "themcaguide.com", apiKey: KEY! });
    expect(Array.isArray(bs)).toBe(true);
  });
});
