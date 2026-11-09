ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'late_requested';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'late_approved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'late_rejected';--> statement-breakpoint
CREATE TABLE "late_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"arrive_by" time NOT NULL,
	"reason" text,
	"status" "day_off_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "late_requests_reviewed_matches_status" CHECK (("late_requests"."status" in ('approved', 'rejected')) = ("late_requests"."reviewed_by" is not null)),
	CONSTRAINT "late_requests_reviewed_at_matches_reviewer" CHECK (("late_requests"."reviewed_by" is null) = ("late_requests"."reviewed_at" is null)),
	CONSTRAINT "late_requests_rejection_reason_matches_status" CHECK (("late_requests"."status" = 'rejected') = ("late_requests"."rejection_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "late_requests" ADD CONSTRAINT "late_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_requests" ADD CONSTRAINT "late_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "late_requests_user_date_idx" ON "late_requests" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "late_requests_status_idx" ON "late_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "late_requests_one_active_per_day" ON "late_requests" USING btree ("user_id","date") WHERE "late_requests"."status" in ('pending', 'approved');