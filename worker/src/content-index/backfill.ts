import { createDb } from "@seo-forge/shared";
import { fetchAndParseSitemap } from "./sitemap.js";
import { ContentIndexRepo } from "./repo.js";
import { embedText } from "../embeddings/voyage.js";

async function fetchPageMeta(
  url: string,
): Promise<{ title: string; h1: string; firstParagraph: string }> {
  const res = await fetch(url, { headers: { "User-Agent": "seo-forge/0.0.1" } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  const html = await res.text();
  const title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "").trim();
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "")
    .replace(/<[^>]+>/g, "")
    .trim();
  const firstParagraph = (html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "")
    .replace(/<[^>]+>/g, "")
    .trim()
    .slice(0, 500);
  return { title, h1, firstParagraph };
}

async function embedBatchWithRetry(
  inputs: string[],
  apiKey: string,
  maxRetries = 6,
): Promise<number[][]> {
  let attempt = 0;
  while (true) {
    try {
      return await embedText(inputs, apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429");
      attempt++;
      if (attempt > maxRetries || !is429) throw err;
      // Voyage free tier: 3 RPM. Wait 25s then exponential backoff.
      const waitMs = 25_000 * attempt;
      console.log(`[embed] 429 rate-limited, waiting ${waitMs / 1000}s (attempt ${attempt}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

export async function backfillSite(opts: {
  siteId: string;
  domain: string;
  sitemapUrl?: string;
  voyageKey: string;
  databaseUrl: string;
  batchSize?: number;
  fetchConcurrency?: number;
}): Promise<{ inserted: number; skipped: number; errors: number }> {
  const sitemapUrl = opts.sitemapUrl ?? `https://${opts.domain}/sitemap.xml`;
  const batchSize = opts.batchSize ?? 32;
  const fetchConcurrency = opts.fetchConcurrency ?? 8;
  const { db, close } = createDb(opts.databaseUrl);
  const repo = new ContentIndexRepo(db);

  const entries = await fetchAndParseSitemap(sitemapUrl);
  console.log(`[backfill ${opts.siteId}] sitemap: ${entries.length} URLs`);

  // Phase 1: fetch all page metas concurrently.
  type Item = {
    loc: string;
    lastmod: string | null;
    title: string;
    h1: string;
    firstParagraph: string;
  };
  const items: Item[] = [];
  let skipped = 0;
  let errors = 0;

  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= entries.length) return;
      const e = entries[i]!;
      try {
        const meta = await fetchPageMeta(e.loc);
        if (!meta.title) {
          skipped++;
          continue;
        }
        items.push({ loc: e.loc, lastmod: e.lastmod, ...meta });
        if (items.length % 25 === 0) {
          console.log(`[backfill ${opts.siteId}] fetched ${items.length}/${entries.length} metas`);
        }
      } catch (err) {
        console.error(`[backfill ${opts.siteId}] fetch error for ${e.loc}:`, err);
        errors++;
      }
    }
  }
  await Promise.all(Array.from({ length: fetchConcurrency }, () => worker()));
  console.log(`[backfill ${opts.siteId}] meta fetch complete: ${items.length} items, ${skipped} skipped, ${errors} errors`);

  // Phase 2: batch embed + upsert.
  // Voyage free tier: 3 RPM. Pace at 22s between batches to stay under limit.
  const interBatchDelayMs = 22_000;
  let inserted = 0;
  let lastEmbedAt = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const inputs = batch.map((it) =>
      `${it.title}\n\n${it.h1}\n\n${it.firstParagraph}`.slice(0, 4000),
    );
    const sinceLast = Date.now() - lastEmbedAt;
    if (lastEmbedAt > 0 && sinceLast < interBatchDelayMs) {
      const wait = interBatchDelayMs - sinceLast;
      console.log(`[backfill ${opts.siteId}] pacing: sleeping ${Math.round(wait / 1000)}s before next batch`);
      await new Promise((r) => setTimeout(r, wait));
    }
    let embeddings: number[][];
    try {
      embeddings = await embedBatchWithRetry(inputs, opts.voyageKey);
      lastEmbedAt = Date.now();
    } catch (err) {
      console.error(`[backfill ${opts.siteId}] embed error for batch starting at ${i}:`, err);
      errors += batch.length;
      continue;
    }
    for (let j = 0; j < batch.length; j++) {
      const it = batch[j]!;
      const embedding = embeddings[j]!;
      try {
        const slug = new URL(it.loc).pathname.split("/").filter(Boolean).pop() ?? "";
        await repo.upsert({
          siteId: opts.siteId,
          url: it.loc,
          slug,
          title: it.title,
          h1: it.h1,
          firstParagraph: it.firstParagraph,
          topicEmbedding: embedding,
          publishedAt: it.lastmod ? new Date(it.lastmod) : new Date(),
        });
        inserted++;
      } catch (err) {
        console.error(`[backfill ${opts.siteId}] upsert error for ${it.loc}:`, err);
        errors++;
      }
    }
    console.log(
      `[backfill ${opts.siteId}] embedded+upserted ${inserted}/${items.length}`,
    );
  }

  await close();
  return { inserted, skipped, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const databaseUrl = process.env.DATABASE_URL;
  const voyageKey = process.env.VOYAGE_API_KEY;
  if (!databaseUrl || !voyageKey) {
    console.error("DATABASE_URL and VOYAGE_API_KEY are required");
    process.exit(1);
  }
  const siteId = process.argv[2];
  const domain = process.argv[3];
  const sitemapUrl = process.argv[4];
  if (!siteId || !domain) {
    console.error("Usage: tsx backfill.ts <siteId> <domain> [sitemapUrl]");
    process.exit(1);
  }
  const result = await backfillSite({
    siteId,
    domain,
    sitemapUrl,
    voyageKey,
    databaseUrl,
  });
  console.log(`Done:`, result);
}
