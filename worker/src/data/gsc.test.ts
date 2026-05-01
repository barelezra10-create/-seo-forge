import { describe, it, expect } from "vitest";
import { fetchStrikingDistanceQueries, exchangeRefreshToken } from "./gsc";

const SKIP = !process.env.GSC_REFRESH_TOKEN || !process.env.GSC_CLIENT_ID;

describe("gsc", () => {
  it.skipIf(SKIP)("exchanges refresh token for access token", async () => {
    const token = await exchangeRefreshToken({
      refreshToken: process.env.GSC_REFRESH_TOKEN!,
      clientId: process.env.GSC_CLIENT_ID!,
      clientSecret: process.env.GSC_CLIENT_SECRET!,
    });
    expect(token).toMatch(/^ya29\./);
  });

  it.skipIf(SKIP)("fetches striking-distance queries for a property", async () => {
    const queries = await fetchStrikingDistanceQueries({
      siteUrl: "sc-domain:themcaguide.com",
      refreshToken: process.env.GSC_REFRESH_TOKEN!,
      clientId: process.env.GSC_CLIENT_ID!,
      clientSecret: process.env.GSC_CLIENT_SECRET!,
      days: 28,
      minPosition: 8,
      maxPosition: 25,
      minImpressions: 50,
    });
    expect(Array.isArray(queries)).toBe(true);
    if (queries.length > 0) {
      expect(queries[0]).toHaveProperty("query");
      expect(queries[0]).toHaveProperty("position");
    }
  });
});
