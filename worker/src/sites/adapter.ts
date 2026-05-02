export type ArticleBrief = {
  targetKeyword: string;
  intent: string;
  outline: string[];
  audience: string;
};

export type GeoLayer = {
  ledeAnswer: string;
  quickFacts: string[];
};

export type RenderInput = {
  brief: ArticleBrief;
  geo: GeoLayer;
  body: string;
  sisterLinks: Array<{ url: string; title: string }>;
};

export interface SiteAdapter {
  siteId: string;
  contentDir: string;
  fileFormat: "mdx" | "md";
  /** Seed keyword for Ahrefs `matching-terms` lookups. Identifies the site's topic. */
  defaultSeed: string;
  /** URL path prefix between domain and slug (e.g., "articles" for /articles/<slug>). Empty string for root-level pages. */
  urlPathPrefix: string;
  buildSlug(brief: ArticleBrief): string;
  buildPath(slug: string): string;
  renderFile(input: RenderInput): { path: string; content: string; slug: string };
}
