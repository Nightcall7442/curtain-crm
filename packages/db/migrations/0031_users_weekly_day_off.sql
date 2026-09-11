ALTER TABLE "users" ADD COLUMN "weekly_day_off" smallint;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_weekly_day_off_range" CHECK ("users"."weekly_day_off" between 1 and 7);