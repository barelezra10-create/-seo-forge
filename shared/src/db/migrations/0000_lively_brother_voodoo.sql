CREATE TYPE "public"."job_mode" AS ENUM('subscription', 'api');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'claimed', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_status" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"status" text NOT NULL,
	"last_checked" timestamp with time zone DEFAULT now() NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_index" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"url" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"h1" text,
	"first_paragraph" text,
	"topic_embedding" vector(1024),
	"published_at" timestamp with time zone,
	"last_indexed" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"site_id" text,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"mode" "job_mode" DEFAULT 'subscription' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"blocked_by" bigint,
	"run_after" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"cost_usd" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"repo_url" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"content_dir" text NOT NULL,
	"file_format" text DEFAULT 'mdx' NOT NULL,
	"brand_voice" text DEFAULT '' NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"auto_publish" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_index" ADD CONSTRAINT "content_index_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_index_url_idx" ON "content_index" USING btree ("url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_index_site_idx" ON "content_index" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_site_idx" ON "jobs" USING btree ("site_id");