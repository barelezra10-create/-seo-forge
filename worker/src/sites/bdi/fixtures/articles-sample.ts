// Fixture mirroring the shape of the real BDI articles.ts.
// Used only by the adapter test. Do not import this from production code.

export interface Article {
  slug: string;
  title: string;
  category: CategoryId;
  excerpt: string;
  readTime: number;
  date: string;
  author: string;
  featured?: boolean;
  image?: string;
  sections: ArticleSection[];
}

export interface ArticleSection {
  heading: string;
  content: string;
  callout?: { type: "info" | "warning"; text: string };
}

export type CategoryId =
  | "types-of-debt"
  | "tax-debt"
  | "bankruptcy"
  | "debt-settlement"
  | "cash-flow"
  | "know-your-rights"
  | "industry-guides";

const a = (
  slug: string,
  title: string,
  category: CategoryId,
  excerpt: string,
  readTime: number,
  date: string,
  sections: ArticleSection[],
  featured = false,
): Article => ({
  slug,
  title,
  category,
  excerpt,
  readTime,
  date,
  author: "Editorial Team",
  featured,
  sections,
});

export const articles: Article[] = [
  // TYPES OF DEBT
  a("existing-mca-article", "Existing MCA Article", "types-of-debt",
    "An existing excerpt sentence.",
    8, "2025-11-01", [
      { heading: "Existing Heading", content: "Existing content body." },
    ], true),

  a("another-existing", "Another Existing", "types-of-debt",
    "Second existing excerpt.",
    6, "2025-10-01", [
      { heading: "Another Heading", content: "Another content body." },
    ]),
];
