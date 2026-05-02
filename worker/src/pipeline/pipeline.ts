import { createDb, parseEnv, tables } from "@seo-forge/shared";
import { eq } from "drizzle-orm";
import { mcaGuideAdapter } from "../sites/mca-guide/adapter.js";
import { GitPublisher } from "../publishers/git-publisher.js";
import { ContentIndexRepo } from "../content-index/repo.js";
import { embedText } from "../embeddings/voyage.js";
import { gatherCandidates, selectKeyword, buildBrief } from "../jobs/keyword-research.js";
import { runWriteArticle } from "../jobs/write-article.js";
import type { SiteAdapter } from "../sites/adapter.js";
import { appendJobLog } from "../orchestrator/publish-cron.js";

const ADAPTERS: Record<string, SiteAdapter> = {
  "mca-guide": mcaGuideAdapter,
};

export type PipelineResult = {
  siteId: string;
  slug: string;
  url: string;
  commitSha: string;
  targetKeyword: string;
};

function buildAuthenticatedRepoUrl(sshUrl: string, pat: string | undefined): string {
  if (!pat) return sshUrl;
  // Match git@github.com:owner/repo.git OR git@github.com-alias:owner/repo.git
  const m = sshUrl.match(/^git@github\.com[^:]*:(.+?)\.git$/);
  if (!m) return sshUrl;
  return `https://x-access-token:${pat}@github.com/${m[1]}.git`;
}

export async function runPipeline(opts: { siteId: string; jobId?: number }): Promise<PipelineResult> {
  const env = parseEnv(process.env);
  const adapter = ADAPTERS[opts.siteId];
  if (!adapter) throw new Error(`No adapter for site ${opts.siteId}`);

  const { db, close } = createDb(env.DATABASE_URL);
  try {
    const [site] = await db.select().from(tables.sites).where(eq(tables.sites.id, opts.siteId));
    if (!site) throw new Error(`Site ${opts.siteId} not found`);
    if (site.killSwitch) throw new Error(`Site ${opts.siteId} has kill switch on`);

    // 1. Covered slugs (skip already-written topics)
    const indexRows = await db
      .select({ slug: tables.contentIndex.slug })
      .from(tables.contentIndex)
      .where(eq(tables.contentIndex.siteId, opts.siteId));
    const coveredSlugs = new Set(indexRows.map((r) => r.slug));

    // 2. Keyword research
    const candidates = await gatherCandidates({
      siteId: site.id,
      domain: site.domain,
      seed: adapter.defaultSeed,
      coveredSlugs,
      ahrefsKey: env.AHREFS_API_KEY,
      gscRefreshToken: env.GSC_REFRESH_TOKEN,
      gscClientId: env.GSC_CLIENT_ID,
      gscClientSecret: env.GSC_CLIENT_SECRET,
    });
    const picked = selectKeyword({ candidates, coveredSlugs });
    if (!picked) throw new Error("No eligible keyword candidates");
    const brief = buildBrief(picked, "founders running cash-flow businesses");
    console.log(
      `[pipeline] picked keyword: "${brief.targetKeyword}" (${brief.source}, vol=${brief.volume}, kd=${brief.kd})`,
    );
    if (opts.jobId)
      await appendJobLog(
        opts.jobId,
        `picked keyword: "${brief.targetKeyword}" (${brief.source}, vol=${brief.volume}, kd=${brief.kd})`,
      );

    // 3. Sister-site internal links
    const briefEmbed = await embedText(
      `${brief.targetKeyword}\n${brief.outline.join("\n")}`,
      env.VOYAGE_API_KEY,
    );
    const repo = new ContentIndexRepo(db);
    const sisterHits = await repo.findSimilarOnOtherSites({
      embedding: briefEmbed,
      excludeSiteId: opts.siteId,
      limit: 2,
      maxDistance: 0.45,
    });
    console.log(
      `[pipeline] sister links: ${sisterHits.length}${sisterHits.length > 0 ? " (" + sisterHits.map((h) => h.url).join(", ") + ")" : ""}`,
    );
    if (opts.jobId) await appendJobLog(opts.jobId, `sister links: ${sisterHits.length}`);

    // 4. Write article via claude-code
    console.log(`[pipeline] running claude-code session (this can take 5-15 min)...`);
    if (opts.jobId) await appendJobLog(opts.jobId, `running claude-code session (5-15 min)...`);
    const article = await runWriteArticle({
      brief,
      sisterLinks: sisterHits.map((h) => ({ url: h.url, title: h.title })),
      brandVoice: site.brandVoice,
      siteName: site.name,
      domain: site.domain,
    });
    console.log(`[pipeline] article written (${article.body.length} chars body)`);
    if (opts.jobId)
      await appendJobLog(opts.jobId, `article written (${article.body.length} chars body)`);

    // 5. Render with adapter
    const rendered = adapter.renderFile({
      brief,
      geo: { ledeAnswer: article.ledeAnswer, quickFacts: article.quickFacts },
      body: article.body,
      sisterLinks: sisterHits.map((h) => ({ url: h.url, title: h.title })),
    });

    // 6. Publish via git (HTTPS + PAT)
    const patEnvKey = `GH_PAT_${opts.siteId.replace(/-/g, "_").toUpperCase()}`;
    const pat = process.env[patEnvKey];
    const repoUrl = buildAuthenticatedRepoUrl(site.repoUrl, pat);
    const publisher = new GitPublisher({ workspaceDir: env.WORKSPACE_REPOS_DIR });
    const publishResult = await publisher.publish({
      siteId: site.id,
      repoUrl,
      branch: site.branch,
      relativeFilePath: rendered.path,
      fileContent: rendered.content,
      commitMessage: `feat(seo-forge): publish "${brief.targetKeyword}"`,
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    console.log(
      `[pipeline] published ${rendered.path} as commit ${publishResult.commitSha}`,
    );
    if (opts.jobId)
      await appendJobLog(
        opts.jobId,
        `published ${rendered.path} as commit ${publishResult.commitSha}`,
      );

    // 7. Update content_index for the new article
    const urlPath = adapter.urlPathPrefix
      ? `${adapter.urlPathPrefix}/${rendered.slug}`
      : rendered.slug;
    const articleUrl = `https://${site.domain}/${urlPath}`;
    const newEmbed = await embedText(
      `${brief.targetKeyword}\n${article.ledeAnswer}\n${article.body.slice(0, 800)}`,
      env.VOYAGE_API_KEY,
    );
    await repo.upsert({
      siteId: site.id,
      url: articleUrl,
      slug: rendered.slug,
      title: brief.targetKeyword,
      h1: brief.targetKeyword,
      firstParagraph: article.ledeAnswer,
      topicEmbedding: newEmbed,
      publishedAt: new Date(),
      claudeTranscript: {
        prompt: article.prompt,
        rawResponse: article.rawResponse,
        durationMs: article.durationMs,
        keyword: brief.targetKeyword,
        sisterLinks: sisterHits.map((h) => h.url),
      },
    });

    return {
      siteId: site.id,
      slug: rendered.slug,
      url: articleUrl,
      commitSha: publishResult.commitSha,
      targetKeyword: brief.targetKeyword,
    };
  } finally {
    await close();
  }
}
