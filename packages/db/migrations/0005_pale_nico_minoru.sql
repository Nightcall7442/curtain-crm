CREATE TYPE "public"."day_off_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'day_off_requested';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'day_off_approved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'day_off_rejected';--> statement-breakpoint
CREATE TABLE "day_off_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"status" "day_off_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_off_requests_period_valid" CHECK ("day_off_requests"."end_date" >= "day_off_requests"."start_date"),
	CONSTRAINT "day_off_requests_reviewed_matches_status" CHECK (("day_off_requests"."status" in ('approved', 'rejected')) = ("day_off_requests"."reviewed_by" is not null)),
	CONSTRAINT "day_off_requests_reviewed_at_matches_reviewer" CHECK (("day_off_requests"."reviewed_by" is null) = ("day_off_requests"."reviewed_at" is null)),
	CONSTRAINT "day_off_requests_rejection_reason_matches_status" CHECK (("day_off_requests"."status" = 'rejected') = ("day_off_requests"."rejection_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "day_off_requests" ADD CONSTRAINT "day_off_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_off_requests" ADD CONSTRAINT "day_off_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "day_off_requests_user_idx" ON "day_off_requests" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "day_off_requests_status_idx" ON "day_off_requests" USING btree ("status");