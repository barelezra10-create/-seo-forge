export type KeywordBrief = {
  targetKeyword: string;
  intent: string;
  outline: string[];
  audience: string;
  source: "ahrefs" | "gsc";
  volume: number;
  kd: number;
};

export type SisterLink = { url: string; title: string };

export function buildPrompt(opts: {
  brief: KeywordBrief;
  sisterLinks: SisterLink[];
  brandVoice: string;
  siteName: string;
  domain: string;
}): string {
  const sisterLinksBlock =
    opts.sisterLinks.length > 0
      ? opts.sisterLinks
          .map((l, i) => `${i + 1}. ${l.title} - ${l.url}`)
          .join("\n")
      : "(none. do not invent any external links. do not link to any other websites.)";

  return `You are writing a single article for ${opts.siteName} (${opts.domain}).

Target keyword: ${opts.brief.targetKeyword}
Search intent: ${opts.brief.intent}
Audience: ${opts.brief.audience}
Brand voice: ${opts.brandVoice}

Outline (use as a guide, not a script):
${opts.brief.outline.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Internal links provided (use AT MOST these exact URLs, in their entirety; never more than ${opts.sisterLinks.length} total):
${sisterLinksBlock}

Output a single JSON object. No prose before or after. Use these exact keys:

{
  "ledeAnswer": "1-2 sentence direct answer to the target keyword query, factual, quotable",
  "quickFacts": ["4-6 short factual bullets, each with a number, date, or named source"],
  "body": "Full article body in markdown. Use H2 (##) for sections. 1200-2000 words. Do not include a top-level H1. Do not include a frontmatter block."
}

VOICE RULES (apply to lede, quickFacts, body):
- Sound like a knowledgeable founder writing to another founder over coffee. Direct, specific, no fluff, no encyclopedic phrasing.
- Open each H2 with a concrete scenario or specific number, not a definition. "A $50,000 MCA at a 1.4 factor rate..." beats "A merchant cash advance is a financial product..."
- Use second person ("you") to address the reader. Use first person ("we") sparingly when sharing a take.
- Prefer concrete examples (dollar amounts, dates, named lenders, named regulations) over general claims.
- Vary sentence length. Mix short punches with longer explanatory sentences. Avoid the rhythm of textbook prose.

LINK RULES (strict):
- Insert AT MOST ${opts.sisterLinks.length} markdown links to the URLs above, and ONLY to those URLs. Do not invent or add any other external URLs.
- Each provided link should appear AT MOST ONCE in the article. Do not repeat the same URL twice.
- Place each link in a natural sentence where the linked article genuinely adds context. If no spot fits, omit the link entirely (better no link than a forced one).
- Never link the same domain more than once in this article.

FORMAT RULES:
- No em dashes anywhere. None. Use periods or commas.
- Cite sources by name when stating a stat (e.g., "according to the SBA...").
- Use real, plausible numbers. If you do not know an exact number, give a defensible range and label it as such.

Respond with ONLY the JSON object. No preamble, no explanation, no markdown code fence.`;
}
