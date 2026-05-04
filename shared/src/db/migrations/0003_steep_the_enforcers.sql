CREATE TYPE "public"."plan_status" AS ENUM('planned', 'published', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "article_plans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"planned_date" date NOT NULL,
	"target_keyword" text NOT NULL,
	"intent" text DEFAULT 'informational' NOT NULL,
	"research" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sister_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "plan_status" DEFAULT 'planned' NOT NULL,
	"published_job_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "article_plans" ADD CONSTRAINT "article_plans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "article_plans_site_date_idx" ON "article_plans" USING btree ("site_id","planned_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_plans_status_idx" ON "article_plans" USING btree ("status");