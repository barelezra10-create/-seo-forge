export type SitemapEntry = { loc: string; lastmod: string | null };

export function parseSitemap(xml: string): SitemapEntry[] {
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  return urlBlocks.map((block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim() ?? "";
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? null;
    return { loc, lastmod };
  });
}

export function parseSitemapIndex(xml: string): string[] {
  const sitemapBlocks = xml.match(/<sitemap>[\s\S]*?<\/sitemap>/g) ?? [];
  return sitemapBlocks.map(
    (block) => block.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim() ?? "",
  ).filter(Boolean);
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/.test(xml);
}

export async function fetchAndParseSitemap(sitemapUrl: string): Promise<SitemapEntry[]> {
  const res = await fetch(sitemapUrl, { headers: { "User-Agent": "seo-forge/0.0.1" } });
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status} ${sitemapUrl}`);
  const xml = await res.text();

  if (isSitemapIndex(xml)) {
    const childUrls = parseSitemapIndex(xml);
    const childResults = await Promise.all(childUrls.map((u) => fetchAndParseSitemap(u)));
    return childResults.flat();
  }

  return parseSitemap(xml);
}
