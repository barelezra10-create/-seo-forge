# SEO Forge - Design Spec

**Date:** 2026-04-30
**Owner:** Bar Elezra
**Status:** Approved (sections 1-3)
**Repo:** `barelezra10-create/-seo-forge` (local folder: `~/seo-forge`)

## 1. Goal

Build a centralized SEO + GEO automation platform that:

- Generates topical, high-quality articles for a cluster of owned sites
- Inserts contextually relevant internal links across sister sites
- Syndicates content to Medium, LinkedIn, and Quora
- Pitches HARO/Qwoted journalist requests as expert quotes
- Optimizes every article for both classic SEO and Generative Engine Optimization (citations in ChatGPT, Perplexity, Google AI Overviews)
- Runs autonomously with a kill switch and observable dashboard

## 2. Scope

### v1 sites (the finance cluster)

| Site | Repo / Stack | Deploy |
|------|--------------|--------|
| MCA Guide | Next.js | (TBD - confirm in phase 1) |
| Business Debt Insider (BDI) | Next.js static export | Cloudflare Pages |
| MCA Settlement Reviews | Next.js, 39 static pages | Railway (`bestmca-` service) |
| Fintiex | Next.js | Railway |
| The Credit Card Pick | Next.js 16 | Cloudflare Pages |
| PennyLime | Next.js 16 | Cloudflare Pages |

These six are topically coherent (finance / debt / credit / lending), so cross-linking is genuine and not PBN-flavored.

### Volume

- **Steady state:** 1 article per site per day = 6 articles/day across the cluster.
- Comfortably under Claude Max subscription rate limits.

### Out of scope for v1

- Reddit posting (deferred to v2; account warming runs as a slow background loop starting week 1)
- Niche forum posting (deferred)
- Guest post outreach (deferred)
- Sites outside the finance cluster (Coastal CMS, Mirai, Poker Hub, Newborn, HR, B2B Hub)

## 3. Architecture

### Tech stack

- **Next.js 16** (`web/` workspace) - dashboard + API
- **Node worker** (`worker/` workspace) - long-running process running `claude-code` CLI sessions
- **Postgres** with **pgvector** - jobs queue, content index, embeddings, off-site post log, auth status
- **Railway** - both services + Postgres
- **Monorepo** at `~/seo-forge` (local), `barelezra10-create/-seo-forge` (remote)

### Service topology

```
                     ┌─────────────────────┐
                     │  Railway: web       │
                     │  Next.js dashboard  │
                     │  + API routes       │
                     └──────────┬──────────┘
                                │
                                │ reads/writes
                                ▼
                     ┌─────────────────────┐
                     │  Postgres (Railway) │
                     │  jobs queue         │
                     │  content_index      │
                     │  off_site_posts     │
                     │  auth_status        │
                     └──────────▲──────────┘
                                │
                                │ pulls jobs
                                │
                     ┌──────────┴──────────┐
                     │  Railway: worker    │
                     │  Node process       │
                     │  spawns claude-code │
                     │  + Playwright       │
                     │  Volume mounts:     │
                     │   /root/.claude     │
                     │   /workspace/repos  │
                     └─────────────────────┘
```

**Why two services:** the dashboard must stay responsive. A 10-15 min Claude Code session inside a Next.js API route would block requests and risk Railway's request-timeout. Worker is a separate dyno that pulls jobs at its own pace and reports back via Postgres.

**Alternative considered:** monolith. Rejected because long jobs would interfere with health checks and dashboard responsiveness.

## 4. Authentication strategy

### Claude Code subscription auth on a server (the fragile part)

- **Bootstrap:** Bar logs into `claude` CLI on Mac. `~/.claude/` token files exist locally.
- **Sync:** `scripts/sync-claude-auth.sh` rsyncs `~/.claude/` into a Railway Volume mounted at `/root/.claude` on the worker.
- **Token refresh:** worker runs a 30-min cron that issues a lightweight session to keep tokens warm. Result logged to `auth_status` table.
- **Failure detection:** dashboard polls `auth_status`; if stale > 2h, shows a red banner: "Re-auth required."
- **Recovery:** Bar runs `sync-claude-auth.sh` locally → tokens re-uploaded → banner clears.

### API fallback

- Anthropic API key (Bar's existing key from memory) loaded as Railway env var `ANTHROPIC_API_KEY`.
- Worker retries failed jobs 3x on subscription mode. After 3 failures it switches that single job to API mode and proceeds.
- Each `jobs` row stores `mode` (`subscription` | `api`) for cost tracking.
- **Cost cap:** `MAX_MONTHLY_API_USD` env var. When MTD API spend hits the cap, worker only runs subscription jobs; API-required jobs queue but pause until the next month or cap raise.

### Per-site GitHub PATs

- One PAT per site, scoped to that single repo, stored as `GH_PAT_<site_slug>` env vars.
- Blast radius of a leaked PAT = one repo.

## 5. Components

### Dashboard (`web/`)

Four primary views:

1. **Jobs** - live + recent jobs. Status, duration, mode (subscription/api), errors, links to full transcripts.
2. **Sites** - one row per site: last published, articles MTD, kill switch toggle, GSC clicks 7d, GitHub last commit URL.
3. **Articles** - every article ever published. Filter by site, search by topic. Click → full Claude Code transcript that wrote it (debugging tool).
4. **Off-site** - Medium/Quora/LinkedIn/HARO log + indexed status (weekly check).

Auth: simple email allowlist (Bar only) with magic link or hardcoded password env var (TBD in plan).

### Worker (`worker/`)

Pulls jobs from `jobs` table (Postgres `FOR UPDATE SKIP LOCKED`) and dispatches by `job_type`:

- `keyword_research` - Ahrefs + GSC → topic decision
- `write_article` - Claude Code session that produces MDX
- `publish_article` - git clone, write file, commit, push
- `index_update` - embed + insert into `content_index`
- `medium_post` / `linkedin_post` / `quora_post` - off-site syndication
- `haro_pitch_draft` - drafts pitch from a HARO email
- `auth_refresh` - keeps subscription tokens warm
- `gsc_sync` / `ahrefs_sync` - periodic data pulls
- `llms_txt_rebuild` - weekly per-site

Each job has a Postgres-side `claimed_at`, `started_at`, `finished_at`, `error`, `mode`, `cost_usd`.

### Site adapters (`worker/src/sites/<site>/`)

Each adapter implements:

```ts
interface SiteAdapter {
  siteId: string;
  repoUrl: string;
  contentDir: string;            // e.g. "content/articles"
  fileFormat: "mdx" | "md";
  brandVoice: string;            // prompt fragment
  buildSlug(brief: ArticleBrief): string;
  buildFrontmatter(brief: ArticleBrief, geo: GeoLayer): string;
  buildPath(slug: string): string;
  preflightCheck?(): Promise<void>;  // optional per-site validation
}
```

Six adapters in v1, one per site. Common behavior (clone, commit, push) lives in shared `git-publisher.ts`.

## 6. Data flow - one article end-to-end

The **orchestrator** is a small cron loop inside the `worker` service (not a separate dyno). On schedule it inserts jobs into Postgres; the same worker process then picks them up via the regular job loop. No separate scheduler service.

```
06:00 cron tick (inside worker)
  → orchestrator inserts {type: keyword_research, site: fintiex} job
  → orchestrator inserts blocked-by chain:
       write_article  (blocked by keyword_research)
       publish_article (blocked by write_article)
       index_update    (blocked by publish_article)
       medium_post     (blocked by publish_article, delay 2h)
       linkedin_post   (blocked by publish_article, delay 4h)
       quora_post      (blocked by publish_article, delay 8h)

worker picks up keyword_research:
  - Ahrefs API: low-KD keywords with traffic for fintiex.com
  - GSC API: queries fintiex ranks 8-25 for (striking distance)
  - Cross-ref content_index - skip if already covered
  - Pick one keyword, write brief
  - Update job result with brief

worker picks up write_article:
  - Embedding search over content_index for sister-site links (max 2)
  - Spawn claude-code session with:
      - brief
      - 0-2 sister link targets
      - site brand voice
      - GEO requirements template
  - Capture full transcript
  - Output: MDX file content

worker picks up publish_article:
  - git -C /workspace/repos/fintiex pull
  - Write MDX to content/articles/<slug>.mdx
  - git add, commit (msg: "feat(seo-forge): publish '<title>'"), push
  - Cloudflare/Railway auto-deploys

worker picks up index_update:
  - Generate embedding from H1 + first paragraph + brief
  - INSERT into content_index

worker picks up medium_post / linkedin_post / quora_post (staggered):
  - Rewrite article as platform-native version (claude-code session)
  - POST to API (Medium, LinkedIn) or Playwright (Quora)
  - Insert row in off_site_posts with URL
```

End-to-end: ~15-20 min per article on subscription mode. 6 articles/day = ~2 hours of worker time. ~70% headroom on rate limits.

## 7. Internal-link mechanics (content_index)

```sql
CREATE TABLE content_index (
  id BIGSERIAL PRIMARY KEY,
  site_id TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  h1 TEXT,
  first_paragraph TEXT,
  topic_embedding VECTOR(1536),
  published_at TIMESTAMPTZ,
  last_indexed TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX content_index_embedding_idx
  ON content_index USING ivfflat (topic_embedding vector_cosine_ops);
CREATE INDEX content_index_site_idx ON content_index(site_id);
```

**Backfill:** one-shot script per site at install time:
1. Fetch sitemap.xml
2. For each URL, fetch page, extract H1 + first paragraph
3. Embed and insert

**Lookup at write time:** for the new article's brief, embed it, query for top-K nearest where `site_id != current_site` AND `cosine_distance < 0.25`. Return up to 2.

**Quota:** even if 3+ matches exist, agent inserts max 2 sister links per article (preserves natural feel).

## 8. GEO layer

Injected by the article-writer prompt; no separate agent.

1. **Lede = direct factual answer** to the target query (1-2 sentences, quotable)
2. **"Quick facts" box** below lede: 4-6 bullets with explicit numbers, dates, sources
3. **Auto-generated JSON-LD:** `Article` + `FAQPage` schema derived from H2/H3 structure
4. **`llms.txt`** maintained per site at `/public/llms.txt`. Worker rebuilds + commits weekly via `llms_txt_rebuild` job.
5. **Attribution-friendly phrasing:** "according to the Federal Reserve...", "as of 2026..." - gives LLMs natural citation hooks
6. **Tables for comparison content** - structured data parses cleaner than prose for AI engines

## 9. Off-site publishing

| Tier | Platform | Mechanism | Phase |
|------|----------|-----------|-------|
| 1 | Medium | API: POST /v1/users/{userId}/posts | 3 |
| 1 | LinkedIn | UGC Posts API (article format) | 3 |
| 1 | Quora | Playwright (no API) | 3 |
| 2 | HARO / Qwoted | Gmail watcher → claude drafts → Bar approves/sends | 4 |
| 3 | Niche forums | Manual list + Playwright, slow cadence | v2 |
| 4 | Guest post outreach | Agent finds blogs, drafts pitch, queues for Bar | v2 |

Each off-site post is a **rewrite**, not copy-paste. References canonical article on owned site once with contextual link.

```sql
CREATE TABLE off_site_posts (
  id BIGSERIAL PRIMARY KEY,
  source_article_id BIGINT REFERENCES content_index(id),
  platform TEXT NOT NULL,
  external_url TEXT,
  posted_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  metadata JSONB
);
```

Worker pings each `external_url` weekly to update `indexed_at` / `removed_at`.

## 10. Risk handling & kill switches

- **Per-site kill switch:** boolean in `sites` table. Dashboard toggle. When false, no publish jobs are dispatched for that site (queued jobs marked skipped).
- **Global kill switch:** env var or DB flag halts worker job pickup entirely.
- **No force-push, no history rewrite:** site adapters only create new files. Cannot touch existing files in a destructive way without explicit `update_existing=true` (not used in v1).
- **Quarantine branch mode:** per-site `auto_publish=false` causes commits to go to `seo-forge/auto-content` branch instead of `main`. Becomes a PR queue.
- **Default:** `auto_publish=true` for all 6 sites in v1 (matches Bar's "fast execution" preference).
- **3-failure brake:** if a single site has 3 consecutive job failures, worker auto-trips its kill switch and Slack-pings Bar.

## 11. Observability

- **Slack pings** (via Bar's existing Slack auth): auth failure, 3+ consecutive job failures on one site, kill switch tripped, off-site post removed.
- **Per-job transcripts** stored in object storage or in DB (TBD in plan - likely Railway volume + signed URLs).
- **GSC integration:** dashboard pulls last-7d clicks per site using Bar's existing GSC OAuth refresh token.
- **Cost dashboard:** MTD subscription job count + MTD API spend + per-site breakdown.

## 12. Phasing

### Phase 1 - Foundation (week 1)

- Repo scaffold (`web/`, `worker/`, `infra/`, monorepo with shared types)
- Railway deploy: empty web + worker + Postgres provisioned
- Subscription auth bootstrapped, sync script working, refresh cron in place
- Dashboard shell: auth, layout, empty Jobs/Sites/Articles/Off-site views
- Postgres schema: jobs, sites, content_index, auth_status (off_site_posts deferred to phase 3)
- One-shot `content_index` backfill script run for all 6 sites
- Site adapter for **MCA Guide only**, end-to-end manual run: trigger one job → article published to MCA Guide repo → live on site

**Exit criteria:** 1 article visible on themcaguide.com, written and published end-to-end via SEO Forge.

### Phase 2 - Cluster live (week 2)

- Site adapters for the other 5 sites (BDI, MCA Settlement Reviews, Fintiex, Credit Card Pick, PennyLime)
- Auto cron, 1 article/site/day
- Internal-link lookups working (sister-site quota logic)
- GEO layer in (lede + quick-facts + JSON-LD + attribution prompts)
- Per-site kill switches functional in dashboard

**Exit criteria:** cluster auto-publishing 6 articles/day, no off-site yet, observability shows per-site health.

### Phase 3 - Off-site Tier 1 (week 3)

- Medium API publisher
- LinkedIn UGC publisher
- Quora Playwright publisher
- Off-site fanout from each article publish (staggered delays)
- `off_site_posts` table + weekly indexed-status checker
- llms.txt per site auto-rebuild + commit weekly

**Exit criteria:** every article auto-syndicates to Medium + LinkedIn + Quora.

### Phase 4 - HARO & polish (week 4)

- HARO email watcher (Gmail filter → ingest → claude drafts pitch → approval queue in dashboard)
- Slack pings wired up for all alert types
- GSC click integration in Sites view
- API fallback path tested end-to-end (force a subscription failure, verify API takes over)
- Cost dashboard with MAX_MONTHLY_API_USD enforcement

**Exit criteria:** v1 platform fully operational and observable. Bar can leave it running and check dashboard once a day.

### Deferred to v2

- Reddit posting (account warming runs as slow background loop starting week 1 of v1)
- Niche forum posting
- Guest post outreach automation
- Adding sites outside the finance cluster

## 13. Open questions for plan phase

These are decisions that don't change the architecture but need to be resolved when writing the implementation plan:

1. Dashboard auth: magic link vs. hardcoded password env var
2. Job transcript storage: Railway volume + signed URLs vs. inline in DB (cost vs. simplicity)
3. Embedding model: OpenAI text-embedding-3-small vs. Voyage vs. Cohere (cost + quality)
4. Rename remote repo to drop leading dash (`-seo-forge` → `seo-forge`)
5. Exact GitHub repo URLs for the 6 sites (need to confirm with Bar at phase 1 kickoff)
