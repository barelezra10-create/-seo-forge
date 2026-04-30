import {
  bigint,
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
    blockedBy: bigint("blocked_by", { mode: "number" }),
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
