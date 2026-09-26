ALTER TABLE "feature_requests" ADD COLUMN "context_path" text;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "release_sha" text;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "acceptance_criteria" text;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "backlog_url" text;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "delivered_release" text;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "validation_notes" text;