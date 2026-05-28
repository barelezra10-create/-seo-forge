/**
 * Post-publish verification — fetches a published article's live URL,
 * extracts metadata, builds a screenshot URL, and writes the result to
 * article_plans.published_live_preview.
 *
 * Site deploys can take 1-5 min after a git push (Cloudflare Pages, Railway,
 * Vercel). We poll the URL with backoff until 200 or timeout (10 min).
 */
export type LivePreview = {
  url: string;
  /** Public screenshot URL via Microlink — no API key needed. */
  screenshotUrl: string;
  liveTitle: string | null;
  liveLede: string | null;
  wordCount: number;
  linkCount: number;
  /** Of the sister URLs we tried to inline, how many actually appear in the rendered HTML? */
  sisterLinksFound: number;
  sisterLinksExpected: number;
  status: "live" | "timeout" | "error";
  verifiedAt: string; // ISO
  error?: string;
};

const MAX_POLL_ATTEMPTS = 20; // 20 * 30s = 10 min budget
const POLL_INTERVAL_MS = 30_000;

async function fetchWithTimeout(url: string, ms = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 SEOForge/1.0 verify-publish" },
    });
  } finally {
    clearTimeout(t);
  }
}

async function pollForLive(url: string, log: (l: string) => Promise<void>): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(url, 10_000);
      if (res.ok) {
        const html = await res.text();
        await log(`live after ${attempt} attempt(s)`);
        return html;
      }
      await log(`attempt ${attempt}/${MAX_POLL_ATTEMPTS}: HTTP ${res.status}`);
    } catch (e) {
      await log(`attempt ${attempt}/${MAX_POLL_ATTEMPTS}: ${(e as Error).message}`);
    }
    if (attempt < MAX_POLL_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  return null;
}

function extractTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return decode(og[1]);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return decode(h1[1].replace(/<[^>]+>/g, "").trim());
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (t?.[1]) return decode(t[1].trim());
  return null;
}

function extractLede(html: string): string | null {
  // First paragraph inside <main> or <article>, or first <p> overall.
  const m = html.match(/<(?:main|article)[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  if (m?.[1]) return decode(m[1].replace(/<[^>]+>/g, "").trim()).slice(0, 400);
  const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (p?.[1]) return decode(p[1].replace(/<[^>]+>/g, "").trim()).slice(0, 400);
  return null;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function countWords(html: string): number {
  // Strip tags + entities, count whitespace-separated tokens.
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countLinks(html: string): number {
  return (html.match(/<a\b[^>]*\bhref=/gi) ?? []).length;
}

function countSisterLinksFound(html: string, sisterUrls: string[]): number {
  let n = 0;
  for (const u of sisterUrls) {
    // Normalize: try with + without trailing slash.
    const a = u;
    const b = u.endsWith("/") ? u.slice(0, -1) : u + "/";
    if (html.includes(a) || html.includes(b)) n++;
  }
  return n;
}

function buildScreenshotUrl(url: string): string {
  // Microlink is free for low-volume public use, no auth required.
  const params = new URLSearchParams({
    url,
    screenshot: "true",
    meta: "false",
    "viewport.width": "1280",
    "viewport.height": "800",
    embed: "screenshot.url",
  });
  return `https://api.microlink.io/?${params.toString()}`;
}

export async function verifyPublishedArticle(opts: {
  url: string;
  sisterUrls: string[];
  log?: (line: string) => Promise<void>;
}): Promise<LivePreview> {
  const log = opts.log ?? (async () => {});
  await log(`verify-publish polling ${opts.url}`);
  const html = await pollForLive(opts.url, log);
  const verifiedAt = new Date().toISOString();
  if (!html) {
    return {
      url: opts.url,
      screenshotUrl: buildScreenshotUrl(opts.url),
      liveTitle: null,
      liveLede: null,
      wordCount: 0,
      linkCount: 0,
      sisterLinksFound: 0,
      sisterLinksExpected: opts.sisterUrls.length,
      status: "timeout",
      verifiedAt,
      error: `URL did not return 200 within ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 60_000} min`,
    };
  }
  try {
    return {
      url: opts.url,
      screenshotUrl: buildScreenshotUrl(opts.url),
      liveTitle: extractTitle(html),
      liveLede: extractLede(html),
      wordCount: countWords(html),
      linkCount: countLinks(html),
      sisterLinksFound: countSisterLinksFound(html, opts.sisterUrls),
      sisterLinksExpected: opts.sisterUrls.length,
      status: "live",
      verifiedAt,
    };
  } catch (e) {
    return {
      url: opts.url,
      screenshotUrl: buildScreenshotUrl(opts.url),
      liveTitle: null,
      liveLede: null,
      wordCount: 0,
      linkCount: 0,
      sisterLinksFound: 0,
      sisterLinksExpected: opts.sisterUrls.length,
      status: "error",
      verifiedAt,
      error: (e as Error).message,
    };
  }
}
