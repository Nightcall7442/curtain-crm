ALTER TABLE "users" ADD COLUMN "workstation" smallint;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workstation_range" CHECK ("users"."workstation" between 1 and 99);