CREATE TYPE "public"."opportunity_status" AS ENUM('open', 'acted_on', 'dismissed', 'expired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ahrefs_snapshot" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"domain_rating" double precision DEFAULT 0 NOT NULL,
	"ref_domains" integer DEFAULT 0 NOT NULL,
	"backlinks" integer DEFAULT 0 NOT NULL,
	"organic_keywords" integer DEFAULT 0 NOT NULL,
	"organic_traffic" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gsc_snapshot" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_clicks" integer DEFAULT 0 NOT NULL,
	"total_impressions" integer DEFAULT 0 NOT NULL,
	"avg_ctr" double precision DEFAULT 0 NOT NULL,
	"avg_position" double precision DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opportunities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "opportunity_status" DEFAULT 'open' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acted_job_id" bigint,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ahrefs_snapshot" ADD CONSTRAINT "ahrefs_snapshot_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gsc_snapshot" ADD CONSTRAINT "gsc_snapshot_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ahrefs_snapshot_site_date_idx" ON "ahrefs_snapshot" USING btree ("site_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gsc_snapshot_site_date_idx" ON "gsc_snapshot" USING btree ("site_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_site_status_idx" ON "opportunities" USING btree ("site_id","status");