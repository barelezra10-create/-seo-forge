# SEO Forge Phase 1A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a fresh terminal, run `pnpm cli publish --site mca-guide` and a fully formed, GEO-optimized article appears live on themcaguide.com.

**Architecture:** TypeScript pnpm monorepo. `shared/` defines types, env validation, and the Drizzle DB schema. `worker/` contains all job logic, the Claude Code subprocess wrapper, site adapters, the git publisher, and a CLI entry point. No web/dashboard yet (Plan 1B). No Railway deploy yet (Plan 1B). Local Postgres via docker-compose.

**Tech Stack:** TypeScript 5.6, pnpm workspaces, Vitest, Drizzle ORM, Postgres 16 + pgvector, simple-git, Anthropic API for Claude (subscription auth via `claude-code` CLI subprocess), Voyage AI for embeddings, Ahrefs API v3, Google Search Console API.

**Prerequisites Bar provides before execution:**
1. GitHub repo URL for `themcaguide.com` and a PAT scoped to it (`GH_PAT_MCA_GUIDE`)
2. The MCA Guide repo's content directory path and file extension (`mdx` likely)
3. Voyage AI API key (free tier: voyageai.com)
4. Confirmation that `claude-code` CLI is installed locally and authenticated (`claude --version` works)
5. Existing keys from memory: Ahrefs, GSC OAuth refresh token, Anthropic API (fallback)

---

## File Structure

```
seo-forge/
├── package.json                          # workspaces root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml                    # local postgres
├── .env.example
├── .gitignore
├── shared/
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── src/
│       ├── index.ts                      # re-exports
│       ├── env.ts                        # zod-validated env
│       ├── types.ts                      # Job, Site, Article, etc.
│       └── db/
│           ├── client.ts                 # drizzle client factory
│           ├── schema.ts                 # tables (sites, jobs, content_index, auth_status)
│           └── migrations/               # drizzle generated
└── worker/
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    └── src/
        ├── cli.ts                        # CLI entry: publish command
        ├── jobs/
        │   ├── keyword-research.ts
        │   ├── write-article.ts
        │   ├── publish-article.ts
        │   └── index-update.ts
        ├── claude/
        │   ├── session.ts                # spawns claude-code subprocess
        │   └── session.test.ts
        ├── embeddings/
        │   ├── voyage.ts
        │   └── voyage.test.ts
        ├── content-index/
        │   ├── repo.ts                   # insert + similarity search
        │   ├── repo.test.ts
        │   ├── sitemap.ts                # fetch + parse sitemap.xml
        │   ├── sitemap.test.ts
        │   └── backfill.ts               # one-shot script per site
        ├── data/
        │   ├── ahrefs.ts
        │   ├── ahrefs.test.ts
        │   ├── gsc.ts
        │   └── gsc.test.ts
        ├── publishers/
        │   ├── git-publisher.ts
        │   └── git-publisher.test.ts
        ├── sites/
        │   ├── adapter.ts                # SiteAdapter interface
        │   └── mca-guide/
        │       ├── adapter.ts
        │       └── adapter.test.ts
        └── pipeline/
            ├── pipeline.ts               # orchestrates the 4 jobs end-to-end
            └── pipeline.test.ts
```

**Decomposition rationale:**
- `shared/` is small and stable — the schema and types every other package depends on. Lives in its own workspace so `worker` (and later `web`) import the same types.
- `worker/src/jobs/` holds one file per job type. Each job is a pure function `(input, deps) => output`. Testable without spawning subprocesses.
- `worker/src/claude/session.ts` is the only place that knows how to talk to the `claude-code` CLI subprocess. Mocked everywhere else.
- `worker/src/sites/adapter.ts` defines the `SiteAdapter` interface; `worker/src/sites/mca-guide/adapter.ts` is the only implementation in 1A.
- `worker/src/pipeline/pipeline.ts` wires the four jobs together. The CLI entry calls this.

---

## Task 1: Initialize pnpm monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`

- [ ] **Step 1: Create `package.json` at repo root**

```json
{
  "name": "seo-forge",
  "private": true,
  "version": "0.0.1",
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "cli": "pnpm --filter worker cli"
  },
  "engines": {
    "node": ">=20.10.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "shared"
  - "worker"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
/workspace/repos/
.claude-cache/
coverage/
```

- [ ] **Step 5: Create `.env.example`**

```
# Postgres (local docker-compose)
DATABASE_URL=postgres://seo_forge:seo_forge@localhost:5433/seo_forge

# API keys
VOYAGE_API_KEY=
AHREFS_API_KEY=
GSC_REFRESH_TOKEN=
ANTHROPIC_API_KEY=

# GitHub PATs (one per site, scoped to that single repo)
GH_PAT_MCA_GUIDE=

# Claude Code CLI auth (set if running headless; for 1A we use local user auth)
CLAUDE_HOME=

# Worker config
WORKSPACE_REPOS_DIR=./workspace/repos
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example
git commit -m "chore: initialize pnpm monorepo with workspaces"
```

---

## Task 2: Set up local Postgres + pgvector

**Files:**
- Create: `docker-compose.yml`, `scripts/db-up.sh`, `scripts/db-down.sh`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: seo-forge-pg
    environment:
      POSTGRES_USER: seo_forge
      POSTGRES_PASSWORD: seo_forge
      POSTGRES_DB: seo_forge
    ports:
      - "5433:5432"
    volumes:
      - seo_forge_pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U seo_forge"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  seo_forge_pg:
```

- [ ] **Step 2: Create `scripts/db-up.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose up -d postgres
docker compose exec postgres bash -c "until pg_isready -U seo_forge; do sleep 1; done"
docker compose exec postgres psql -U seo_forge -d seo_forge -c "CREATE EXTENSION IF NOT EXISTS vector;"
echo "Postgres ready on localhost:5433"
```

- [ ] **Step 3: Create `scripts/db-down.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose down
```

- [ ] **Step 4: Make scripts executable and start the DB**

```bash
chmod +x scripts/db-up.sh scripts/db-down.sh
./scripts/db-up.sh
```

Expected output: `Postgres ready on localhost:5433`

- [ ] **Step 5: Verify pgvector is installed**

```bash
docker compose exec postgres psql -U seo_forge -d seo_forge -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
```

Expected: `vector` row returned.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml scripts/
git commit -m "chore: add local postgres with pgvector via docker-compose"
```

---

## Task 3: Build `shared/` package — env validation

**Files:**
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/env.ts`, `shared/src/index.ts`
- Test: `shared/src/env.test.ts`

- [ ] **Step 1: Create `shared/package.json`**

```json
{
  "name": "@seo-forge/shared",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "drizzle-orm": "0.36.0",
    "postgres": "3.4.5",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "drizzle-kit": "0.28.0",
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 2: Create `shared/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Install deps**

```bash
pnpm install
```

- [ ] **Step 4: Write the failing test for env validation**

Create `shared/src/env.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("parses a complete env object", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@localhost:5433/db",
      VOYAGE_API_KEY: "k1",
      AHREFS_API_KEY: "k2",
      GSC_REFRESH_TOKEN: "k3",
      ANTHROPIC_API_KEY: "k4",
      GH_PAT_MCA_GUIDE: "k5",
      WORKSPACE_REPOS_DIR: "./workspace/repos",
    });
    expect(env.DATABASE_URL).toBe("postgres://u:p@localhost:5433/db");
    expect(env.VOYAGE_API_KEY).toBe("k1");
  });

  it("throws on missing required field", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("defaults WORKSPACE_REPOS_DIR if absent", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@localhost:5433/db",
      VOYAGE_API_KEY: "k1",
      AHREFS_API_KEY: "k2",
      GSC_REFRESH_TOKEN: "k3",
      ANTHROPIC_API_KEY: "k4",
      GH_PAT_MCA_GUIDE: "k5",
    });
    expect(env.WORKSPACE_REPOS_DIR).toBe("./workspace/repos");
  });
});
```

- [ ] **Step 5: Run test, expect failure**

```bash
pnpm --filter @seo-forge/shared test
```

Expected: FAIL — `parseEnv` not found.

- [ ] **Step 6: Implement `shared/src/env.ts`**

```typescript
import { z } from "zod";

export const EnvSchema = z.object({
  DATABASE_URL: z.string().url().refine((s) => s.startsWith("postgres://") || s.startsWith("postgresql://")),
  VOYAGE_API_KEY: z.string().min(1),
  AHREFS_API_KEY: z.string().min(1),
  GSC_REFRESH_TOKEN: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  GH_PAT_MCA_GUIDE: z.string().min(1),
  WORKSPACE_REPOS_DIR: z.string().min(1).default("./workspace/repos"),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return EnvSchema.parse(raw);
}
```

- [ ] **Step 7: Create `shared/src/index.ts` re-exports**

```typescript
export { parseEnv, EnvSchema, type Env } from "./env";
```

- [ ] **Step 8: Run tests, expect pass**

```bash
pnpm --filter @seo-forge/shared test
```

Expected: 3 passing.

- [ ] **Step 9: Commit**

```bash
git add shared/ pnpm-lock.yaml
git commit -m "feat(shared): add zod-validated env schema"
```

---

## Task 4: Build `shared/` Drizzle schema

**Files:**
- Create: `shared/drizzle.config.ts`, `shared/src/db/schema.ts`, `shared/src/db/client.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/db/schema.test.ts`

- [ ] **Step 1: Update `shared/package.json` scripts**

Add:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx src/db/migrate.ts",
"db:push": "drizzle-kit push"
```

Add devDependency: `"tsx": "4.19.2"`. Run `pnpm install`.

- [ ] **Step 2: Create `shared/drizzle.config.ts`**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://seo_forge:seo_forge@localhost:5433/seo_forge",
  },
});
```

- [ ] **Step 3: Write the failing test for schema shape**

Create `shared/src/db/schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { sites, jobs, contentIndex, authStatus } from "./schema";

describe("db schema", () => {
  it("sites has expected columns", () => {
    expect(sites.id.name).toBe("id");
    expect(sites.repoUrl.name).toBe("repo_url");
    expect(sites.killSwitch.name).toBe("kill_switch");
  });
  it("jobs has expected columns", () => {
    expect(jobs.id.name).toBe("id");
    expect(jobs.type.name).toBe("type");
    expect(jobs.status.name).toBe("status");
    expect(jobs.mode.name).toBe("mode");
  });
  it("contentIndex has vector column", () => {
    expect(contentIndex.topicEmbedding.name).toBe("topic_embedding");
  });
  it("authStatus has lastChecked column", () => {
    expect(authStatus.lastChecked.name).toBe("last_checked");
  });
});
```

- [ ] **Step 4: Run, expect fail**

```bash
pnpm --filter @seo-forge/shared test
```

Expected: schema.ts not found.

- [ ] **Step 5: Implement `shared/src/db/schema.ts`**

```typescript
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);

export const jobModeEnum = pgEnum("job_mode", ["subscription", "api"]);

export const sites = pgTable("sites", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  repoUrl: text("repo_url").notNull(),
  branch: text("branch").notNull().default("main"),
  contentDir: text("content_dir").notNull(),
  fileFormat: text("file_format").notNull().default("mdx"),
  brandVoice: text("brand_voice").notNull().default(""),
  killSwitch: boolean("kill_switch").notNull().default(false),
  autoPublish: boolean("auto_publish").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(),
    siteId: text("site_id").references(() => sites.id),
    status: jobStatusEnum("status").notNull().default("pending"),
    mode: jobModeEnum("mode").notNull().default("subscription"),
    payload: jsonb("payload").notNull().default({}),
    result: jsonb("result"),
    error: text("error"),
    blockedBy: bigserial("blocked_by", { mode: "number" }),
    runAfter: timestamp("run_after", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    costUsd: integer("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("jobs_status_idx").on(t.status),
    siteIdx: index("jobs_site_idx").on(t.siteId),
  }),
);

export const contentIndex = pgTable(
  "content_index",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    url: text("url").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    h1: text("h1"),
    firstParagraph: text("first_paragraph"),
    topicEmbedding: vector("topic_embedding", { dimensions: 1024 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastIndexed: timestamp("last_indexed", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    urlIdx: uniqueIndex("content_index_url_idx").on(t.url),
    siteIdx: index("content_index_site_idx").on(t.siteId),
  }),
);

export const authStatus = pgTable("auth_status", {
  id: text("id").primaryKey().default("default"),
  status: text("status").notNull(),
  lastChecked: timestamp("last_checked", { withTimezone: true }).notNull().defaultNow(),
  errorMessage: text("error_message"),
});
```

Note: vector dimensions = **1024** to match Voyage `voyage-3-lite` output. Update if you switch models.

- [ ] **Step 6: Implement `shared/src/db/client.ts`**

```typescript
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Db; close: () => Promise<void> } {
  const sql = postgres(connectionString, { max: 5 });
  const db = drizzle(sql, { schema });
  return {
    db,
    close: async () => {
      await sql.end();
    },
  };
}

export { schema };
```

- [ ] **Step 7: Update `shared/src/index.ts`**

```typescript
export { parseEnv, EnvSchema, type Env } from "./env";
export { createDb, schema, type Db } from "./db/client";
export * as tables from "./db/schema";
```

- [ ] **Step 8: Generate the migration**

```bash
cd shared && pnpm db:generate
```

Expected: a new `0000_*.sql` file appears in `shared/src/db/migrations/`.

- [ ] **Step 9: Apply migration to local DB**

Create `shared/src/db/migrate.ts`:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://seo_forge:seo_forge@localhost:5433/seo_forge";
const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "./src/db/migrations" });
await sql.end();
console.log("Migrations applied.");
```

Run:
```bash
cd shared && pnpm db:migrate
```

Expected: `Migrations applied.`

- [ ] **Step 10: Run tests, expect pass**

```bash
pnpm --filter @seo-forge/shared test
```

Expected: 4 passing.

- [ ] **Step 11: Commit**

```bash
git add shared/ pnpm-lock.yaml
git commit -m "feat(shared): add drizzle schema for sites, jobs, content_index, auth_status"
```

---

## Task 5: Seed `sites` table with MCA Guide

**Files:**
- Create: `shared/src/db/seed.ts`

- [ ] **Step 1: Create `shared/src/db/seed.ts`**

```typescript
import { createDb, tables } from "../index";

const url = process.env.DATABASE_URL ?? "postgres://seo_forge:seo_forge@localhost:5433/seo_forge";
const { db, close } = createDb(url);

await db
  .insert(tables.sites)
  .values({
    id: "mca-guide",
    name: "The MCA Guide",
    domain: "themcaguide.com",
    repoUrl: process.env.MCA_GUIDE_REPO_URL ?? "git@github.com-barelezra10:barelezra10-create/the-mca-guide.git",
    branch: "main",
    contentDir: process.env.MCA_GUIDE_CONTENT_DIR ?? "content/articles",
    fileFormat: "mdx",
    brandVoice: "Practical, plain-language, founder-focused. No fluff. Cite sources. Examples in dollars.",
  })
  .onConflictDoUpdate({
    target: tables.sites.id,
    set: {
      name: "The MCA Guide",
      domain: "themcaguide.com",
    },
  });

console.log("Seeded mca-guide site.");
await close();
```

- [ ] **Step 2: Add seed script to `shared/package.json`**

```json
"db:seed": "tsx src/db/seed.ts"
```

- [ ] **Step 3: Run the seed**

```bash
cd shared && pnpm db:seed
```

Expected: `Seeded mca-guide site.`

- [ ] **Step 4: Verify in DB**

```bash
docker compose exec postgres psql -U seo_forge -d seo_forge -c "SELECT id, name, domain FROM sites;"
```

Expected: one row with `mca-guide | The MCA Guide | themcaguide.com`.

- [ ] **Step 5: Commit**

```bash
git add shared/
git commit -m "feat(shared): seed MCA Guide site row"
```

---

## Task 6: Initialize `worker/` package

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/vitest.config.ts`, `worker/src/cli.ts` (stub)

- [ ] **Step 1: Create `worker/package.json`**

```json
{
  "name": "@seo-forge/worker",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/cli.ts",
  "scripts": {
    "cli": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@seo-forge/shared": "workspace:*",
    "commander": "12.1.0",
    "drizzle-orm": "0.36.0",
    "postgres": "3.4.5",
    "simple-git": "3.27.0",
    "voyageai": "0.0.4",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "22.9.0",
    "tsx": "4.19.2",
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 2: Create `worker/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `worker/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 4: Create stub `worker/src/cli.ts`**

```typescript
import { Command } from "commander";

const program = new Command();
program
  .name("seo-forge")
  .description("SEO Forge worker CLI")
  .version("0.0.1");

program
  .command("ping")
  .description("Health check")
  .action(() => {
    console.log("pong");
  });

program.parse();
```

- [ ] **Step 5: Install and verify**

```bash
pnpm install
pnpm --filter @seo-forge/worker cli ping
```

Expected: `pong`

- [ ] **Step 6: Commit**

```bash
git add worker/ pnpm-lock.yaml
git commit -m "feat(worker): scaffold worker package with commander CLI"
```

---

## Task 7: Voyage embeddings client

**Files:**
- Create: `worker/src/embeddings/voyage.ts`
- Test: `worker/src/embeddings/voyage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/src/embeddings/voyage.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { embedText } from "./voyage";

const KEY = process.env.VOYAGE_API_KEY;

describe("embedText", () => {
  beforeAll(() => {
    if (!KEY) throw new Error("VOYAGE_API_KEY not set; cannot run test");
  });

  it("returns a 1024-dim vector for a string", async () => {
    const v = await embedText("How does an MCA work?", KEY!);
    expect(v).toHaveLength(1024);
    expect(typeof v[0]).toBe("number");
  });

  it("returns vectors for batched input", async () => {
    const vs = await embedText(["MCA basics", "Personal loan rates"], KEY!);
    expect(vs).toHaveLength(2);
    expect(vs[0]).toHaveLength(1024);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @seo-forge/worker test src/embeddings
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `worker/src/embeddings/voyage.ts`**

```typescript
export async function embedText(input: string, apiKey: string): Promise<number[]>;
export async function embedText(input: string[], apiKey: string): Promise<number[][]>;
export async function embedText(
  input: string | string[],
  apiKey: string,
): Promise<number[] | number[][]> {
  const isBatch = Array.isArray(input);
  const inputs = isBatch ? input : [input];

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: inputs,
      model: "voyage-3-lite",
      input_type: "document",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  const vectors = json.data.map((d) => d.embedding);
  return isBatch ? vectors : vectors[0]!;
}
```

- [ ] **Step 4: Run tests, expect pass**

Set env: `export VOYAGE_API_KEY=<your-key>`

```bash
pnpm --filter @seo-forge/worker test src/embeddings
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add worker/src/embeddings/
git commit -m "feat(worker): add Voyage AI embeddings client (voyage-3-lite, 1024 dim)"
```

---

## Task 8: Sitemap parser

**Files:**
- Create: `worker/src/content-index/sitemap.ts`, `worker/src/content-index/fixtures/sample-sitemap.xml`
- Test: `worker/src/content-index/sitemap.test.ts`

- [ ] **Step 1: Create fixture `worker/src/content-index/fixtures/sample-sitemap.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/article-one</loc>
    <lastmod>2026-04-01</lastmod>
  </url>
  <url>
    <loc>https://example.com/article-two</loc>
    <lastmod>2026-04-15</lastmod>
  </url>
</urlset>
```

- [ ] **Step 2: Write the failing test**

Create `worker/src/content-index/sitemap.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSitemap, fetchAndParseSitemap } from "./sitemap";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "fixtures/sample-sitemap.xml"), "utf-8");

describe("parseSitemap", () => {
  it("extracts URLs from a sitemap.xml string", () => {
    const urls = parseSitemap(fixture);
    expect(urls).toEqual([
      { loc: "https://example.com/article-one", lastmod: "2026-04-01" },
      { loc: "https://example.com/article-two", lastmod: "2026-04-15" },
    ]);
  });

  it("handles a sitemap with no lastmod", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://x.com/a</loc></url></urlset>`;
    expect(parseSitemap(xml)).toEqual([{ loc: "https://x.com/a", lastmod: null }]);
  });

  it("returns empty array for empty urlset", () => {
    expect(parseSitemap(`<?xml version="1.0"?><urlset></urlset>`)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, expect fail**

```bash
pnpm --filter @seo-forge/worker test src/content-index/sitemap
```

Expected: FAIL.

- [ ] **Step 4: Implement `worker/src/content-index/sitemap.ts`**

```typescript
export type SitemapEntry = { loc: string; lastmod: string | null };

export function parseSitemap(xml: string): SitemapEntry[] {
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  return urlBlocks.map((block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim() ?? "";
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? null;
    return { loc, lastmod };
  });
}

export async function fetchAndParseSitemap(sitemapUrl: string): Promise<SitemapEntry[]> {
  const res = await fetch(sitemapUrl, { headers: { "User-Agent": "seo-forge/0.0.1" } });
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status} ${sitemapUrl}`);
  return parseSitemap(await res.text());
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm --filter @seo-forge/worker test src/content-index/sitemap
```

Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add worker/src/content-index/sitemap.ts worker/src/content-index/sitemap.test.ts worker/src/content-index/fixtures/
git commit -m "feat(worker): add sitemap parser and fetcher"
```

---

## Task 9: Content index repository (insert + similarity search)

**Files:**
- Create: `worker/src/content-index/repo.ts`
- Test: `worker/src/content-index/repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/src/content-index/repo.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, tables } from "@seo-forge/shared";
import { sql } from "drizzle-orm";
import { ContentIndexRepo } from "./repo";

const url = process.env.DATABASE_URL ?? "postgres://seo_forge:seo_forge@localhost:5433/seo_forge";
const { db, close } = createDb(url);
const repo = new ContentIndexRepo(db);

beforeAll(async () => {
  await db.execute(sql`DELETE FROM content_index WHERE site_id IN ('test-a', 'test-b')`);
  await db.insert(tables.sites).values([
    { id: "test-a", name: "A", domain: "a.com", repoUrl: "x", contentDir: "x" },
    { id: "test-b", name: "B", domain: "b.com", repoUrl: "x", contentDir: "x" },
  ]).onConflictDoNothing();
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM content_index WHERE site_id IN ('test-a', 'test-b')`);
  await db.execute(sql`DELETE FROM sites WHERE id IN ('test-a', 'test-b')`);
  await close();
});

describe("ContentIndexRepo", () => {
  it("inserts and reads back an article", async () => {
    const v = Array(1024).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    await repo.upsert({
      siteId: "test-a",
      url: "https://a.com/x",
      slug: "x",
      title: "X",
      h1: "X",
      firstParagraph: "first",
      topicEmbedding: v,
      publishedAt: new Date(),
    });
    const rows = await db.select().from(tables.contentIndex).where(sql`url = ${"https://a.com/x"}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("X");
  });

  it("findSimilarOnOtherSites returns nearest articles excluding source site", async () => {
    const target = Array(1024).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    const close = Array(1024).fill(0).map((_, i) => (i === 0 ? 0.99 : 0.01));
    const far = Array(1024).fill(0).map((_, i) => (i === 0 ? 0 : 1));
    await repo.upsert({
      siteId: "test-b",
      url: "https://b.com/close",
      slug: "close",
      title: "Close",
      h1: "Close",
      firstParagraph: "p",
      topicEmbedding: close,
      publishedAt: new Date(),
    });
    await repo.upsert({
      siteId: "test-b",
      url: "https://b.com/far",
      slug: "far",
      title: "Far",
      h1: "Far",
      firstParagraph: "p",
      topicEmbedding: far,
      publishedAt: new Date(),
    });
    const results = await repo.findSimilarOnOtherSites({
      embedding: target,
      excludeSiteId: "test-a",
      limit: 2,
      maxDistance: 0.5,
    });
    expect(results.map((r) => r.url)).toContain("https://b.com/close");
    expect(results[0]!.url).toBe("https://b.com/close");
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @seo-forge/worker test src/content-index/repo
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `worker/src/content-index/repo.ts`**

```typescript
import { type Db, tables } from "@seo-forge/shared";
import { and, eq, sql } from "drizzle-orm";

export type ContentIndexRow = {
  siteId: string;
  url: string;
  slug: string;
  title: string;
  h1: string;
  firstParagraph: string;
  topicEmbedding: number[];
  publishedAt: Date;
};

export type SimilaritySearch = {
  embedding: number[];
  excludeSiteId: string;
  limit: number;
  maxDistance: number;
};

export type SimilarityHit = {
  id: number;
  siteId: string;
  url: string;
  title: string;
  distance: number;
};

export class ContentIndexRepo {
  constructor(private db: Db) {}

  async upsert(row: ContentIndexRow): Promise<void> {
    const vec = `[${row.topicEmbedding.join(",")}]`;
    await this.db.execute(sql`
      INSERT INTO content_index
        (site_id, url, slug, title, h1, first_paragraph, topic_embedding, published_at, last_indexed)
      VALUES
        (${row.siteId}, ${row.url}, ${row.slug}, ${row.title}, ${row.h1},
         ${row.firstParagraph}, ${vec}::vector, ${row.publishedAt.toISOString()}, NOW())
      ON CONFLICT (url) DO UPDATE SET
        title = EXCLUDED.title,
        h1 = EXCLUDED.h1,
        first_paragraph = EXCLUDED.first_paragraph,
        topic_embedding = EXCLUDED.topic_embedding,
        last_indexed = NOW()
    `);
  }

  async findSimilarOnOtherSites(s: SimilaritySearch): Promise<SimilarityHit[]> {
    const vec = `[${s.embedding.join(",")}]`;
    const rows = await this.db.execute<{
      id: number;
      site_id: string;
      url: string;
      title: string;
      distance: number;
    }>(sql`
      SELECT id, site_id, url, title, topic_embedding <=> ${vec}::vector AS distance
      FROM content_index
      WHERE site_id != ${s.excludeSiteId}
        AND topic_embedding IS NOT NULL
        AND topic_embedding <=> ${vec}::vector < ${s.maxDistance}
      ORDER BY topic_embedding <=> ${vec}::vector ASC
      LIMIT ${s.limit}
    `);
    return rows.map((r) => ({
      id: r.id,
      siteId: r.site_id,
      url: r.url,
      title: r.title,
      distance: r.distance,
    }));
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter @seo-forge/worker test src/content-index/repo
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add worker/src/content-index/repo.ts worker/src/content-index/repo.test.ts
git commit -m "feat(worker): add ContentIndexRepo with pgvector similarity search"
```

---

## Task 10: Content index backfill script

**Files:**
- Create: `worker/src/content-index/backfill.ts`

- [ ] **Step 1: Implement `worker/src/content-index/backfill.ts`**

```typescript
import { createDb, parseEnv } from "@seo-forge/shared";
import { fetchAndParseSitemap } from "./sitemap.js";
import { ContentIndexRepo } from "./repo.js";
import { embedText } from "../embeddings/voyage.js";

async function fetchPageMeta(url: string): Promise<{ title: string; h1: string; firstParagraph: string }> {
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

export async function backfillSite(opts: {
  siteId: string;
  domain: string;
  sitemapUrl?: string;
  voyageKey: string;
  databaseUrl: string;
  concurrency?: number;
}): Promise<{ inserted: number; skipped: number; errors: number }> {
  const sitemapUrl = opts.sitemapUrl ?? `https://${opts.domain}/sitemap.xml`;
  const { db, close } = createDb(opts.databaseUrl);
  const repo = new ContentIndexRepo(db);

  const entries = await fetchAndParseSitemap(sitemapUrl);
  console.log(`[backfill ${opts.siteId}] sitemap: ${entries.length} URLs`);

  let inserted = 0,
    skipped = 0,
    errors = 0;

  for (const e of entries) {
    try {
      const meta = await fetchPageMeta(e.loc);
      if (!meta.title) {
        skipped++;
        continue;
      }
      const embedInput = `${meta.title}\n\n${meta.h1}\n\n${meta.firstParagraph}`.slice(0, 4000);
      const embedding = await embedText(embedInput, opts.voyageKey);
      const slug = new URL(e.loc).pathname.split("/").filter(Boolean).pop() ?? "";
      await repo.upsert({
        siteId: opts.siteId,
        url: e.loc,
        slug,
        title: meta.title,
        h1: meta.h1,
        firstParagraph: meta.firstParagraph,
        topicEmbedding: embedding,
        publishedAt: e.lastmod ? new Date(e.lastmod) : new Date(),
      });
      inserted++;
      if (inserted % 10 === 0) console.log(`[backfill ${opts.siteId}] ${inserted}/${entries.length}`);
    } catch (err) {
      console.error(`[backfill ${opts.siteId}] error for ${e.loc}:`, err);
      errors++;
    }
  }

  await close();
  return { inserted, skipped, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = parseEnv(process.env);
  const siteId = process.argv[2];
  const domain = process.argv[3];
  if (!siteId || !domain) {
    console.error("Usage: tsx backfill.ts <siteId> <domain>");
    process.exit(1);
  }
  const result = await backfillSite({
    siteId,
    domain,
    voyageKey: env.VOYAGE_API_KEY,
    databaseUrl: env.DATABASE_URL,
  });
  console.log(`Done:`, result);
}
```

- [ ] **Step 2: Add script to `worker/package.json`**

```json
"backfill": "tsx src/content-index/backfill.ts"
```

- [ ] **Step 3: Run backfill on MCA Guide**

```bash
cd worker && pnpm backfill mca-guide themcaguide.com
```

Expected: console output showing pages indexed; final `Done: { inserted: ~140, skipped: 0, errors: 0 }`.

- [ ] **Step 4: Verify in DB**

```bash
docker compose exec postgres psql -U seo_forge -d seo_forge -c "SELECT COUNT(*) FROM content_index WHERE site_id = 'mca-guide';"
```

Expected: count matches inserted total.

- [ ] **Step 5: Commit**

```bash
git add worker/src/content-index/backfill.ts worker/package.json
git commit -m "feat(worker): add content-index backfill script"
```

---

## Task 11: Claude Code session wrapper

**Files:**
- Create: `worker/src/claude/session.ts`
- Test: `worker/src/claude/session.test.ts`

The wrapper spawns the `claude` CLI as a subprocess and feeds it a prompt via stdin (or the `-p` flag for one-shot). It captures stdout, parses the final assistant message, and returns the text plus a transcript.

- [ ] **Step 1: Write the failing test**

Create `worker/src/claude/session.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { runClaudeOneShot } from "./session";

const SKIP_REAL = process.env.RUN_REAL_CLAUDE !== "1";

describe("runClaudeOneShot", () => {
  it.skipIf(SKIP_REAL)("returns a response from the claude CLI", async () => {
    const result = await runClaudeOneShot({
      prompt: "Reply with exactly the word 'PONG' and nothing else.",
      timeoutMs: 60_000,
    });
    expect(result.text.trim().toUpperCase()).toContain("PONG");
    expect(result.exitCode).toBe(0);
  });

  it("times out when claude blocks", async () => {
    await expect(
      runClaudeOneShot({
        prompt: "test",
        timeoutMs: 100,
        binPath: "sleep",
        binArgs: ["10"],
      }),
    ).rejects.toThrow(/timed out/i);
  });

  it("rejects when binary is missing", async () => {
    await expect(
      runClaudeOneShot({
        prompt: "test",
        timeoutMs: 5000,
        binPath: "/nonexistent-binary-xyz",
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @seo-forge/worker test src/claude/session
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `worker/src/claude/session.ts`**

```typescript
import { spawn } from "node:child_process";

export type ClaudeRunOptions = {
  prompt: string;
  timeoutMs?: number;
  binPath?: string;
  binArgs?: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export type ClaudeRunResult = {
  text: string;
  exitCode: number;
  durationMs: number;
  stderr: string;
};

export async function runClaudeOneShot(opts: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const start = Date.now();
  const bin = opts.binPath ?? "claude";
  const args = opts.binArgs ?? ["-p", opts.prompt];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 30 * 60 * 1000);

    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`claude run timed out after ${opts.timeoutMs}ms`));
        return;
      }
      resolve({
        text: stdout,
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
        stderr,
      });
    });
  });
}
```

- [ ] **Step 4: Run tests, expect pass**

For the real-claude test, set:
```bash
export RUN_REAL_CLAUDE=1
```

Then:
```bash
pnpm --filter @seo-forge/worker test src/claude/session
```

Expected: 3 passing (or 2 passing + 1 skipped if `RUN_REAL_CLAUDE` not set).

- [ ] **Step 5: Commit**

```bash
git add worker/src/claude/
git commit -m "feat(worker): add claude-code subprocess wrapper"
```

---

## Task 12: Ahrefs API client

**Files:**
- Create: `worker/src/data/ahrefs.ts`
- Test: `worker/src/data/ahrefs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/src/data/ahrefs.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { fetchKeywordIdeas } from "./ahrefs";

const KEY = process.env.AHREFS_API_KEY;
const SKIP = !KEY;

describe("fetchKeywordIdeas", () => {
  it.skipIf(SKIP)("returns ideas for a domain", async () => {
    const ideas = await fetchKeywordIdeas({
      domain: "themcaguide.com",
      country: "us",
      limit: 25,
      maxKd: 30,
      apiKey: KEY!,
    });
    expect(Array.isArray(ideas)).toBe(true);
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas[0]).toHaveProperty("keyword");
    expect(ideas[0]).toHaveProperty("volume");
    expect(ideas[0]).toHaveProperty("kd");
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @seo-forge/worker test src/data/ahrefs
```

- [ ] **Step 3: Implement `worker/src/data/ahrefs.ts`**

```typescript
export type AhrefsKeywordIdea = {
  keyword: string;
  volume: number;
  kd: number;
  cpc: number | null;
};

export type FetchKeywordIdeasOpts = {
  domain: string;
  country: string;
  limit: number;
  maxKd: number;
  apiKey: string;
};

export async function fetchKeywordIdeas(o: FetchKeywordIdeasOpts): Promise<AhrefsKeywordIdea[]> {
  const url = new URL("https://api.ahrefs.com/v3/keywords-explorer/matching-terms");
  url.searchParams.set("country", o.country);
  url.searchParams.set("target", o.domain);
  url.searchParams.set("select", "keyword,volume,difficulty,cpc");
  url.searchParams.set("limit", String(o.limit));
  url.searchParams.set("where", JSON.stringify({ field: "difficulty", operator: "lte", value: o.maxKd }));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${o.apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Ahrefs API ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    keywords: Array<{ keyword: string; volume: number; difficulty: number; cpc?: number }>;
  };
  return json.keywords.map((k) => ({
    keyword: k.keyword,
    volume: k.volume,
    kd: k.difficulty,
    cpc: k.cpc ?? null,
  }));
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter @seo-forge/worker test src/data/ahrefs
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add worker/src/data/ahrefs.ts worker/src/data/ahrefs.test.ts
git commit -m "feat(worker): add Ahrefs keyword-ideas client"
```

---

## Task 13: Google Search Console client

**Files:**
- Create: `worker/src/data/gsc.ts`
- Test: `worker/src/data/gsc.test.ts`

GSC requires OAuth2: refresh token + client ID/secret. The refresh token is in memory. Add `GSC_CLIENT_ID` and `GSC_CLIENT_SECRET` to `.env.example` and `EnvSchema`. Bar fills these in (they live in his existing GSC OAuth app).

- [ ] **Step 1: Update `.env.example` and `shared/src/env.ts`**

Add to `.env.example`:
```
GSC_CLIENT_ID=
GSC_CLIENT_SECRET=
```

Add to `EnvSchema` in `shared/src/env.ts`:
```typescript
GSC_CLIENT_ID: z.string().min(1),
GSC_CLIENT_SECRET: z.string().min(1),
```

Update the test in `shared/src/env.test.ts` to include these in the valid input. Run shared tests, ensure pass.

- [ ] **Step 2: Write the failing test**

Create `worker/src/data/gsc.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { fetchStrikingDistanceQueries, exchangeRefreshToken } from "./gsc";

const SKIP = !process.env.GSC_REFRESH_TOKEN || !process.env.GSC_CLIENT_ID;

describe("gsc", () => {
  it.skipIf(SKIP)("exchanges refresh token for access token", async () => {
    const token = await exchangeRefreshToken({
      refreshToken: process.env.GSC_REFRESH_TOKEN!,
      clientId: process.env.GSC_CLIENT_ID!,
      clientSecret: process.env.GSC_CLIENT_SECRET!,
    });
    expect(token).toMatch(/^ya29\./);
  });

  it.skipIf(SKIP)("fetches striking-distance queries for a property", async () => {
    const queries = await fetchStrikingDistanceQueries({
      siteUrl: "sc-domain:themcaguide.com",
      refreshToken: process.env.GSC_REFRESH_TOKEN!,
      clientId: process.env.GSC_CLIENT_ID!,
      clientSecret: process.env.GSC_CLIENT_SECRET!,
      days: 28,
      minPosition: 8,
      maxPosition: 25,
      minImpressions: 50,
    });
    expect(Array.isArray(queries)).toBe(true);
    if (queries.length > 0) {
      expect(queries[0]).toHaveProperty("query");
      expect(queries[0]).toHaveProperty("position");
    }
  });
});
```

- [ ] **Step 3: Implement `worker/src/data/gsc.ts`**

```typescript
export async function exchangeRefreshToken(o: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: o.clientId,
      client_secret: o.clientSecret,
      refresh_token: o.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`GSC token exchange failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

export type StrikingDistanceQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function fetchStrikingDistanceQueries(o: {
  siteUrl: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  days: number;
  minPosition: number;
  maxPosition: number;
  minImpressions: number;
}): Promise<StrikingDistanceQuery[]> {
  const accessToken = await exchangeRefreshToken({
    refreshToken: o.refreshToken,
    clientId: o.clientId,
    clientSecret: o.clientSecret,
  });
  const end = new Date();
  const start = new Date(end.getTime() - o.days * 24 * 60 * 60 * 1000);
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(o.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        dimensions: ["query"],
        rowLimit: 1000,
      }),
    },
  );
  if (!res.ok) throw new Error(`GSC query failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    rows?: Array<{ keys: [string]; clicks: number; impressions: number; ctr: number; position: number }>;
  };
  return (j.rows ?? [])
    .filter(
      (r) =>
        r.position >= o.minPosition &&
        r.position <= o.maxPosition &&
        r.impressions >= o.minImpressions,
    )
    .map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter @seo-forge/worker test src/data/gsc
```

- [ ] **Step 5: Commit**

```bash
git add worker/src/data/gsc.ts worker/src/data/gsc.test.ts shared/src/env.ts .env.example
git commit -m "feat(worker): add GSC OAuth + striking-distance query client"
```

---

## Task 14: Site adapter interface + MCA Guide adapter

**Files:**
- Create: `worker/src/sites/adapter.ts`, `worker/src/sites/mca-guide/adapter.ts`
- Test: `worker/src/sites/mca-guide/adapter.test.ts`

- [ ] **Step 1: Define the interface in `worker/src/sites/adapter.ts`**

```typescript
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
  buildSlug(brief: ArticleBrief): string;
  buildPath(slug: string): string;
  renderFile(input: RenderInput): { path: string; content: string; slug: string };
}
```

- [ ] **Step 2: Write the failing test**

Create `worker/src/sites/mca-guide/adapter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mcaGuideAdapter } from "./adapter";

describe("mcaGuideAdapter", () => {
  it("builds slug from keyword", () => {
    expect(mcaGuideAdapter.buildSlug({ targetKeyword: "What is an MCA loan", intent: "info", outline: [], audience: "" }))
      .toBe("what-is-an-mca-loan");
  });

  it("buildPath joins contentDir + slug + .mdx", () => {
    expect(mcaGuideAdapter.buildPath("foo-bar")).toBe("content/articles/foo-bar.mdx");
  });

  it("renderFile produces expected MDX with frontmatter, body, and sister links section", () => {
    const out = mcaGuideAdapter.renderFile({
      brief: { targetKeyword: "MCA basics", intent: "info", outline: ["What"], audience: "founders" },
      geo: { ledeAnswer: "An MCA is X.", quickFacts: ["Fact 1", "Fact 2"] },
      body: "## What\n\nBody copy here.",
      sisterLinks: [
        { url: "https://fintiex.com/loans/personal-loans-101", title: "Personal Loans 101" },
      ],
    });
    expect(out.path).toBe("content/articles/mca-basics.mdx");
    expect(out.content).toContain("---");
    expect(out.content).toContain("title:");
    expect(out.content).toContain("An MCA is X.");
    expect(out.content).toContain("Quick Facts");
    expect(out.content).toContain("Personal Loans 101");
    expect(out.content).toContain("application/ld+json");
  });
});
```

- [ ] **Step 3: Run, expect fail**

- [ ] **Step 4: Implement `worker/src/sites/mca-guide/adapter.ts`**

```typescript
import type { SiteAdapter, RenderInput, ArticleBrief } from "../adapter.js";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function buildJsonLd(brief: ArticleBrief, lede: string): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: brief.targetKeyword,
    description: lede,
    author: { "@type": "Organization", name: "The MCA Guide" },
    publisher: { "@type": "Organization", name: "The MCA Guide" },
  };
  return JSON.stringify(data, null, 2);
}

export const mcaGuideAdapter: SiteAdapter = {
  siteId: "mca-guide",
  contentDir: "content/articles",
  fileFormat: "mdx",

  buildSlug(brief) {
    return slugify(brief.targetKeyword);
  },

  buildPath(slug) {
    return `${this.contentDir}/${slug}.${this.fileFormat}`;
  },

  renderFile(input: RenderInput) {
    const slug = this.buildSlug(input.brief);
    const path = this.buildPath(slug);
    const today = new Date().toISOString().slice(0, 10);

    const frontmatter = [
      "---",
      `title: "${input.brief.targetKeyword.replace(/"/g, '\\"')}"`,
      `description: "${input.geo.ledeAnswer.replace(/"/g, '\\"').slice(0, 160)}"`,
      `date: ${today}`,
      `slug: ${slug}`,
      `targetKeyword: "${input.brief.targetKeyword.replace(/"/g, '\\"')}"`,
      "---",
    ].join("\n");

    const lede = `\n${input.geo.ledeAnswer}\n`;

    const quickFacts =
      "\n## Quick Facts\n\n" +
      input.geo.quickFacts.map((f) => `- ${f}`).join("\n") +
      "\n";

    const body = `\n${input.body}\n`;

    const sisterLinksBlock =
      input.sisterLinks.length > 0
        ? "\n## Related reading\n\n" +
          input.sisterLinks.map((l) => `- [${l.title}](${l.url})`).join("\n") +
          "\n"
        : "";

    const jsonLd = `\n<script type="application/ld+json">\n${buildJsonLd(input.brief, input.geo.ledeAnswer)}\n</script>\n`;

    const content = [frontmatter, lede, quickFacts, body, sisterLinksBlock, jsonLd].join("\n");
    return { path, content, slug };
  },
};
```

- [ ] **Step 5: Run, expect pass**

```bash
pnpm --filter @seo-forge/worker test src/sites
```

Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add worker/src/sites/
git commit -m "feat(worker): add SiteAdapter interface and MCA Guide adapter"
```

---

## Task 15: Git publisher

**Files:**
- Create: `worker/src/publishers/git-publisher.ts`
- Test: `worker/src/publishers/git-publisher.test.ts`

- [ ] **Step 1: Write the failing test (uses a temp local bare repo)**

Create `worker/src/publishers/git-publisher.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import { GitPublisher } from "./git-publisher";

let tmp: string;
let bareRepo: string;
let workspace: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "seo-forge-test-"));
  bareRepo = join(tmp, "bare.git");
  workspace = join(tmp, "workspace");
  await mkdir(bareRepo);
  await mkdir(workspace);
  const g = simpleGit(bareRepo);
  await g.init(true);

  // seed initial commit so main branch exists
  const seedDir = join(tmp, "seed");
  await mkdir(seedDir);
  const seedGit = simpleGit(seedDir);
  await seedGit.init();
  await seedGit.addConfig("user.email", "test@test");
  await seedGit.addConfig("user.name", "Test");
  await writeFile(join(seedDir, "README.md"), "seed");
  await seedGit.add(".");
  await seedGit.commit("seed");
  await seedGit.branch(["-M", "main"]);
  await seedGit.addRemote("origin", bareRepo);
  await seedGit.push("origin", "main");
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("GitPublisher", () => {
  it("clones, writes a file, commits, pushes", async () => {
    const publisher = new GitPublisher({ workspaceDir: workspace });
    const result = await publisher.publish({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
      relativeFilePath: "content/articles/foo.mdx",
      fileContent: "# hello\n",
      commitMessage: "feat(seo-forge): publish foo",
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    expect(result.commitSha).toMatch(/^[a-f0-9]{7,}/);

    // verify by cloning the bare repo fresh
    const verifyDir = join(tmp, "verify");
    await mkdir(verifyDir);
    const vg = simpleGit(verifyDir);
    await vg.clone(bareRepo, verifyDir);
    const text = await readFile(join(verifyDir, "content/articles/foo.mdx"), "utf-8");
    expect(text).toBe("# hello\n");
  });

  it("re-uses an existing local clone (pulls instead of re-cloning)", async () => {
    const publisher = new GitPublisher({ workspaceDir: workspace });
    const r1 = await publisher.publish({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
      relativeFilePath: "content/articles/bar.mdx",
      fileContent: "first\n",
      commitMessage: "feat: bar",
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    const r2 = await publisher.publish({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
      relativeFilePath: "content/articles/baz.mdx",
      fileContent: "second\n",
      commitMessage: "feat: baz",
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    expect(r1.commitSha).not.toBe(r2.commitSha);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement `worker/src/publishers/git-publisher.ts`**

```typescript
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

export type PublishInput = {
  siteId: string;
  repoUrl: string;
  branch: string;
  relativeFilePath: string;
  fileContent: string;
  commitMessage: string;
  authorName: string;
  authorEmail: string;
};

export type PublishResult = {
  commitSha: string;
  branch: string;
};

export class GitPublisher {
  constructor(private opts: { workspaceDir: string }) {}

  private repoPath(siteId: string): string {
    return join(this.opts.workspaceDir, siteId);
  }

  private async ensureClone(input: PublishInput): Promise<SimpleGit> {
    const path = this.repoPath(input.siteId);
    let exists = false;
    try {
      const s = await stat(path);
      exists = s.isDirectory();
    } catch {
      exists = false;
    }
    if (!exists) {
      await mkdir(dirname(path), { recursive: true });
      const root = simpleGit();
      await root.clone(input.repoUrl, path);
    }
    const git = simpleGit(path);
    await git.fetch("origin", input.branch);
    await git.checkout(input.branch);
    await git.reset(["--hard", `origin/${input.branch}`]);
    await git.pull("origin", input.branch);
    return git;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const git = await this.ensureClone(input);
    await git.addConfig("user.email", input.authorEmail, false, "local");
    await git.addConfig("user.name", input.authorName, false, "local");

    const path = this.repoPath(input.siteId);
    const target = join(path, input.relativeFilePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.fileContent, "utf-8");

    await git.add(input.relativeFilePath);
    const commitResult = await git.commit(input.commitMessage);
    if (!commitResult.commit) {
      throw new Error(`Commit failed: ${JSON.stringify(commitResult)}`);
    }
    await git.push("origin", input.branch);
    return { commitSha: commitResult.commit, branch: input.branch };
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter @seo-forge/worker test src/publishers
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add worker/src/publishers/
git commit -m "feat(worker): add GitPublisher (clone-or-pull, write, commit, push)"
```

---

## Task 16: Keyword research → brief

**Files:**
- Create: `worker/src/jobs/keyword-research.ts`
- Test: `worker/src/jobs/keyword-research.test.ts`

This job assembles a brief from Ahrefs + GSC. Topic selection rule: pick the highest-traffic, lowest-KD keyword that is NOT already covered in `content_index`.

- [ ] **Step 1: Write the failing test**

Create `worker/src/jobs/keyword-research.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { selectKeyword, type Candidate } from "./keyword-research";

describe("selectKeyword", () => {
  it("picks highest score among candidates not in coveredSlugs", () => {
    const candidates: Candidate[] = [
      { keyword: "what is an mca", source: "ahrefs", volume: 1000, kd: 5, position: null },
      { keyword: "mca rates", source: "ahrefs", volume: 500, kd: 10, position: null },
      { keyword: "mca defaults", source: "gsc", volume: 0, kd: 0, position: 12 },
    ];
    const picked = selectKeyword({
      candidates,
      coveredSlugs: new Set(["what-is-an-mca"]),
    });
    expect(picked?.keyword).toBe("mca rates");
  });

  it("returns null if no candidate available", () => {
    expect(selectKeyword({ candidates: [], coveredSlugs: new Set() })).toBeNull();
  });

  it("picks GSC striking-distance over low-volume Ahrefs idea when scores tie", () => {
    const candidates: Candidate[] = [
      { keyword: "low value", source: "ahrefs", volume: 50, kd: 5, position: null },
      { keyword: "mca lawsuit defense", source: "gsc", volume: 200, kd: 0, position: 11 },
    ];
    const picked = selectKeyword({ candidates, coveredSlugs: new Set() });
    expect(picked?.keyword).toBe("mca lawsuit defense");
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement `worker/src/jobs/keyword-research.ts`**

```typescript
import { fetchKeywordIdeas } from "../data/ahrefs.js";
import { fetchStrikingDistanceQueries } from "../data/gsc.js";

export type Candidate = {
  keyword: string;
  source: "ahrefs" | "gsc";
  volume: number;
  kd: number;
  position: number | null;
};

export type SelectInput = {
  candidates: Candidate[];
  coveredSlugs: Set<string>;
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function score(c: Candidate): number {
  // Higher = better.
  if (c.source === "gsc") {
    // striking distance: closer to position 10 + impressions = higher
    return c.volume + (25 - (c.position ?? 25)) * 50;
  }
  // ahrefs: volume / (kd + 1) — favor traffic per difficulty
  return c.volume / (c.kd + 1);
}

export function selectKeyword(input: SelectInput): Candidate | null {
  const eligible = input.candidates.filter((c) => !input.coveredSlugs.has(slugify(c.keyword)));
  if (eligible.length === 0) return null;
  return eligible.reduce((best, cur) => (score(cur) > score(best) ? cur : best));
}

export type KeywordResearchInput = {
  siteId: string;
  domain: string;
  coveredSlugs: Set<string>;
  ahrefsKey: string;
  gscRefreshToken: string;
  gscClientId: string;
  gscClientSecret: string;
};

export type KeywordBrief = {
  targetKeyword: string;
  intent: string;
  outline: string[];
  audience: string;
  source: "ahrefs" | "gsc";
  volume: number;
  kd: number;
};

export async function gatherCandidates(i: KeywordResearchInput): Promise<Candidate[]> {
  const [ideas, striking] = await Promise.all([
    fetchKeywordIdeas({
      domain: i.domain,
      country: "us",
      limit: 50,
      maxKd: 30,
      apiKey: i.ahrefsKey,
    }),
    fetchStrikingDistanceQueries({
      siteUrl: `sc-domain:${i.domain}`,
      refreshToken: i.gscRefreshToken,
      clientId: i.gscClientId,
      clientSecret: i.gscClientSecret,
      days: 28,
      minPosition: 8,
      maxPosition: 25,
      minImpressions: 50,
    }),
  ]);
  return [
    ...ideas.map<Candidate>((k) => ({
      keyword: k.keyword,
      source: "ahrefs",
      volume: k.volume,
      kd: k.kd,
      position: null,
    })),
    ...striking.map<Candidate>((q) => ({
      keyword: q.query,
      source: "gsc",
      volume: q.impressions,
      kd: 0,
      position: q.position,
    })),
  ];
}

export function buildBrief(c: Candidate, audience: string): KeywordBrief {
  return {
    targetKeyword: c.keyword,
    intent: c.keyword.startsWith("how") || c.keyword.startsWith("what") ? "informational" : "commercial",
    outline: [
      `Direct answer: define ${c.keyword}`,
      `Context: when this matters for the reader`,
      `Specifics with numbers and examples`,
      `Common pitfalls / what to avoid`,
      `Action steps`,
    ],
    audience,
    source: c.source,
    volume: c.volume,
    kd: c.kd,
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter @seo-forge/worker test src/jobs/keyword-research
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add worker/src/jobs/keyword-research.ts worker/src/jobs/keyword-research.test.ts
git commit -m "feat(worker): keyword research job (Ahrefs + GSC, score-based selection)"
```

---

## Task 17: Article writer job (uses Claude Code)

**Files:**
- Create: `worker/src/jobs/write-article.ts`, `worker/src/jobs/write-article.prompt.ts`
- Test: `worker/src/jobs/write-article.test.ts`

The article writer builds the prompt for Claude Code, runs it, parses the structured response (JSON with `body`, `ledeAnswer`, `quickFacts`), and returns a `RenderInput` ready for the adapter.

- [ ] **Step 1: Implement the prompt template `worker/src/jobs/write-article.prompt.ts`**

```typescript
import type { KeywordBrief } from "./keyword-research.js";

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
      : "(none — do not invent any external links)";

  return `You are writing a single article for ${opts.siteName} (${opts.domain}).

Target keyword: ${opts.brief.targetKeyword}
Search intent: ${opts.brief.intent}
Audience: ${opts.brief.audience}
Brand voice: ${opts.brandVoice}

Outline (use as a guide, not a script):
${opts.brief.outline.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Internal links to include if topically relevant (max ${opts.sisterLinks.length}):
${sisterLinksBlock}

Output a single JSON object — no prose before or after — with these exact keys:

{
  "ledeAnswer": "1-2 sentence direct answer to the target keyword query, factual, quotable",
  "quickFacts": ["4-6 short factual bullets, each with a number, date, or named source"],
  "body": "Full article body in markdown. Use H2 (##) for sections. 1200-2000 words. Insert the internal links inline where topically relevant — do not force them. Do not include a top-level H1. Do not include a frontmatter block. Do not use em dashes (—); use periods or commas instead."
}

Rules:
- No em dashes (—) anywhere. None.
- Cite sources by name when stating a stat (e.g., "according to the SBA...").
- Use real, plausible numbers. If you do not know an exact number, give a defensible range and label it as such.
- The internal links above are real URLs. Use them inline as markdown links if the topic fits naturally.

Respond with ONLY the JSON object. No preamble, no explanation, no markdown code fence.`;
}
```

- [ ] **Step 2: Write the failing test**

Create `worker/src/jobs/write-article.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseArticleResponse, runWriteArticle } from "./write-article";

describe("parseArticleResponse", () => {
  it("parses a valid JSON response", () => {
    const json = JSON.stringify({
      ledeAnswer: "An MCA is a lump sum of capital exchanged for a percentage of future receivables.",
      quickFacts: ["Fact 1", "Fact 2", "Fact 3", "Fact 4"],
      body: "## Overview\n\nBody copy.",
    });
    const parsed = parseArticleResponse(json);
    expect(parsed.ledeAnswer).toContain("MCA");
    expect(parsed.quickFacts).toHaveLength(4);
    expect(parsed.body).toContain("Overview");
  });

  it("strips a leading/trailing code fence if present", () => {
    const json = "```json\n" + JSON.stringify({
      ledeAnswer: "x",
      quickFacts: ["a"],
      body: "b",
    }) + "\n```";
    const parsed = parseArticleResponse(json);
    expect(parsed.body).toBe("b");
  });

  it("throws if required keys missing", () => {
    expect(() => parseArticleResponse(JSON.stringify({ ledeAnswer: "x" }))).toThrow();
  });

  it("rejects content with em dashes", () => {
    const json = JSON.stringify({
      ledeAnswer: "An MCA is a tool — not a loan.",
      quickFacts: ["a"],
      body: "b",
    });
    expect(() => parseArticleResponse(json)).toThrow(/em dash/i);
  });
});
```

- [ ] **Step 3: Run, expect fail**

- [ ] **Step 4: Implement `worker/src/jobs/write-article.ts`**

```typescript
import { runClaudeOneShot } from "../claude/session.js";
import { buildPrompt, type SisterLink } from "./write-article.prompt.js";
import type { KeywordBrief } from "./keyword-research.js";

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
  if (combined.includes("—")) {
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
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm --filter @seo-forge/worker test src/jobs/write-article
```

Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add worker/src/jobs/write-article.ts worker/src/jobs/write-article.prompt.ts worker/src/jobs/write-article.test.ts
git commit -m "feat(worker): article writer job with structured Claude Code prompt"
```

---

## Task 18: End-to-end pipeline + CLI publish command

**Files:**
- Create: `worker/src/pipeline/pipeline.ts`
- Modify: `worker/src/cli.ts`
- Test: `worker/src/pipeline/pipeline.test.ts`

The pipeline wires keyword research → sister-link lookup → write → render → publish → index.

- [ ] **Step 1: Implement `worker/src/pipeline/pipeline.ts`**

```typescript
import { createDb, parseEnv, tables } from "@seo-forge/shared";
import { eq } from "drizzle-orm";
import { mcaGuideAdapter } from "../sites/mca-guide/adapter.js";
import { GitPublisher } from "../publishers/git-publisher.js";
import { ContentIndexRepo } from "../content-index/repo.js";
import { embedText } from "../embeddings/voyage.js";
import { gatherCandidates, selectKeyword, buildBrief } from "../jobs/keyword-research.js";
import { runWriteArticle } from "../jobs/write-article.js";
import type { SiteAdapter } from "../sites/adapter.js";

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

export async function runPipeline(opts: { siteId: string }): Promise<PipelineResult> {
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
      coveredSlugs,
      ahrefsKey: env.AHREFS_API_KEY,
      gscRefreshToken: env.GSC_REFRESH_TOKEN,
      gscClientId: env.GSC_CLIENT_ID,
      gscClientSecret: env.GSC_CLIENT_SECRET,
    });
    const picked = selectKeyword({ candidates, coveredSlugs });
    if (!picked) throw new Error("No eligible keyword candidates");
    const brief = buildBrief(picked, "founders running cash-flow businesses");
    console.log(`[pipeline] picked keyword: "${brief.targetKeyword}" (${brief.source}, vol=${brief.volume}, kd=${brief.kd})`);

    // 3. Sister-site internal links
    const briefEmbed = await embedText(`${brief.targetKeyword}\n${brief.outline.join("\n")}`, env.VOYAGE_API_KEY);
    const repo = new ContentIndexRepo(db);
    const sisterHits = await repo.findSimilarOnOtherSites({
      embedding: briefEmbed,
      excludeSiteId: opts.siteId,
      limit: 2,
      maxDistance: 0.45,
    });
    console.log(`[pipeline] sister links: ${sisterHits.length} (${sisterHits.map((h) => h.url).join(", ")})`);

    // 4. Write article via claude-code
    const article = await runWriteArticle({
      brief,
      sisterLinks: sisterHits.map((h) => ({ url: h.url, title: h.title })),
      brandVoice: site.brandVoice,
      siteName: site.name,
      domain: site.domain,
    });

    // 5. Render with adapter
    const rendered = adapter.renderFile({
      brief,
      geo: { ledeAnswer: article.ledeAnswer, quickFacts: article.quickFacts },
      body: article.body,
      sisterLinks: sisterHits.map((h) => ({ url: h.url, title: h.title })),
    });

    // 6. Publish via git
    const pat = process.env[`GH_PAT_${opts.siteId.replace(/-/g, "_").toUpperCase()}`];
    const repoUrl = pat
      ? site.repoUrl.replace("git@github.com-barelezra10:", `https://${pat}@github.com/`).replace(":", "/").replace(".git", ".git")
      : site.repoUrl;
    const publisher = new GitPublisher({ workspaceDir: env.WORKSPACE_REPOS_DIR });
    const publishResult = await publisher.publish({
      siteId: site.id,
      repoUrl: site.repoUrl, // use SSH alias; PAT path only kicks in for HTTPS-required envs (Railway)
      branch: site.branch,
      relativeFilePath: rendered.path,
      fileContent: rendered.content,
      commitMessage: `feat(seo-forge): publish "${brief.targetKeyword}"`,
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    console.log(`[pipeline] published ${rendered.path} as commit ${publishResult.commitSha}`);

    // 7. Update content_index for the new article
    const articleUrl = `https://${site.domain}/${rendered.slug}`;
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
```

- [ ] **Step 2: Add pipeline test (mostly a smoke test — pieces are tested individually)**

Create `worker/src/pipeline/pipeline.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("pipeline", () => {
  it("module loads without throwing", async () => {
    const mod = await import("./pipeline");
    expect(typeof mod.runPipeline).toBe("function");
  });
});
```

(End-to-end pipeline test is in Task 19.)

- [ ] **Step 3: Update `worker/src/cli.ts` with `publish` command**

```typescript
import { Command } from "commander";
import { runPipeline } from "./pipeline/pipeline.js";

const program = new Command();
program.name("seo-forge").description("SEO Forge worker CLI").version("0.0.1");

program
  .command("ping")
  .action(() => {
    console.log("pong");
  });

program
  .command("publish")
  .description("Run keyword research → write → publish pipeline for a single site")
  .requiredOption("--site <id>", "Site ID (e.g. mca-guide)")
  .action(async (opts: { site: string }) => {
    try {
      const result = await runPipeline({ siteId: opts.site });
      console.log("\n[publish] success:");
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    } catch (err) {
      console.error("\n[publish] failed:", err);
      process.exit(1);
    }
  });

program.parseAsync();
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add worker/src/pipeline/ worker/src/cli.ts
git commit -m "feat(worker): end-to-end pipeline + CLI publish command"
```

---

## Task 19: End-to-end smoke test

**Files:** none (manual test)

This is the Phase 1A exit gate. Bar runs the CLI; an article appears live.

- [ ] **Step 1: Confirm prerequisites**

Verify each:
- [ ] `claude --version` succeeds and shows you're logged in
- [ ] Postgres is running (`docker compose ps`)
- [ ] `sites` row for `mca-guide` has correct `repoUrl` and `contentDir`
- [ ] `content_index` has rows for `mca-guide` (from Task 10)
- [ ] `.env` has all required keys (DATABASE_URL, VOYAGE_API_KEY, AHREFS_API_KEY, GSC_REFRESH_TOKEN, GSC_CLIENT_ID, GSC_CLIENT_SECRET, ANTHROPIC_API_KEY, GH_PAT_MCA_GUIDE)
- [ ] SSH alias `github.com-barelezra10` works and has push access to the MCA Guide repo

- [ ] **Step 2: Dry-run with verbose logging**

```bash
pnpm cli publish --site mca-guide
```

Watch the log for each pipeline stage:
1. `[pipeline] picked keyword: "..."`
2. `[pipeline] sister links: N (...)`
3. (claude-code session output — silent until done, ~5-10 min)
4. `[pipeline] published content/articles/<slug>.mdx as commit <sha>`
5. `[publish] success:` JSON

- [ ] **Step 3: Verify the commit hit GitHub**

```bash
cd workspace/repos/mca-guide && git log --oneline -1
```

Expected: latest commit is the SEO Forge publish commit.

- [ ] **Step 4: Verify the article is live**

Wait for the MCA Guide deploy to finish (Cloudflare/Railway), then visit `https://themcaguide.com/<slug>` in a browser.

Expected: article renders with frontmatter, lede, Quick Facts box, body, internal links, and JSON-LD script tag in source.

- [ ] **Step 5: Verify content_index was updated**

```bash
docker compose exec postgres psql -U seo_forge -d seo_forge -c "SELECT site_id, url, title FROM content_index WHERE site_id = 'mca-guide' ORDER BY last_indexed DESC LIMIT 3;"
```

Expected: the new article is the most recent row.

- [ ] **Step 6: Tag the milestone**

```bash
git tag phase-1a-shipped
git push origin phase-1a-shipped
```

---

## Self-Review

**Spec coverage check:**
- ✅ Postgres + pgvector — Tasks 2, 4
- ✅ jobs / sites / content_index / auth_status schema — Task 4
- ✅ MCA Guide site adapter — Task 14
- ✅ git publisher — Task 15
- ✅ Claude Code subscription auth (subprocess) — Task 11
- ✅ Voyage embeddings — Task 7
- ✅ Ahrefs + GSC integration — Tasks 12, 13
- ✅ Internal-link mechanic with quota (max 2) — Task 18 (pipeline.ts)
- ✅ GEO layer (lede + quick facts + JSON-LD) — Task 14 (adapter), Task 17 (writer prompt)
- ✅ End-to-end article on themcaguide.com — Task 19

**Spec items deferred to Plan 1B:**
- Dashboard (web/) and 4 views
- Cron orchestrator + jobs queue worker loop
- Railway deploy + Volume mount for /root/.claude
- API fallback path
- llms.txt rebuild
- Per-site kill switch UI (DB column exists; no UI yet)
- Slack pings
- 3-failure auto-brake

**Open questions captured in spec section 13 — what this plan resolves:**
- ✅ Embedding model: Voyage `voyage-3-lite` (1024 dim) — Task 7
- (Deferred) Dashboard auth: handled in Plan 1B
- (Deferred) Job transcript storage: handled in Plan 1B
- (Pending Bar) Repo rename `-seo-forge` → `seo-forge`
- (Pending Bar at execution time) MCA Guide repo URL + content directory

**Type consistency:** `RenderInput`, `ArticleBrief`, `GeoLayer`, `SiteAdapter`, `Candidate`, `KeywordBrief`, `ArticleResponse` are defined once and imported elsewhere. `mcaGuideAdapter.contentDir` (Task 14) matches `site.contentDir` from DB seed (Task 5).

**Placeholder scan:** No "TBD", "TODO", or "implement later" outside the explicit deferred-to-Plan-1B section. Every code step shows actual code. Every test shows actual assertions.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-seo-forge-phase-1a.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a 19-task plan because each task is self-contained.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
