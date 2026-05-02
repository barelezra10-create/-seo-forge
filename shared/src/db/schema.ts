import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
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
    blockedBy: bigint("blocked_by", { mode: "number" }),
    runAfter: timestamp("run_after", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    /** Stored as USD cents (integer). Sub-cent costs round up. */
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
    claudeTranscript: jsonb("claude_transcript"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastIndexed: timestamp("last_indexed", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // URL is globally unique (host is part of the URL, so cross-site collisions don't happen).
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
