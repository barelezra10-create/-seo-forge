export type AhrefsKeywordIdea = {
  keyword: string;
  volume: number;
  kd: number | null;
  cpc: number | null;
};

export type FetchKeywordIdeasOpts = {
  seed: string;
  country: string;
  limit: number;
  maxKd: number;
  apiKey: string;
};

export async function fetchKeywordIdeas(o: FetchKeywordIdeasOpts): Promise<AhrefsKeywordIdea[]> {
  const url = new URL("https://api.ahrefs.com/v3/keywords-explorer/matching-terms");
  url.searchParams.set("country", o.country);
  url.searchParams.set("keywords", o.seed);
  url.searchParams.set("select", "keyword,volume,difficulty,cpc");
  url.searchParams.set("limit", String(o.limit));
  url.searchParams.set(
    "where",
    JSON.stringify({ field: "difficulty", is: ["lte", o.maxKd] }),
  );

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${o.apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Ahrefs API ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    keywords: Array<{ keyword: string; volume: number; difficulty: number | null; cpc: number | null }>;
  };
  return json.keywords.map((k) => ({
    keyword: k.keyword,
    volume: k.volume,
    kd: k.difficulty,
    cpc: k.cpc,
  }));
}
