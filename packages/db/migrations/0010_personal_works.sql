CREATE TYPE "public"."personal_work_status" AS ENUM('in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "personal_works" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"details" text,
	"status" "personal_work_status" DEFAULT 'in_progress' NOT NULL,
	"cancellation_reason" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_works_cancellation_reason_required" CHECK ("personal_works"."status" <> 'cancelled' or "personal_works"."cancellation_reason" is not null),
	CONSTRAINT "personal_works_closed_at_matches_status" CHECK (("personal_works"."status" = 'in_progress') = ("personal_works"."closed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "personal_works" ADD CONSTRAINT "personal_works_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_works_user_idx" ON "personal_works" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "personal_works_status_idx" ON "personal_works" USING btree ("status");