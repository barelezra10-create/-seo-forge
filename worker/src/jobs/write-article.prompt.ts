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
      : "(none. do not invent any external links)";

  return `You are writing a single article for ${opts.siteName} (${opts.domain}).

Target keyword: ${opts.brief.targetKeyword}
Search intent: ${opts.brief.intent}
Audience: ${opts.brief.audience}
Brand voice: ${opts.brandVoice}

Outline (use as a guide, not a script):
${opts.brief.outline.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Internal links to include if topically relevant (max ${opts.sisterLinks.length}):
${sisterLinksBlock}

Output a single JSON object. No prose before or after. Use these exact keys:

{
  "ledeAnswer": "1-2 sentence direct answer to the target keyword query, factual, quotable",
  "quickFacts": ["4-6 short factual bullets, each with a number, date, or named source"],
  "body": "Full article body in markdown. Use H2 (##) for sections. 1200-2000 words. Insert the internal links inline where topically relevant. Do not force them. Do not include a top-level H1. Do not include a frontmatter block. Do not use em dashes. Use periods or commas instead."
}

Rules:
- No em dashes anywhere. None.
- Cite sources by name when stating a stat (e.g., "according to the SBA...").
- Use real, plausible numbers. If you do not know an exact number, give a defensible range and label it as such.
- The internal links above are real URLs. Use them inline as markdown links if the topic fits naturally.

Respond with ONLY the JSON object. No preamble, no explanation, no markdown code fence.`;
}
