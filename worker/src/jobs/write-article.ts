import { runClaudeOneShot } from "../claude/session.js";
import { buildPrompt, type SisterLink, type KeywordBrief } from "./write-article.prompt.js";

export type ArticleResponse = {
  ledeAnswer: string;
  quickFacts: string[];
  body: string;
};

export function parseArticleResponse(raw: string): ArticleResponse {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  let j: unknown;
  try {
    j = JSON.parse(s);
  } catch (e) {
    throw new Error(`Failed to parse JSON from claude response: ${(e as Error).message}\nRaw: ${s.slice(0, 500)}`);
  }
  if (
    typeof j !== "object" ||
    j === null ||
    typeof (j as ArticleResponse).ledeAnswer !== "string" ||
    !Array.isArray((j as ArticleResponse).quickFacts) ||
    typeof (j as ArticleResponse).body !== "string"
  ) {
    throw new Error(`Invalid article response shape: ${JSON.stringify(j).slice(0, 500)}`);
  }
  const r = j as ArticleResponse;
  const combined = `${r.ledeAnswer}\n${r.quickFacts.join("\n")}\n${r.body}`;
  // U+2014 is the em dash. Reject any presence in Claude's output.
  if (combined.includes(String.fromCharCode(0x2014))) {
    throw new Error(`Article response contains em dash characters; rewrite required.`);
  }
  return r;
}

export type WriteArticleInput = {
  brief: KeywordBrief;
  sisterLinks: SisterLink[];
  brandVoice: string;
  siteName: string;
  domain: string;
  timeoutMs?: number;
};

export async function runWriteArticle(i: WriteArticleInput): Promise<ArticleResponse> {
  const prompt = buildPrompt({
    brief: i.brief,
    sisterLinks: i.sisterLinks,
    brandVoice: i.brandVoice,
    siteName: i.siteName,
    domain: i.domain,
  });
  const result = await runClaudeOneShot({
    prompt,
    timeoutMs: i.timeoutMs ?? 15 * 60 * 1000,
  });
  if (result.exitCode !== 0) {
    throw new Error(`claude exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`);
  }
  return parseArticleResponse(result.text);
}
