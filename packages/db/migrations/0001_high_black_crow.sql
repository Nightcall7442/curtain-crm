CREATE TYPE "public"."department" AS ENUM('sewing', 'installation', 'cutting', 'sales', 'administration', 'quality', 'other');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('permanent', 'probation', 'temporary', 'intern');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employee_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "department" "department" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employment_type" "employment_type" DEFAULT 'permanent' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fired_at" date;--> statement-breakpoint
CREATE UNIQUE INDEX "users_employee_code_unique" ON "users" USING btree ("employee_code");--> statement-breakpoint
CREATE INDEX "users_department_idx" ON "users" USING btree ("department");--> statement-breakpoint
CREATE INDEX "users_birthday_idx" ON "users" USING btree (extract(month from "birth_date"),extract(day from "birth_date"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_fired_after_hired" CHECK ("users"."fired_at" is null or "users"."hired_at" is null or "users"."fired_at" >= "users"."hired_at");