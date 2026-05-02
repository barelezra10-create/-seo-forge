import { fetchKeywordIdeas } from "../data/ahrefs.js";
import { fetchStrikingDistanceQueries } from "../data/gsc.js";
import type { KeywordBrief } from "./write-article.prompt.js";

export type { KeywordBrief };

export type Candidate = {
  keyword: string;
  source: "ahrefs" | "gsc";
  volume: number;
  kd: number;
  position: number | null;
};

export type SelectInput = {
  candidates: Candidate[];
  coveredSlugs: Set<string>;
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function score(c: Candidate): number {
  // Higher is better.
  if (c.source === "gsc") {
    // Striking distance: impressions weighted by closeness to page 1.
    // Position 11 => factor 1.5; position 25 => factor 0.1. Volume of 0 => score 0.
    const positionFactor = Math.max(0.1, (26 - (c.position ?? 25)) / 10);
    return c.volume * positionFactor;
  }
  // Ahrefs: volume / (kd + 1). Favor traffic per difficulty.
  return c.volume / (c.kd + 1);
}

export function selectKeyword(input: SelectInput): Candidate | null {
  const eligible = input.candidates.filter((c) => !input.coveredSlugs.has(slugify(c.keyword)));
  if (eligible.length === 0) return null;
  return eligible.reduce((best, cur) => (score(cur) > score(best) ? cur : best));
}

export type KeywordResearchInput = {
  siteId: string;
  domain: string;
  // Ahrefs matching-terms takes a seed *keyword*, not a domain.
  // For now the pipeline passes adapter.defaultSeed.
  seed: string;
  coveredSlugs: Set<string>;
  ahrefsKey: string;
  gscRefreshToken: string;
  gscClientId: string;
  gscClientSecret: string;
};

export async function gatherCandidates(i: KeywordResearchInput): Promise<Candidate[]> {
  const [ideas, striking] = await Promise.all([
    fetchKeywordIdeas({
      seed: i.seed,
      country: "us",
      limit: 50,
      maxKd: 30,
      apiKey: i.ahrefsKey,
    }),
    fetchStrikingDistanceQueries({
      // URL-prefix property format works for all 6 finance-cluster sites Bar
      // currently has access to. Future sites whose token only has
      // sc-domain access will need a per-site override on SiteAdapter.
      siteUrl: `https://${i.domain}/`,
      refreshToken: i.gscRefreshToken,
      clientId: i.gscClientId,
      clientSecret: i.gscClientSecret,
      days: 28,
      minPosition: 8,
      maxPosition: 25,
      minImpressions: 50,
    }),
  ]);
  return [
    ...ideas.map<Candidate>((k) => ({
      keyword: k.keyword,
      source: "ahrefs",
      volume: k.volume,
      // Ahrefs returns null kd for many keywords. Treat unknown as 0.
      kd: k.kd ?? 0,
      position: null,
    })),
    ...striking.map<Candidate>((q) => ({
      keyword: q.query,
      source: "gsc",
      volume: q.impressions,
      kd: 0,
      position: q.position,
    })),
  ];
}

export function buildBrief(c: Candidate, audience: string): KeywordBrief {
  return {
    targetKeyword: c.keyword,
    intent: c.keyword.startsWith("how") || c.keyword.startsWith("what") ? "informational" : "commercial",
    outline: [
      `Direct answer: define ${c.keyword}`,
      `Context: when this matters for the reader`,
      `Specifics with numbers and examples`,
      `Common pitfalls / what to avoid`,
      `Action steps`,
    ],
    audience,
    source: c.source,
    volume: c.volume,
    kd: c.kd,
  };
}
