import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSitemap, parseSitemapIndex, isSitemapIndex } from "./sitemap";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "fixtures/sample-sitemap.xml"), "utf-8");

describe("parseSitemap", () => {
  it("extracts URLs from a sitemap.xml string", () => {
    const urls = parseSitemap(fixture);
    expect(urls).toEqual([
      { loc: "https://example.com/article-one", lastmod: "2026-04-01" },
      { loc: "https://example.com/article-two", lastmod: "2026-04-15" },
    ]);
  });

  it("handles a sitemap with no lastmod", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://x.com/a</loc></url></urlset>`;
    expect(parseSitemap(xml)).toEqual([{ loc: "https://x.com/a", lastmod: null }]);
  });

  it("returns empty array for empty urlset", () => {
    expect(parseSitemap(`<?xml version="1.0"?><urlset></urlset>`)).toEqual([]);
  });
});

describe("parseSitemapIndex", () => {
  it("extracts child sitemap URLs from a sitemap index", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://x.com/sitemap-0.xml</loc></sitemap>
<sitemap><loc>https://x.com/sitemap-1.xml</loc></sitemap>
</sitemapindex>`;
    expect(parseSitemapIndex(xml)).toEqual([
      "https://x.com/sitemap-0.xml",
      "https://x.com/sitemap-1.xml",
    ]);
  });
});

describe("isSitemapIndex", () => {
  it("returns true for a sitemap index", () => {
    expect(isSitemapIndex(`<?xml version="1.0"?><sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>`)).toBe(true);
  });
  it("returns false for a regular sitemap", () => {
    expect(isSitemapIndex(`<?xml version="1.0"?><urlset><url><loc>x</loc></url></urlset>`)).toBe(false);
  });
});
