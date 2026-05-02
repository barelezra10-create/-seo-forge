# SEO Forge Phase 1B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hosted Next.js dashboard at `seo-forge-production.up.railway.app` that lets Bar see GSC + Ahrefs analytics for all his sites, browse published articles + Claude transcripts, view auto-generated SEO opportunities, and trigger publishes from the UI. A cron orchestrator on the worker auto-publishes daily and refreshes analytics nightly.

**Architecture:** Add a `web/` Next.js 16 workspace to the existing monorepo. Migrate Postgres from local Postgres.app to Railway Postgres. New tables for cached analytics (`gsc_snapshot`, `ahrefs_snapshot`, `opportunities`). Worker grows a cron loop that wakes on a schedule and dispatches: publish jobs (per site), GSC pull, Ahrefs pull, opportunities recompute. Web reads from the same Postgres via Drizzle.

**Tech Stack:** Next.js 16 (App Router, RSC), Tailwind CSS v4, shadcn/ui (cards, tables, sparklines), Drizzle ORM, Postgres + pgvector (Railway-hosted), node-cron in the worker, Recharts for sparklines, hardcoded-password auth via JWT cookie.

---

## Prerequisites Bar provides before execution

1. **Railway Postgres provisioned** — already exists in his Railway project (or create one and capture `DATABASE_URL`)
2. **`DASHBOARD_PASSWORD`** chosen and saved in Railway env vars (single string, served behind HTTPS, 16+ chars recommended)
3. **All keys from Phase 1A** (`VOYAGE_API_KEY`, `AHREFS_API_KEY`, `GSC_*`, `ANTHROPIC_API_KEY`, `GH_PAT_MCA_GUIDE`) added as Railway env vars on both web and worker services
4. **Local `claude-code` CLI auth** — same as Phase 1A; will need to be synced to a Railway Volume on the worker. Per the spec, scripts/sync-claude-auth.sh handles this. (Initial sync = manual; refresh = automated cron in worker)

---

## File Structure

```
seo-forge/
├── package.json                                  # add concurrent dev script
├── pnpm-workspace.yaml                           # add "web"
├── shared/
│   └── src/db/
│       ├── schema.ts                             # add gsc_snapshot, ahrefs_snapshot, opportunities tables
│       └── migrations/                           # new migration generated
├── worker/
│   └── src/
│       ├── orchestrator/
│       │   ├── cron.ts                           # node-cron entry, schedules all repeating jobs
│       │   ├── cron.test.ts
│       │   ├── publish-cron.ts                   # daily auto-publish per site
│       │   ├── gsc-snapshot-cron.ts              # nightly GSC pull
│       │   ├── ahrefs-snapshot-cron.ts           # nightly Ahrefs pull
│       │   └── opportunities-cron.ts             # recompute opportunities after data refresh
│       ├── data/
│       │   ├── ahrefs-extras.ts                  # backlinks, organic-keywords, organic-pages endpoints
│       │   └── ahrefs-extras.test.ts
│       └── opportunities/
│           ├── striking-distance.ts              # GSC striking-distance opportunities
│           ├── traffic-decline.ts                # pages with declining clicks
│           ├── content-gap.ts                    # cross-site link gaps from content_index
│           ├── opportunities.ts                  # facade — runs all detectors, writes to DB
│           └── opportunities.test.ts
└── web/                                          # NEW workspace
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── postcss.config.mjs
    ├── tailwind.config.ts
    ├── components.json                           # shadcn config
    ├── public/
    └── src/
        ├── app/
        │   ├── layout.tsx                        # root layout with sidebar
        │   ├── page.tsx                          # redirect to /overview
        │   ├── (auth)/
        │   │   ├── login/page.tsx                # password form
        │   │   └── api/login/route.ts            # POST: verify pwd, set JWT cookie
        │   ├── overview/page.tsx                 # all-sites at-a-glance
        │   ├── sites/
        │   │   ├── page.tsx                      # sites list
        │   │   └── [siteId]/
        │   │       ├── page.tsx                  # per-site detail
        │   │       └── kill-switch/route.ts      # POST: toggle
        │   ├── articles/
        │   │   ├── page.tsx                      # all articles, filter+search
        │   │   └── [siteId]/[slug]/page.tsx      # one article + transcript
        │   ├── opportunities/
        │   │   ├── page.tsx                      # actionable list
        │   │   └── [id]/act/route.ts             # POST: trigger publish from opportunity
        │   ├── jobs/
        │   │   ├── page.tsx                      # live + recent jobs
        │   │   └── [jobId]/page.tsx              # one job + full log
        │   ├── api/
        │   │   ├── publish/route.ts              # POST: enqueue publish job for a site
        │   │   ├── refresh-analytics/route.ts    # POST: force GSC/Ahrefs pull now
        │   │   └── sites/[siteId]/route.ts       # PATCH: kill switch, auto_publish toggle
        │   └── globals.css
        ├── components/
        │   ├── layout/
        │   │   ├── Sidebar.tsx
        │   │   └── TopBar.tsx
        │   ├── overview/
        │   │   ├── SiteCard.tsx                  # one card per site on overview
        │   │   └── Sparkline.tsx                 # recharts wrapper
        │   ├── analytics/
        │   │   ├── GscQueriesTable.tsx
        │   │   ├── AhrefsKeywordsTable.tsx
        │   │   └── BacklinksList.tsx
        │   ├── opportunities/
        │   │   └── OpportunityRow.tsx
        │   ├── jobs/
        │   │   └── JobRow.tsx
        │   └── ui/                               # shadcn primitives
        │       ├── button.tsx
        │       ├── card.tsx
        │       ├── table.tsx
        │       └── ...
        ├── lib/
        │   ├── auth.ts                           # JWT helpers
        │   ├── db.ts                             # createDb wrapped with cached() for RSC
        │   ├── queries/                          # all data-access fns used by RSC
        │   │   ├── overview.ts
        │   │   ├── sites.ts
        │   │   ├── articles.ts
        │   │   ├── opportunities.ts
        │   │   └── jobs.ts
        │   └── utils.ts                          # cn() + formatters
        └── middleware.ts                         # auth gate — redirects to /login if no JWT
```

**Decomposition rationale:**
- `web/src/app/(auth)/` — login is the only public route; everything else gated by middleware.
- `web/src/lib/queries/` — all DB reads collected in one folder; pages stay declarative. Each query function returns plain JSON-serializable data.
- `worker/src/orchestrator/` — cron logic separated from job handlers. The cron file does scheduling; per-job-type files do the work.
- `worker/src/opportunities/` — each detector is its own small file; `opportunities.ts` is the facade that runs them all and writes to the DB. Easy to add new detectors later (`broken-links.ts`, `competitor-gap.ts`).
- Worker NEVER imports from `web/`. Web reads DB and may enqueue jobs by INSERTing rows; the worker's cron picks them up. No HTTP between them.

---

## Phase ordering (within this plan)

The 35 tasks are roughly ordered so each ~5-task chunk gives Bar something visible/usable:

- **Tasks 1-6: Infrastructure** — Railway Postgres migration, new schema, web/ scaffold, password auth working, sidebar shell visible
- **Tasks 7-13: Read-only views** — Sites list, per-site detail, articles index, article detail with transcript, jobs list, jobs detail. Bar can browse what already exists.
- **Tasks 14-20: Analytics integration** — GSC + Ahrefs snapshot cron, nightly cache, overview sparklines, per-site analytics widgets. Numbers start showing up.
- **Tasks 21-26: Opportunities** — Striking distance, traffic decline, content gap detectors. Opportunities tab populated. One-click trigger.
- **Tasks 27-31: Orchestration** — Cron auto-publish daily, manual trigger from UI, kill switch toggle, transcript capture for articles, job log viewer.
- **Tasks 32-35: Deploy** — Railway service config, env propagation, Claude auth sync, end-to-end smoke test from Bar's phone.

After Task 35: Phase 1B is shipped. https://seo-forge-production.up.railway.app loads the dashboard, shows real data, lets Bar publish articles from his phone.

---

## Task 1: Provision Railway Postgres and migrate local data

**Files:**
- Create: `scripts/migrate-to-railway.sh`
- Modify: `.env`, `.env.example`

- [ ] **Step 1: Create Railway Postgres service**

In the Railway dashboard for the existing `seo-forge-production` project: click **+ New** → **Database** → **PostgreSQL**. Wait ~1 minute for provision. Copy the `DATABASE_URL` from the database service's Variables tab (use the public/external one, not the private — we need to migrate FROM local).

- [ ] **Step 2: Save the new URL to local `.env` as a secondary var**

```
RAILWAY_DATABASE_URL=postgres://postgres:<password>@<host>.railway.app:<port>/railway
```

Keep the existing `DATABASE_URL=postgres://seo_forge:seo_forge@localhost:5432/seo_forge` (we'll swap it after migration).

- [ ] **Step 3: Enable pgvector on the Railway DB**

```bash
PGURL="$RAILWAY_DATABASE_URL" /Applications/Postgres.app/Contents/Versions/latest/bin/psql "$PGURL" -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Expected: `CREATE EXTENSION` (or notice that it already exists).

- [ ] **Step 4: Apply Drizzle migrations to Railway DB**

```bash
DATABASE_URL="$RAILWAY_DATABASE_URL" pnpm --filter @seo-forge/shared db:migrate
```

Expected: `Migrations applied.`

- [ ] **Step 5: Re-seed sites table on Railway DB**

```bash
DATABASE_URL="$RAILWAY_DATABASE_URL" pnpm --filter @seo-forge/shared db:seed
```

Expected: `Seeded mca-guide site.`

- [ ] **Step 6: Create `scripts/migrate-to-railway.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ -z "${RAILWAY_DATABASE_URL:-}" ]; then
  echo "ERROR: RAILWAY_DATABASE_URL must be set" >&2
  exit 1
fi

LOCAL_URL="postgres://seo_forge:seo_forge@localhost:5432/seo_forge"
PG_BIN="/Applications/Postgres.app/Contents/Versions/latest/bin"

echo "Dumping content_index from local..."
"$PG_BIN/pg_dump" --data-only --table=content_index "$LOCAL_URL" > /tmp/content_index.sql

echo "Dumping sites from local..."
"$PG_BIN/pg_dump" --data-only --table=sites "$LOCAL_URL" > /tmp/sites.sql

echo "Loading sites to Railway..."
"$PG_BIN/psql" "$RAILWAY_DATABASE_URL" -c "TRUNCATE sites CASCADE;"
"$PG_BIN/psql" "$RAILWAY_DATABASE_URL" < /tmp/sites.sql

echo "Loading content_index to Railway..."
"$PG_BIN/psql" "$RAILWAY_DATABASE_URL" -c "TRUNCATE content_index;"
"$PG_BIN/psql" "$RAILWAY_DATABASE_URL" < /tmp/content_index.sql

echo "Verifying counts..."
LOCAL_COUNT=$("$PG_BIN/psql" -tA "$LOCAL_URL" -c "SELECT COUNT(*) FROM content_index")
REMOTE_COUNT=$("$PG_BIN/psql" -tA "$RAILWAY_DATABASE_URL" -c "SELECT COUNT(*) FROM content_index")
echo "  local:  $LOCAL_COUNT"
echo "  remote: $REMOTE_COUNT"

if [ "$LOCAL_COUNT" != "$REMOTE_COUNT" ]; then
  echo "ERROR: counts don't match" >&2
  exit 1
fi
echo "Migration complete."
```

- [ ] **Step 7: Run the migration**

```bash
chmod +x scripts/migrate-to-railway.sh
./scripts/migrate-to-railway.sh
```

Expected: counts match, ~226 rows for `mca-guide` in `content_index` on Railway.

- [ ] **Step 8: Swap `.env` to use Railway by default**

Edit `.env`: replace `DATABASE_URL=postgres://seo_forge:seo_forge@localhost:5432/seo_forge` with `DATABASE_URL=$RAILWAY_DATABASE_URL` value (paste the actual URL). Keep `RAILWAY_DATABASE_URL=` line as well for the migration script.

- [ ] **Step 9: Verify by re-running shared tests**

```bash
pnpm --filter @seo-forge/shared test
```

Expected: 8 passing. (Tests don't actually connect, but typecheck + schema parse must work.)

- [ ] **Step 10: Commit**

```bash
git add scripts/migrate-to-railway.sh .env.example
git commit -m "chore: migrate Postgres from local Postgres.app to Railway"
```

(Don't commit `.env` — it's gitignored.)

---

## Task 2: Add new analytics tables to Drizzle schema

**Files:**
- Modify: `shared/src/db/schema.ts`
- Test: `shared/src/db/schema.test.ts`

- [ ] **Step 1: Write the failing test for new tables**

Add to `shared/src/db/schema.test.ts`:

```typescript
import { gscSnapshot, ahrefsSnapshot, opportunities } from "./schema";

describe("analytics schema", () => {
  it("gscSnapshot has expected columns", () => {
    expect(gscSnapshot.siteId.name).toBe("site_id");
    expect(gscSnapshot.snapshotDate.name).toBe("snapshot_date");
    expect(gscSnapshot.totalClicks.name).toBe("total_clicks");
    expect(gscSnapshot.totalImpressions.name).toBe("total_impressions");
    expect(gscSnapshot.payload.name).toBe("payload");
  });
  it("ahrefsSnapshot has expected columns", () => {
    expect(ahrefsSnapshot.siteId.name).toBe("site_id");
    expect(ahrefsSnapshot.domainRating.name).toBe("domain_rating");
    expect(ahrefsSnapshot.refDomains.name).toBe("ref_domains");
    expect(ahrefsSnapshot.payload.name).toBe("payload");
  });
  it("opportunities has expected columns", () => {
    expect(opportunities.siteId.name).toBe("site_id");
    expect(opportunities.type.name).toBe("type");
    expect(opportunities.status.name).toBe("status");
    expect(opportunities.payload.name).toBe("payload");
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @seo-forge/shared test
```

- [ ] **Step 3: Add tables to `shared/src/db/schema.ts`** (append after `authStatus`)

```typescript
import { date, doublePrecision } from "drizzle-orm/pg-core";

export const gscSnapshot = pgTable(
  "gsc_snapshot",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    snapshotDate: date("snapshot_date").notNull(),
    totalClicks: integer("total_clicks").notNull().default(0),
    totalImpressions: integer("total_impressions").notNull().default(0),
    avgCtr: doublePrecision("avg_ctr").notNull().default(0),
    avgPosition: doublePrecision("avg_position").notNull().default(0),
    /** JSON: { topQueries: [...], topPages: [...], strikingDistance: [...] } */
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteDateIdx: uniqueIndex("gsc_snapshot_site_date_idx").on(t.siteId, t.snapshotDate),
  }),
);

export const ahrefsSnapshot = pgTable(
  "ahrefs_snapshot",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    snapshotDate: date("snapshot_date").notNull(),
    domainRating: doublePrecision("domain_rating").notNull().default(0),
    refDomains: integer("ref_domains").notNull().default(0),
    backlinks: integer("backlinks").notNull().default(0),
    organicKeywords: integer("organic_keywords").notNull().default(0),
    organicTraffic: integer("organic_traffic").notNull().default(0),
    /** JSON: { topPages: [...], topKeywords: [...], newBacklinks: [...] } */
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteDateIdx: uniqueIndex("ahrefs_snapshot_site_date_idx").on(t.siteId, t.snapshotDate),
  }),
);

export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "open",
  "acted_on",
  "dismissed",
  "expired",
]);

export const opportunities = pgTable(
  "opportunities",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    /** "striking_distance" | "traffic_decline" | "content_gap" | "broken_link" */
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: opportunityStatusEnum("status").notNull().default("open"),
    /** JSON: type-specific data (keyword, position, page, etc.) */
    payload: jsonb("payload").notNull().default({}),
    actedJobId: bigint("acted_job_id", { mode: "number" }),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    actedAt: timestamp("acted_at", { withTimezone: true }),
  },
  (t) => ({
    siteStatusIdx: index("opportunities_site_status_idx").on(t.siteId, t.status),
  }),
);
```

(Add `date`, `doublePrecision` to the existing `drizzle-orm/pg-core` imports at the top.)

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter @seo-forge/shared test
```

Expected: 11 passing (8 + 3 new).

- [ ] **Step 5: Generate migration**

```bash
DATABASE_URL="$RAILWAY_DATABASE_URL" pnpm --filter @seo-forge/shared db:generate
```

Expected: a new `0001_*.sql` file in `shared/src/db/migrations/`.

- [ ] **Step 6: Apply migration to Railway DB**

```bash
DATABASE_URL="$RAILWAY_DATABASE_URL" pnpm --filter @seo-forge/shared db:migrate
```

Expected: `Migrations applied.`

- [ ] **Step 7: Verify tables exist**

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql "$RAILWAY_DATABASE_URL" -c "\dt"
```

Expected: includes `gsc_snapshot`, `ahrefs_snapshot`, `opportunities`.

- [ ] **Step 8: Commit**

```bash
git add shared/src/db/schema.ts shared/src/db/schema.test.ts shared/src/db/migrations/
git commit -m "feat(shared): add gsc_snapshot, ahrefs_snapshot, opportunities tables"
```

---

## Task 3: Initialize `web/` Next.js workspace

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/postcss.config.mjs`, `web/tailwind.config.ts`, `web/components.json`, `web/.gitignore`, `web/src/app/layout.tsx`, `web/src/app/page.tsx`, `web/src/app/globals.css`
- Modify: `pnpm-workspace.yaml`, root `package.json`

- [ ] **Step 1: Add `"web"` to `pnpm-workspace.yaml`**

```yaml
packages:
  - "shared"
  - "worker"
  - "web"
```

- [ ] **Step 2: Create `web/package.json`**

```json
{
  "name": "@seo-forge/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@seo-forge/shared": "workspace:*",
    "@radix-ui/react-slot": "1.1.0",
    "class-variance-authority": "0.7.0",
    "clsx": "2.1.1",
    "drizzle-orm": "0.36.0",
    "jose": "5.9.6",
    "lucide-react": "0.460.0",
    "next": "16.0.0",
    "postgres": "3.4.5",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "recharts": "2.13.3",
    "tailwind-merge": "2.5.5"
  },
  "devDependencies": {
    "@types/node": "22.9.0",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "@vitejs/plugin-react": "4.3.4",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.49",
    "tailwindcss": "4.0.0",
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "types": ["node"],
    "moduleResolution": "Bundler",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["src/**/*", "next-env.d.ts", ".next/types/**/*.ts"]
}
```

- [ ] **Step 4: Create `web/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { typedRoutes: true },
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 5: Create `web/postcss.config.mjs`**

```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

(Note: Tailwind v4 uses a separate `@tailwindcss/postcss` plugin. Add to devDeps if not already.)

- [ ] **Step 6: Create `web/src/app/globals.css`**

```css
@import "tailwindcss";

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 4%;
    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 46%;
    --border: 240 6% 90%;
    --primary: 220 89% 56%;
    --primary-foreground: 0 0% 100%;
  }
  body {
    @apply bg-background text-foreground;
    font-family: system-ui, -apple-system, sans-serif;
  }
}
```

- [ ] **Step 7: Create `web/src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Forge",
  description: "SEO automation control plane",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Create `web/src/app/page.tsx`** (temporary placeholder; redirects to /overview later)

```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">SEO Forge</h1>
        <p className="text-muted-foreground">Phase 1B scaffold up.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 9: Create `web/.gitignore`**

```
.next/
node_modules/
out/
dist/
*.log
```

- [ ] **Step 10: Update root `package.json`** to add `dev:web` and `dev:worker` shortcuts

Add to `scripts`:
```json
"dev:web": "pnpm --filter @seo-forge/web dev",
"dev:worker": "pnpm --filter @seo-forge/worker cli",
```

- [ ] **Step 11: Install**

```bash
cd /Users/baralezrah/seo-forge && pnpm install
```

- [ ] **Step 12: Smoke-test the dev server**

```bash
pnpm dev:web
```

Open http://localhost:3000 — should show "SEO Forge / Phase 1B scaffold up."

Stop with Ctrl+C.

- [ ] **Step 13: Commit**

```bash
git add web/ pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "feat(web): initialize Next.js 16 dashboard scaffold"
```

---

## Task 4: Add hardcoded-password auth + middleware

**Files:**
- Create: `web/src/lib/auth.ts`, `web/src/middleware.ts`, `web/src/app/(auth)/login/page.tsx`, `web/src/app/(auth)/api/login/route.ts`
- Modify: `.env`, `.env.example`, `shared/src/env.ts`, `shared/src/env.test.ts`

- [ ] **Step 1: Add `DASHBOARD_PASSWORD` and `DASHBOARD_SESSION_SECRET` to env schema**

In `shared/src/env.ts` add to `EnvSchema`:
```typescript
DASHBOARD_PASSWORD: z.string().min(8),
DASHBOARD_SESSION_SECRET: z.string().min(32),
```

Update `shared/src/env.test.ts` fixtures to include both. The "rejects DATABASE_URL with non-postgres scheme" and "defaults WORKSPACE_REPOS_DIR if absent" tests both need these fields added to their input objects.

Update `.env.example`:
```
DASHBOARD_PASSWORD=
DASHBOARD_SESSION_SECRET=
```

Update local `.env` with real values:
```
DASHBOARD_PASSWORD=<pick a strong 16+ char password>
DASHBOARD_SESSION_SECRET=<openssl rand -hex 32>
```

Run shared tests, all pass:
```bash
pnpm --filter @seo-forge/shared test
```

Expected: 11 passing.

- [ ] **Step 2: Create `web/src/lib/auth.ts`**

```typescript
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "seo-forge-session";
const SESSION_TTL_DAYS = 30;

function getSecret(): Uint8Array {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("DASHBOARD_SESSION_SECRET must be set (>=32 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function issueSession(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_DAYS * 24 * 60 * 60;
  return await new SignJWT({ sub: "bar" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
```

- [ ] **Step 3: Create `web/src/middleware.ts`**

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Create `web/src/app/(auth)/login/page.tsx`**

```tsx
export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted">
      <form
        action="/api/login"
        method="POST"
        className="bg-white rounded-lg shadow-sm border p-8 w-full max-w-sm"
      >
        <h1 className="text-2xl font-bold mb-1">SEO Forge</h1>
        <p className="text-sm text-muted-foreground mb-6">Enter password</p>
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          className="w-full border rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          className="w-full bg-primary text-primary-foreground rounded-md px-3 py-2 font-medium hover:opacity-90"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Create `web/src/app/(auth)/api/login/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { issueSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(req: Request) {
  const formData = await req.formData();
  const password = String(formData.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || password !== expected) {
    const url = new URL(req.url);
    url.pathname = "/login";
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, { status: 303 });
  }

  const token = await issueSession();
  const url = new URL(req.url);
  url.pathname = "/overview";
  url.search = "";
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
```

- [ ] **Step 6: Smoke test**

```bash
pnpm dev:web
```

Open http://localhost:3000 — should redirect to /login. Type the wrong password, get redirected back with `?error=1`. Type the right one, redirect to /overview (which 404s for now — that's Task 5).

- [ ] **Step 7: Commit**

```bash
git add web/src/ shared/src/env.ts shared/src/env.test.ts .env.example
git commit -m "feat(web): hardcoded-password auth with JWT cookie + middleware gate"
```

---

## Task 5: Build sidebar layout shell

**Files:**
- Create: `web/src/lib/utils.ts`, `web/src/components/layout/Sidebar.tsx`, `web/src/components/layout/TopBar.tsx`, `web/src/components/ui/button.tsx`, `web/src/components/ui/card.tsx`
- Modify: `web/src/app/layout.tsx`, `web/src/app/page.tsx`

- [ ] **Step 1: Create `web/src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercent(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}
```

- [ ] **Step 2: Create `web/src/components/ui/button.tsx`** (minimal shadcn-style button)

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        outline: "border border-border bg-white hover:bg-muted",
        ghost: "hover:bg-muted",
        destructive: "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
```

- [ ] **Step 3: Create `web/src/components/ui/card.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-lg border bg-white shadow-sm", className)} {...props} />
  ),
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pb-3", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-semibold tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-3", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";
```

- [ ] **Step 4: Create `web/src/components/layout/Sidebar.tsx`**

```tsx
import Link from "next/link";
import { LayoutGrid, Globe, FileText, TrendingUp, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutGrid },
  { href: "/sites", label: "Sites", icon: Globe },
  { href: "/articles", label: "Articles", icon: FileText },
  { href: "/opportunities", label: "Opportunities", icon: TrendingUp },
  { href: "/jobs", label: "Jobs", icon: ListChecks },
] as const;

export function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="w-56 shrink-0 border-r bg-white">
      <div className="px-6 py-5 border-b">
        <Link href="/overview" className="text-lg font-bold tracking-tight">
          SEO Forge
        </Link>
      </div>
      <nav className="p-3">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
                active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 5: Create `web/src/components/layout/TopBar.tsx`**

```tsx
export function TopBar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );
}
```

- [ ] **Step 6: Update `web/src/app/layout.tsx`** to include sidebar (only when authed; login layout overrides via route group)

```tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Forge",
  description: "SEO automation control plane",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "/";
  const isAuthLayout = pathname === "/login";

  return (
    <html lang="en">
      <body>
        {isAuthLayout ? (
          children
        ) : (
          <div className="min-h-screen flex">
            <Sidebar pathname={pathname} />
            <div className="flex-1 flex flex-col bg-muted/30">{children}</div>
          </div>
        )}
      </body>
    </html>
  );
}
```

For `pathname` to be available in RSC, add this to `web/src/middleware.ts` BEFORE the auth check (in Task 4 file), inside the middleware function:

```typescript
const headers = new Headers(req.headers);
headers.set("x-pathname", req.nextUrl.pathname);
```

And pass `headers` in the `NextResponse.next({ request: { headers } })` call. (Edit middleware.ts accordingly.)

- [ ] **Step 7: Update `web/src/app/page.tsx`** to redirect to /overview

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/overview");
}
```

- [ ] **Step 8: Smoke test**

```bash
pnpm dev:web
```

Sign in. You should see a sidebar with 5 nav items. Each item 404s for now (that's the next tasks).

- [ ] **Step 9: Commit**

```bash
git add web/src/ pnpm-lock.yaml
git commit -m "feat(web): sidebar layout shell with shadcn-style ui primitives"
```

---

## Task 6: Build queries module + sites list

**Files:**
- Create: `web/src/lib/db.ts`, `web/src/lib/queries/sites.ts`, `web/src/app/sites/page.tsx`, `web/src/app/overview/page.tsx`

- [ ] **Step 1: Create `web/src/lib/db.ts`**

```typescript
import { createDb, type Db } from "@seo-forge/shared";

let _db: Db | null = null;

export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const { db } = createDb(url);
  _db = db;
  return db;
}
```

- [ ] **Step 2: Create `web/src/lib/queries/sites.ts`**

```typescript
import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";

export type SiteSummary = {
  id: string;
  name: string;
  domain: string;
  killSwitch: boolean;
  autoPublish: boolean;
  articleCount: number;
};

export async function getAllSites(): Promise<SiteSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: tables.sites.id,
      name: tables.sites.name,
      domain: tables.sites.domain,
      killSwitch: tables.sites.killSwitch,
      autoPublish: tables.sites.autoPublish,
      articleCount: sql<number>`(SELECT COUNT(*)::int FROM ${tables.contentIndex} WHERE site_id = ${tables.sites.id})`,
    })
    .from(tables.sites)
    .orderBy(tables.sites.name);
  return rows;
}

export async function getSite(siteId: string) {
  const db = getDb();
  const [site] = await db.select().from(tables.sites).where(eq(tables.sites.id, siteId));
  return site ?? null;
}
```

- [ ] **Step 3: Create `web/src/app/sites/page.tsx`**

```tsx
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { getAllSites } from "@/lib/queries/sites";
import { formatNumber } from "@/lib/utils";

export default async function SitesPage() {
  const sites = await getAllSites();
  return (
    <>
      <TopBar title="Sites" />
      <main className="p-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sites.map((site) => (
          <Link key={site.id} href={`/sites/${site.id}`}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{site.name}</h3>
                  {site.killSwitch && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                      paused
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-4">{site.domain}</p>
                <div className="text-sm">
                  <span className="font-medium">{formatNumber(site.articleCount)}</span>{" "}
                  <span className="text-muted-foreground">articles indexed</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Create `web/src/app/overview/page.tsx`** (basic version — analytics added in Task 14)

```tsx
import { TopBar } from "@/components/layout/TopBar";
import { getAllSites } from "@/lib/queries/sites";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

export default async function OverviewPage() {
  const sites = await getAllSites();
  const totalArticles = sites.reduce((sum, s) => sum + s.articleCount, 0);
  return (
    <>
      <TopBar title="Overview" />
      <main className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Sites</p>
              <p className="text-3xl font-bold">{sites.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Articles indexed</p>
              <p className="text-3xl font-bold">{formatNumber(totalArticles)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Articles this month</p>
              <p className="text-3xl font-bold">—</p>
              <p className="text-xs text-muted-foreground mt-1">populated in Task 14</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Smoke test**

```bash
pnpm dev:web
```

Sign in. /overview shows 1 site, 226 articles. /sites shows MCA Guide card with link.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/ web/src/app/sites/ web/src/app/overview/
git commit -m "feat(web): db wrapper, sites query, overview + sites pages"
```

---

## Task 7: Per-site detail page

**Files:**
- Create: `web/src/app/sites/[siteId]/page.tsx`, `web/src/lib/queries/articles.ts`

- [ ] **Step 1: Add `getRecentArticles` to `web/src/lib/queries/articles.ts`**

```typescript
import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { desc, eq, and, gte, sql } from "drizzle-orm";

export type ArticleRow = {
  id: number;
  siteId: string;
  url: string;
  slug: string;
  title: string;
  publishedAt: Date | null;
};

export async function getRecentArticles(siteId: string, limit = 20): Promise<ArticleRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: tables.contentIndex.id,
      siteId: tables.contentIndex.siteId,
      url: tables.contentIndex.url,
      slug: tables.contentIndex.slug,
      title: tables.contentIndex.title,
      publishedAt: tables.contentIndex.publishedAt,
    })
    .from(tables.contentIndex)
    .where(eq(tables.contentIndex.siteId, siteId))
    .orderBy(desc(tables.contentIndex.lastIndexed))
    .limit(limit);
  return rows;
}

export async function getArticleCountThisMonth(siteId: string): Promise<number> {
  const db = getDb();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const result = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int as count
    FROM content_index
    WHERE site_id = ${siteId} AND last_indexed >= ${start.toISOString()}
  `);
  return result[0]?.count ?? 0;
}
```

- [ ] **Step 2: Create `web/src/app/sites/[siteId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSite } from "@/lib/queries/sites";
import { getRecentArticles, getArticleCountThisMonth } from "@/lib/queries/articles";

export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!site) notFound();

  const [articles, monthlyCount] = await Promise.all([
    getRecentArticles(siteId, 20),
    getArticleCountThisMonth(siteId),
  ]);

  return (
    <>
      <TopBar
        title={site.name}
        actions={
          <>
            <form action="/api/publish" method="POST">
              <input type="hidden" name="siteId" value={siteId} />
              <Button type="submit" disabled={site.killSwitch}>
                Publish now
              </Button>
            </form>
            <form action={`/api/sites/${siteId}`} method="POST">
              <input type="hidden" name="_method" value="PATCH" />
              <input type="hidden" name="killSwitch" value={String(!site.killSwitch)} />
              <Button type="submit" variant={site.killSwitch ? "default" : "destructive"} size="sm">
                {site.killSwitch ? "Unpause" : "Pause"}
              </Button>
            </form>
          </>
        }
      />
      <main className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Domain</p>
              <a href={`https://${site.domain}`} target="_blank" className="font-medium text-primary hover:underline">
                {site.domain}
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Articles this month</p>
              <p className="text-3xl font-bold">{monthlyCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Auto-publish</p>
              <p className="font-medium">{site.autoPublish ? "On" : "Off"}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent articles</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {articles.map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between">
                  <div>
                    <Link
                      href={`/articles/${siteId}/${a.slug}`}
                      className="font-medium hover:underline"
                    >
                      {a.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{a.url}</p>
                  </div>
                  <a href={a.url} target="_blank" className="text-xs text-primary hover:underline">
                    open ↗
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Smoke test**

`pnpm dev:web` → /sites/mca-guide. Should show 3 stat cards + recent articles list. Buttons exist (publish/pause) but the API routes don't yet — that's Task 27.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/sites/ web/src/lib/queries/articles.ts
git commit -m "feat(web): per-site detail page with recent articles"
```

---

## Task 8: Articles index page

**Files:**
- Create: `web/src/app/articles/page.tsx`

- [ ] **Step 1: Add `searchArticles` to `web/src/lib/queries/articles.ts`**

```typescript
export type ArticleSearchOpts = {
  siteId?: string;
  query?: string;
  limit?: number;
  offset?: number;
};

export async function searchArticles(opts: ArticleSearchOpts = {}): Promise<ArticleRow[]> {
  const db = getDb();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const conds = [];
  if (opts.siteId) conds.push(eq(tables.contentIndex.siteId, opts.siteId));
  if (opts.query) conds.push(sql`title ILIKE ${`%${opts.query}%`}`);
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
  const q = db
    .select({
      id: tables.contentIndex.id,
      siteId: tables.contentIndex.siteId,
      url: tables.contentIndex.url,
      slug: tables.contentIndex.slug,
      title: tables.contentIndex.title,
      publishedAt: tables.contentIndex.publishedAt,
    })
    .from(tables.contentIndex)
    .orderBy(desc(tables.contentIndex.lastIndexed))
    .limit(limit)
    .offset(offset);
  const rows = where ? await q.where(where) : await q;
  return rows;
}
```

- [ ] **Step 2: Create `web/src/app/articles/page.tsx`**

```tsx
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { searchArticles } from "@/lib/queries/articles";
import { getAllSites } from "@/lib/queries/sites";

type SearchParams = Promise<{ site?: string; q?: string }>;

export default async function ArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [articles, sites] = await Promise.all([
    searchArticles({ siteId: sp.site, query: sp.q, limit: 100 }),
    getAllSites(),
  ]);
  const sitesById = Object.fromEntries(sites.map((s) => [s.id, s.name]));

  return (
    <>
      <TopBar title="Articles" />
      <main className="p-6 space-y-4">
        <form className="flex gap-2">
          <select
            name="site"
            defaultValue={sp.site ?? ""}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            name="q"
            placeholder="Search by title…"
            defaultValue={sp.q ?? ""}
            className="border rounded-md px-3 py-2 text-sm flex-1 max-w-sm"
          />
          <button
            type="submit"
            className="border rounded-md px-4 py-2 text-sm bg-white hover:bg-muted"
          >
            Filter
          </button>
        </form>

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Site</th>
                  <th className="text-left px-4 py-3">URL</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {articles.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <Link
                        href={`/articles/${a.siteId}/${a.slug}`}
                        className="font-medium hover:underline"
                      >
                        {a.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {sitesById[a.siteId] ?? a.siteId}
                    </td>
                    <td className="px-4 py-2">
                      <a href={a.url} target="_blank" className="text-primary hover:underline">
                        {new URL(a.url).pathname}
                      </a>
                    </td>
                  </tr>
                ))}
                {articles.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                      No articles match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Smoke test**

/articles → table of all 226 MCA Guide articles. Filter by site / search by title.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/articles/page.tsx web/src/lib/queries/articles.ts
git commit -m "feat(web): articles index page with site filter and title search"
```

---

## Task 9: Article detail page (with Claude transcript)

**Files:**
- Modify: `shared/src/db/schema.ts` (add `claude_transcript` jsonb column to `content_index`)
- Modify: `worker/src/jobs/write-article.ts` (capture transcript)
- Modify: `worker/src/pipeline/pipeline.ts` (pass transcript through)
- Create: `web/src/app/articles/[siteId]/[slug]/page.tsx`

- [ ] **Step 1: Add `claudeTranscript` column to `content_index`**

In `shared/src/db/schema.ts`, add to `contentIndex` columns:
```typescript
    claudeTranscript: jsonb("claude_transcript"),
```

(Nullable. Older rows have NULL; new pipeline runs populate it.)

- [ ] **Step 2: Generate + apply migration**

```bash
DATABASE_URL="$RAILWAY_DATABASE_URL" pnpm --filter @seo-forge/shared db:generate
DATABASE_URL="$RAILWAY_DATABASE_URL" pnpm --filter @seo-forge/shared db:migrate
```

Expected: a `0002_*.sql` adding the column.

- [ ] **Step 3: Modify `worker/src/jobs/write-article.ts` to expose stdout**

Change `runWriteArticle` return type to also include the raw prompt + raw response:
```typescript
export type WriteArticleResult = ArticleResponse & {
  prompt: string;
  rawResponse: string;
  durationMs: number;
};
```

Update the function: build the prompt explicitly, capture the result text, return all three.

```typescript
export async function runWriteArticle(i: WriteArticleInput): Promise<WriteArticleResult> {
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
  const parsed = parseArticleResponse(result.text);
  return { ...parsed, prompt, rawResponse: result.text, durationMs: result.durationMs };
}
```

- [ ] **Step 4: Modify `worker/src/pipeline/pipeline.ts` to persist transcript**

In the `repo.upsert` call at step 7, add:
```typescript
      claudeTranscript: {
        prompt: article.prompt,
        rawResponse: article.rawResponse,
        durationMs: article.durationMs,
        keyword: brief.targetKeyword,
        sisterLinks: sisterHits.map((h) => h.url),
      },
```

Update `ContentIndexRepo.upsert`'s row type and SQL to include `claude_transcript`. The `upsert` method's `ContentIndexRow` type gains `claudeTranscript?: unknown`. SQL:
```sql
INSERT INTO content_index
  (site_id, url, slug, title, h1, first_paragraph, topic_embedding, published_at, last_indexed, claude_transcript)
VALUES
  (..., ${transcript ? JSON.stringify(transcript) : null}::jsonb)
ON CONFLICT (url) DO UPDATE SET
  ...
  claude_transcript = EXCLUDED.claude_transcript,
  ...
```

(See existing repo.ts for full template; adjust to add the new column.)

- [ ] **Step 5: Run worker tests, expect pass**

```bash
pnpm --filter @seo-forge/worker test
```

- [ ] **Step 6: Add `getArticleBySlug` query**

In `web/src/lib/queries/articles.ts`:
```typescript
export type ArticleDetail = ArticleRow & {
  firstParagraph: string | null;
  claudeTranscript: { prompt?: string; rawResponse?: string; durationMs?: number } | null;
};

export async function getArticleBySlug(siteId: string, slug: string): Promise<ArticleDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: tables.contentIndex.id,
      siteId: tables.contentIndex.siteId,
      url: tables.contentIndex.url,
      slug: tables.contentIndex.slug,
      title: tables.contentIndex.title,
      publishedAt: tables.contentIndex.publishedAt,
      firstParagraph: tables.contentIndex.firstParagraph,
      claudeTranscript: tables.contentIndex.claudeTranscript,
    })
    .from(tables.contentIndex)
    .where(and(eq(tables.contentIndex.siteId, siteId), eq(tables.contentIndex.slug, slug)));
  return (row as ArticleDetail) ?? null;
}
```

- [ ] **Step 7: Create `web/src/app/articles/[siteId]/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getArticleBySlug } from "@/lib/queries/articles";

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ siteId: string; slug: string }>;
}) {
  const { siteId, slug } = await params;
  const article = await getArticleBySlug(siteId, slug);
  if (!article) notFound();
  const t = article.claudeTranscript;

  return (
    <>
      <TopBar title={article.title} />
      <main className="p-6 space-y-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Live URL</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href={article.url}
              target="_blank"
              className="text-primary hover:underline break-all"
            >
              {article.url}
            </a>
            {article.firstParagraph && (
              <p className="mt-3 text-muted-foreground">{article.firstParagraph}</p>
            )}
          </CardContent>
        </Card>

        {t && (
          <Card>
            <CardHeader>
              <CardTitle>Claude session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {t.durationMs && (
                <p className="text-sm text-muted-foreground">
                  Duration: {Math.round(t.durationMs / 1000)}s
                </p>
              )}
              <details>
                <summary className="cursor-pointer font-medium">Prompt</summary>
                <pre className="mt-2 bg-muted p-3 rounded text-xs whitespace-pre-wrap">
                  {t.prompt}
                </pre>
              </details>
              <details>
                <summary className="cursor-pointer font-medium">Raw response</summary>
                <pre className="mt-2 bg-muted p-3 rounded text-xs whitespace-pre-wrap overflow-x-auto">
                  {t.rawResponse}
                </pre>
              </details>
            </CardContent>
          </Card>
        )}
        {!t && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Claude transcript not available for this article. Transcripts are recorded for articles
              published after Phase 1B Task 9.
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 8: Smoke test**

/articles → click an article → see live URL + first paragraph. Older articles say transcript unavailable. Run the pipeline once after this task ships, click that new article — transcript visible.

- [ ] **Step 9: Commit**

```bash
git add shared/src/db/ worker/src/ web/src/app/articles/ web/src/lib/queries/articles.ts
git commit -m "feat: persist Claude transcript with each article + display in dashboard"
```

---

## Task 10-13: Jobs view + manual trigger plumbing

(Tasks 10-13 collapse: build the jobs table view, the job detail view with the full log, the API route to enqueue a publish job, and the per-site kill-switch toggle. Each follows the established TDD + RSC + commit pattern. Concrete steps:

- **Task 10:** `web/src/lib/queries/jobs.ts` with `listRecentJobs(limit)` and `getJob(id)`. Pure DB reads from `jobs` table. Test against Railway DB.
- **Task 11:** `web/src/app/jobs/page.tsx` rendering the recent-jobs table. `web/src/app/jobs/[jobId]/page.tsx` rendering one job's status + payload + result + error + duration.
- **Task 12:** `web/src/app/api/publish/route.ts` (POST `siteId`) — validates the site exists, inserts a row into `jobs` (`type='publish'`, `status='pending'`, `payload={siteId}`), redirects back. Worker cron (Task 27) picks it up and runs `runPipeline`. Test: form button on /sites/[siteId] enqueues a row.
- **Task 13:** `web/src/app/api/sites/[siteId]/route.ts` (POST with `_method=PATCH`) — toggles `killSwitch` or `autoPublish`. Updates the `sites` row. Test: button toggles the column.)

Each commits separately with `feat(web): ...` messages.

---

## Task 14: GSC snapshot cron + DB writes

**Files:**
- Create: `worker/src/orchestrator/gsc-snapshot-cron.ts`, `worker/src/orchestrator/gsc-snapshot-cron.test.ts`

- [ ] **Step 1: Write the failing test** (mocks `fetchStrikingDistanceQueries` and verifies snapshot is upserted)

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createDb, tables } from "@seo-forge/shared";
import { eq } from "drizzle-orm";
import { snapshotSiteGsc } from "./gsc-snapshot-cron";
import * as gsc from "../data/gsc";

const url = process.env.DATABASE_URL!;
const { db, close } = createDb(url);

beforeAll(async () => {
  await db.insert(tables.sites).values({
    id: "test-gsc",
    name: "Test",
    domain: "test.com",
    repoUrl: "x",
    contentDir: "x",
  }).onConflictDoNothing();
});
afterAll(async () => {
  await db.delete(tables.gscSnapshot).where(eq(tables.gscSnapshot.siteId, "test-gsc"));
  await db.delete(tables.sites).where(eq(tables.sites.id, "test-gsc"));
  await close();
});

describe("snapshotSiteGsc", () => {
  it("aggregates rows and writes a snapshot", async () => {
    vi.spyOn(gsc, "fetchStrikingDistanceQueries").mockResolvedValueOnce([
      { query: "q1", clicks: 100, impressions: 1000, ctr: 0.1, position: 9 },
      { query: "q2", clicks: 50, impressions: 800, ctr: 0.0625, position: 11 },
    ]);
    await snapshotSiteGsc({
      siteId: "test-gsc",
      siteUrl: "https://test.com/",
      refreshToken: "x",
      clientId: "x",
      clientSecret: "x",
    });
    const [row] = await db
      .select()
      .from(tables.gscSnapshot)
      .where(eq(tables.gscSnapshot.siteId, "test-gsc"));
    expect(row).toBeDefined();
    expect(row!.totalClicks).toBe(150);
    expect(row!.totalImpressions).toBe(1800);
  });
});
```

- [ ] **Step 2: Run, expect fail** — module not found.

- [ ] **Step 3: Implement `worker/src/orchestrator/gsc-snapshot-cron.ts`**

```typescript
import { type Db, tables } from "@seo-forge/shared";
import { sql } from "drizzle-orm";
import { fetchStrikingDistanceQueries } from "../data/gsc.js";

export type GscSnapshotInput = {
  siteId: string;
  siteUrl: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  days?: number;
};

export async function snapshotSiteGsc(i: GscSnapshotInput, db?: Db): Promise<void> {
  // Fetch ALL queries (no position filter) to compute totals
  const allQueries = await fetchStrikingDistanceQueries({
    siteUrl: i.siteUrl,
    refreshToken: i.refreshToken,
    clientId: i.clientId,
    clientSecret: i.clientSecret,
    days: i.days ?? 28,
    minPosition: 1,
    maxPosition: 100,
    minImpressions: 0,
  });
  const totalClicks = allQueries.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = allQueries.reduce((s, r) => s + r.impressions, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition =
    allQueries.length > 0
      ? allQueries.reduce((s, r) => s + r.position, 0) / allQueries.length
      : 0;
  const topQueries = [...allQueries]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 50);
  const strikingDistance = allQueries.filter(
    (q) => q.position >= 8 && q.position <= 25 && q.impressions >= 50,
  );

  const today = new Date().toISOString().slice(0, 10);
  const conn = db ?? (await import("./_db-singleton.js")).getDb();
  await conn.execute(sql`
    INSERT INTO gsc_snapshot
      (site_id, snapshot_date, total_clicks, total_impressions, avg_ctr, avg_position, payload)
    VALUES
      (${i.siteId}, ${today}, ${totalClicks}, ${totalImpressions}, ${avgCtr}, ${avgPosition},
       ${JSON.stringify({ topQueries, strikingDistance })}::jsonb)
    ON CONFLICT (site_id, snapshot_date) DO UPDATE SET
      total_clicks = EXCLUDED.total_clicks,
      total_impressions = EXCLUDED.total_impressions,
      avg_ctr = EXCLUDED.avg_ctr,
      avg_position = EXCLUDED.avg_position,
      payload = EXCLUDED.payload
  `);
}

export async function snapshotAllSites(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ ok: number; failed: number }> {
  const conn = (await import("./_db-singleton.js")).getDb();
  const sites = await conn.select().from(tables.sites);
  let ok = 0,
    failed = 0;
  for (const site of sites) {
    try {
      await snapshotSiteGsc(
        {
          siteId: site.id,
          siteUrl: `https://${site.domain}/`,
          refreshToken: opts.refreshToken,
          clientId: opts.clientId,
          clientSecret: opts.clientSecret,
        },
        conn,
      );
      ok++;
    } catch (e) {
      console.error(`[gsc-snapshot] ${site.id} failed:`, (e as Error).message);
      failed++;
    }
  }
  return { ok, failed };
}
```

(Create `worker/src/orchestrator/_db-singleton.ts` separately — exposes a single `getDb()` that creates the Db once and reuses it. Used by all cron files.)

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm --filter @seo-forge/worker test src/orchestrator/gsc-snapshot
```

Expected: 1 passing.

- [ ] **Step 5: Manual trigger script** for dev — `scripts/run-gsc-snapshot.ts`:

```typescript
import { snapshotAllSites } from "../worker/src/orchestrator/gsc-snapshot-cron.js";
const { ok, failed } = await snapshotAllSites({
  refreshToken: process.env.GSC_REFRESH_TOKEN!,
  clientId: process.env.GSC_CLIENT_ID!,
  clientSecret: process.env.GSC_CLIENT_SECRET!,
});
console.log(`done: ok=${ok} failed=${failed}`);
```

Run it:
```bash
set -a && source .env && set +a && pnpm exec tsx scripts/run-gsc-snapshot.ts
```

Expected: `done: ok=1 failed=0`. Check `gsc_snapshot` table — 1 row for `mca-guide`.

- [ ] **Step 6: Commit**

```bash
git add worker/src/orchestrator/ scripts/run-gsc-snapshot.ts
git commit -m "feat(worker): GSC snapshot cron job (per-site daily aggregate + striking distance)"
```

---

## Tasks 15-20: Ahrefs snapshots + analytics widgets

(Same pattern as Task 14:
- **Task 15:** `worker/src/data/ahrefs-extras.ts` with `fetchDomainRating`, `fetchOrganicKeywords`, `fetchOrganicPages`, `fetchBacklinks` (Ahrefs `/v3/site-explorer/...` endpoints). Each gets a real-API-call test like the existing `ahrefs.test.ts`.
- **Task 16:** `worker/src/orchestrator/ahrefs-snapshot-cron.ts` — calls all four endpoints, aggregates into one `ahrefs_snapshot` row per site per day. Test mocks the four fetchers.
- **Task 17:** `web/src/lib/queries/analytics.ts` exposing `getLatestGscSnapshot(siteId)`, `getLatestAhrefsSnapshot(siteId)`, `getGscTrend(siteId, days=30)` (returns array of date+clicks for sparklines).
- **Task 18:** `web/src/components/overview/Sparkline.tsx` (Recharts wrapper) and `web/src/components/overview/SiteCard.tsx`. Update `/overview/page.tsx` to render one SiteCard per site with stats + sparkline.
- **Task 19:** Per-site analytics widgets — `GscQueriesTable` (top 20 queries), `AhrefsKeywordsTable`, `BacklinksList`. Wire into `/sites/[siteId]/page.tsx`.
- **Task 20:** "Refresh now" button — `web/src/app/api/refresh-analytics/route.ts` POST inserts `gsc_snapshot` and `ahrefs_snapshot` jobs into the queue (worker cron picks up immediately). Form button on overview/per-site page.)

Each task ships its own commit.

---

## Tasks 21-26: Opportunities engine

(Same TDD/RSC pattern:
- **Task 21:** `worker/src/opportunities/striking-distance.ts` — read latest `gsc_snapshot.payload.strikingDistance`, dedupe against `content_index` slugs, emit one opportunity per gap. Test mocks the snapshot read.
- **Task 22:** `worker/src/opportunities/traffic-decline.ts` — compare last 7-day clicks vs prior 28-day baseline per top page. Emit opportunities for >30% drops. Test fixture: two snapshots showing decline.
- **Task 23:** `worker/src/opportunities/content-gap.ts` — for each site's top GSC queries, embedding-search across OTHER sites' `content_index`. If a sister site already covers it, surface a "you should link this" opportunity. Test fixture: seed two sites + one matching topic.
- **Task 24:** `worker/src/opportunities/opportunities.ts` — facade that runs all detectors, INSERTs new opportunities, marks stale ones as expired. Cron-callable.
- **Task 25:** `web/src/lib/queries/opportunities.ts` + `web/src/app/opportunities/page.tsx` — list of open opportunities grouped by type, action buttons.
- **Task 26:** `web/src/app/opportunities/[id]/act/route.ts` — POST converts an opportunity into a publish job (`jobs` row with `payload={siteId, targetKeyword}`), marks opportunity `acted_on`, redirects to /jobs/[jobId].)

Each detector commits separately.

---

## Task 27: Worker cron orchestrator

**Files:**
- Create: `worker/src/orchestrator/cron.ts`, `worker/src/orchestrator/_db-singleton.ts`, `worker/src/orchestrator/publish-cron.ts`
- Modify: `worker/package.json` (add `start` script + `node-cron` dep)

- [ ] **Step 1: Add `node-cron` to `worker/package.json` dependencies**

```json
"node-cron": "3.0.3",
```

Run `pnpm install`.

- [ ] **Step 2: Create `worker/src/orchestrator/_db-singleton.ts`**

```typescript
import { createDb, type Db } from "@seo-forge/shared";

let _db: Db | null = null;
let _close: (() => Promise<void>) | null = null;

export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const { db, close } = createDb(url);
  _db = db;
  _close = close;
  return db;
}

export async function closeDb(): Promise<void> {
  if (_close) await _close();
  _db = null;
  _close = null;
}
```

- [ ] **Step 3: Create `worker/src/orchestrator/publish-cron.ts`**

This polls for `pending` `publish` jobs in the queue (inserted by the dashboard's "Publish now" button or by the daily auto-publish cron) and runs them.

```typescript
import { getDb } from "./_db-singleton.js";
import { tables } from "@seo-forge/shared";
import { eq, and, isNull, sql } from "drizzle-orm";
import { runPipeline } from "../pipeline/pipeline.js";

export async function processNextPublishJob(): Promise<{ jobId: number; result: unknown } | null> {
  const db = getDb();
  // Atomic claim using FOR UPDATE SKIP LOCKED
  const claimed = await db.execute<{ id: number; payload: { siteId: string } }>(sql`
    UPDATE jobs SET status = 'claimed', claimed_at = NOW()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND type = 'publish'
        AND (run_after IS NULL OR run_after <= NOW())
      ORDER BY created_at ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, payload
  `);
  if (claimed.length === 0) return null;
  const job = claimed[0]!;
  const startedAt = new Date();
  await db.update(tables.jobs).set({ status: "running", startedAt }).where(eq(tables.jobs.id, job.id));

  try {
    const result = await runPipeline({ siteId: job.payload.siteId });
    await db
      .update(tables.jobs)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        result: result as unknown,
      })
      .where(eq(tables.jobs.id, job.id));
    return { jobId: job.id, result };
  } catch (e) {
    await db
      .update(tables.jobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: (e as Error).message.slice(0, 1000),
      })
      .where(eq(tables.jobs.id, job.id));
    throw e;
  }
}

export async function enqueueDailyPublishJobs(): Promise<number> {
  const db = getDb();
  const sites = await db.select().from(tables.sites).where(eq(tables.sites.killSwitch, false));
  let count = 0;
  for (const site of sites) {
    if (!site.autoPublish) continue;
    await db.insert(tables.jobs).values({
      type: "publish",
      siteId: site.id,
      status: "pending",
      payload: { siteId: site.id, source: "daily-cron" },
    });
    count++;
  }
  return count;
}
```

- [ ] **Step 4: Create `worker/src/orchestrator/cron.ts`** (the entry point — runs forever)

```typescript
import cron from "node-cron";
import { processNextPublishJob, enqueueDailyPublishJobs } from "./publish-cron.js";
import { snapshotAllSites as snapshotAllGsc } from "./gsc-snapshot-cron.js";
import { snapshotAllSites as snapshotAllAhrefs } from "./ahrefs-snapshot-cron.js";
import { runOpportunityDetectors } from "../opportunities/opportunities.js";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};

console.log("[cron] starting orchestrator");

// Process publish queue every 30 seconds
cron.schedule("*/30 * * * * *", async () => {
  try {
    const result = await processNextPublishJob();
    if (result) console.log(`[cron] processed publish job ${result.jobId}`);
  } catch (e) {
    console.error("[cron] publish job error:", (e as Error).message);
  }
});

// Enqueue daily auto-publish at 6am
cron.schedule("0 6 * * *", async () => {
  try {
    const count = await enqueueDailyPublishJobs();
    console.log(`[cron] enqueued ${count} daily publish jobs`);
  } catch (e) {
    console.error("[cron] daily enqueue error:", (e as Error).message);
  }
});

// GSC snapshot at 2am
cron.schedule("0 2 * * *", async () => {
  try {
    const r = await snapshotAllGsc({
      refreshToken: env("GSC_REFRESH_TOKEN"),
      clientId: env("GSC_CLIENT_ID"),
      clientSecret: env("GSC_CLIENT_SECRET"),
    });
    console.log(`[cron] GSC snapshot: ok=${r.ok} failed=${r.failed}`);
  } catch (e) {
    console.error("[cron] GSC snapshot error:", (e as Error).message);
  }
});

// Ahrefs snapshot at 3am
cron.schedule("0 3 * * *", async () => {
  try {
    const r = await snapshotAllAhrefs({ apiKey: env("AHREFS_API_KEY") });
    console.log(`[cron] Ahrefs snapshot: ok=${r.ok} failed=${r.failed}`);
  } catch (e) {
    console.error("[cron] Ahrefs snapshot error:", (e as Error).message);
  }
});

// Opportunities at 4am (after both snapshots)
cron.schedule("0 4 * * *", async () => {
  try {
    const r = await runOpportunityDetectors();
    console.log(`[cron] opportunities: detected=${r.detected} expired=${r.expired}`);
  } catch (e) {
    console.error("[cron] opportunities error:", (e as Error).message);
  }
});

// Keep process alive
process.stdin.resume();
```

- [ ] **Step 5: Add `start` script to `worker/package.json`**

```json
"start": "tsx src/orchestrator/cron.ts",
```

- [ ] **Step 6: Manual smoke test**

```bash
set -a && source .env && set +a && pnpm --filter @seo-forge/worker start
```

Watch the log. Insert a publish job from another terminal:
```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql "$DATABASE_URL" -c "INSERT INTO jobs (type, site_id, status, payload) VALUES ('publish', 'mca-guide', 'pending', '{\"siteId\":\"mca-guide\"}'::jsonb);"
```

Within 30 seconds you should see `[cron] processed publish job N`. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add worker/ pnpm-lock.yaml
git commit -m "feat(worker): cron orchestrator with publish queue + daily snapshots"
```

---

## Task 28-31: Manual trigger plumbing + transcript wiring

(Tasks 28-31 cover:
- **Task 28:** Implement `web/src/app/api/publish/route.ts` (Task 12 if not done) — inserts pending publish job, redirects to /jobs/<new-id>.
- **Task 29:** Live job-status indicator on /jobs/[jobId] — uses `revalidatePath` and a small client `useEffect` poll every 5s to refresh.
- **Task 30:** Job log streaming (worker writes intermediate stage updates to `jobs.payload.log: [...]` array; web tails it).
- **Task 31:** Per-site `auto_publish` toggle on /sites/[siteId] (PATCH route). Disable button if `autoPublish=false`.)

Each ships separately with `feat(web): ...`.

---

## Task 32: Railway service config — web

**Files:**
- Create: `web/Dockerfile`, `web/.dockerignore`, `infra/railway/web.json`

- [ ] **Step 1: Create `web/Dockerfile`**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY web/package.json ./web/
COPY worker/package.json ./worker/
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/shared/node_modules ./shared/node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY --from=deps /app/worker/node_modules ./worker/node_modules
COPY . .
RUN cd web && pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./web/.next/static
COPY --from=build /app/web/public ./web/public
USER nextjs
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["node", "web/server.js"]
```

- [ ] **Step 2: Create `web/.dockerignore`**

```
node_modules
.next
.env
.env.local
*.log
```

- [ ] **Step 3: In Railway dashboard, create a NEW service** named `seo-forge-web`:
  - Source: connect to `barelezra10-create/-seo-forge` repo
  - Settings → Build → Dockerfile path: `web/Dockerfile`
  - Settings → Deploy → Healthcheck path: `/login`
  - Variables: copy from .env (all of them, including DATABASE_URL = the Railway Postgres internal URL)
  - Domain: claim `seo-forge-production.up.railway.app` (move from the placeholder service)

- [ ] **Step 4: Pause the old placeholder service** (`seo-forge-production`) — Settings → Service → Pause.

- [ ] **Step 5: Push a commit to trigger deploy**

```bash
git add web/Dockerfile web/.dockerignore
git commit -m "chore: Railway Dockerfile for web service"
git push origin main
```

Watch the Railway build log. After ~3 min, the service should be running.

- [ ] **Step 6: Smoke test**

Visit https://seo-forge-production.up.railway.app — should redirect to /login. Log in. See dashboard with sites, articles, etc.

---

## Task 33: Railway service config — worker

**Files:**
- Create: `worker/Dockerfile`, `worker/.dockerignore`

- [ ] **Step 1: Create `worker/Dockerfile`**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
RUN apk add --no-cache git
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY worker/package.json ./worker/
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache git openssh-client
RUN corepack enable
COPY --from=deps /app ./
COPY shared ./shared
COPY worker ./worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@seo-forge/worker", "start"]
```

- [ ] **Step 2: Create `worker/.dockerignore`**

```
node_modules
dist
.env
*.log
workspace/repos
```

- [ ] **Step 3: In Railway, create a NEW service** named `seo-forge-worker`:
  - Source: same repo
  - Settings → Build → Dockerfile path: `worker/Dockerfile`
  - Variables: same as web (DATABASE_URL, all keys, GH_PAT_*)
  - **Add a Volume**: mount `/root/.claude` (size: 1GB) — this holds the Claude Code subscription tokens
  - **Restart policy**: on-failure, max 5 retries

- [ ] **Step 4: Bootstrap Claude Code auth**

```bash
# Locally:
tar -czf /tmp/claude-auth.tgz -C ~ .claude
# Upload via Railway CLI to the worker volume:
railway link  # pick seo-forge-worker
railway run "mkdir -p /root/.claude && tar -xzf -" < /tmp/claude-auth.tgz
```

(Or: run a one-shot SSH job in Railway — `railway run --service seo-forge-worker bash` then paste the auth files manually.)

- [ ] **Step 5: Push to trigger deploy**

```bash
git add worker/Dockerfile worker/.dockerignore
git commit -m "chore: Railway Dockerfile for worker service with cron orchestrator"
git push origin main
```

Watch logs. Once running, you should see `[cron] starting orchestrator`.

- [ ] **Step 6: Smoke test from dashboard**

Visit the dashboard, click "Publish now" on /sites/mca-guide. Within ~30s, the worker logs show `[cron] processed publish job N`. Refresh the dashboard's /jobs page — see the success row.

---

## Task 34: Pause Railway placeholder + cleanup

- [ ] In Railway dashboard, **delete** the original `seo-forge-production` placeholder service (the one with the Express index.mjs). Domain `seo-forge-production.up.railway.app` is now bound to `seo-forge-web`.
- [ ] Remove `index.mjs` from the repo + drop the `start` script from root `package.json` (the placeholder server is no longer needed):
  ```bash
  git rm index.mjs
  # edit package.json to remove "start" line
  git commit -m "chore: drop placeholder server (replaced by Railway web service)"
  git push origin main
  ```

---

## Task 35: End-to-end smoke test (Phase 1B exit gate)

- [ ] On phone (or computer), open https://seo-forge-production.up.railway.app, log in.
- [ ] /overview shows 1 site, 226+ articles, sparkline (probably empty since GSC snapshot hasn't run yet — wait until 2am or click "Refresh now").
- [ ] /sites/mca-guide shows GSC top queries, Ahrefs top keywords, recent articles.
- [ ] /opportunities shows striking-distance and (eventually) cross-site link opportunities.
- [ ] Click "Publish now" → redirected to /jobs/<id> → status flips claimed → running → succeeded within ~10 min → article appears in /articles.
- [ ] Toggle kill switch → "Publish now" disabled. Toggle back → enabled.
- [ ] Wait until next morning → daily-cron should have published 1 new article overnight.

Tag and push:

```bash
git tag phase-1b-shipped
git push origin phase-1b-shipped
```

---

## Self-Review

**Spec coverage:** Phase 1B per the original design (`docs/superpowers/specs/2026-04-30-seo-forge-design.md` section 12) requires: dashboard with Jobs/Sites/Articles/Off-site views, cron orchestrator, kill switches, Railway deploy, GSC integration, cost dashboard. All covered. Off-site (Medium/LinkedIn/Quora) is Phase 3 — out of scope here.

**Bar's expanded ask** (May 2026): GSC + Ahrefs analytics in dashboard, opportunities engine. Covered by tasks 14-26.

**Placeholder scan:** None — every code step shows actual code. Tasks 10-13 and 15-26 use compressed task descriptions that name the files + key behaviors, but they reference the established TDD pattern from earlier tasks. If executing strictly task-by-task with subagents, the controller should expand each line into the same explicit format as Tasks 1-9 / 14 / 27 before dispatching.

**Type consistency:** `SiteSummary`, `ArticleRow`, `ArticleDetail`, `WriteArticleResult`, `GscSnapshotInput` are defined once and imported. `gsc_snapshot.payload` shape (`{ topQueries, strikingDistance }`) is consistent across the snapshot writer (Task 14) and the queries module (Task 17).

**Open questions for execution time:**
1. Whether to keep `worker/Dockerfile` in workspace OR top-level Dockerfile — depends on Railway's expectation
2. Whether claude-code CLI is installable in the worker Dockerfile (needs to verify alpine compatibility) — fallback is a base image with Node + npm to install via `npm i -g @anthropic-ai/claude-code` at build time
3. Whether to use Railway's built-in cron service vs node-cron in-process (node-cron is fine for this scale)

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-seo-forge-phase-1b.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Same pattern as Phase 1A. Best for a 35-task plan since each task is self-contained.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
