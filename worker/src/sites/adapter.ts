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

export type RenderedFile = {
  /** Repo-relative path to write */
  path: string;
  /** Full file content to write (overwrites existing) */
  content: string;
  /** The article's slug (used in the URL) */
  slug: string;
};

export interface SiteAdapter {
  siteId: string;
  contentDir: string;
  fileFormat: "mdx" | "md" | "ts";
  /** Seed keyword for Ahrefs `matching-terms` lookups. Identifies the site's topic. */
  defaultSeed: string;
  /** URL path prefix between domain and slug (e.g., "articles" for /articles/<slug>). Empty string for root-level pages. */
  urlPathPrefix: string;
  buildSlug(brief: ArticleBrief): string;
  buildPath(slug: string): string;
  /**
   * Produce the file change(s) for this article. Async to allow reading existing files.
   * Returns one or more files that should be written to disk + committed.
   * For "create new file" sites (MCA Guide), returns a single file with the new content.
   * For "modify existing file" sites (BDI), reads the existing file from repoPath, splices,
   * returns the same path with the modified content.
   */
  renderFile(input: RenderInput, repoPath: string): Promise<RenderedFile[]>;
}
