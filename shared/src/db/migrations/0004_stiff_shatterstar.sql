ALTER TABLE "article_plans" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "article_plans" ADD COLUMN "draft_generated_at" timestamp with time zone;