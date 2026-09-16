CREATE TYPE "public"."discipline_kind" AS ENUM('late_under_15', 'late_15_30', 'late_over_30', 'absence', 'no_show_no_notice', 'client_rudeness', 'client_complaint', 'measure_error', 'order_failure', 'plan_done', 'positive_review', 'helped_team');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'discipline_recorded';--> statement-breakpoint
CREATE TABLE "discipline_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" "discipline_kind" NOT NULL,
	"points" numeric(4, 1) NOT NULL,
	"is_repeat" boolean DEFAULT false NOT NULL,
	"occurred_on" date NOT NULL,
	"description" text,
	"employee_comment" text,
	"employee_comment_at" timestamp with time zone,
	"recorded_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discipline_events" ADD CONSTRAINT "discipline_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_events" ADD CONSTRAINT "discipline_events_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discipline_events_user_day_idx" ON "discipline_events" USING btree ("user_id","occurred_on");