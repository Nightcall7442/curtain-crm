CREATE TABLE "installation_trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_id" integer NOT NULL,
	"order_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"returned_at" timestamp with time zone,
	"start_latitude" double precision NOT NULL,
	"start_longitude" double precision NOT NULL,
	"start_distance_meters" integer,
	"end_latitude" double precision,
	"end_longitude" double precision,
	"end_distance_meters" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installation_trips_returned_after_start" CHECK ("installation_trips"."returned_at" is null or "installation_trips"."returned_at" >= "installation_trips"."started_at")
);
--> statement-breakpoint
ALTER TABLE "installation_trips" ADD CONSTRAINT "installation_trips_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_trips" ADD CONSTRAINT "installation_trips_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "installation_trips_shift_idx" ON "installation_trips" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "installation_trips_order_idx" ON "installation_trips" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "installation_trips_single_active_per_shift" ON "installation_trips" USING btree ("shift_id") WHERE "installation_trips"."returned_at" is null;