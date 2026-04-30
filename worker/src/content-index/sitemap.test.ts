import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSitemap, fetchAndParseSitemap } from "./sitemap";

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
