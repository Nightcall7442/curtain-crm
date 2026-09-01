CREATE TABLE "personal_breaks" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_id" integer NOT NULL,
	"planned_minutes" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"returned_at" timestamp with time zone,
	CONSTRAINT "personal_breaks_planned_minutes_range" CHECK ("personal_breaks"."planned_minutes" between 1 and 30),
	CONSTRAINT "personal_breaks_returned_after_started" CHECK ("personal_breaks"."returned_at" is null or "personal_breaks"."returned_at" >= "personal_breaks"."started_at")
);
--> statement-breakpoint
ALTER TABLE "personal_breaks" ADD CONSTRAINT "personal_breaks_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_breaks_shift_idx" ON "personal_breaks" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_breaks_single_active_per_shift" ON "personal_breaks" USING btree ("shift_id") WHERE "personal_breaks"."returned_at" is null;