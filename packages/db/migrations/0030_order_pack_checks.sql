CREATE TABLE "order_pack_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"key" text NOT NULL,
	"checked_by" integer NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_pack_checks_key_not_blank" CHECK (length(btrim("order_pack_checks"."key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "order_pack_checks" ADD CONSTRAINT "order_pack_checks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_pack_checks" ADD CONSTRAINT "order_pack_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_pack_checks_order_key_unique" ON "order_pack_checks" USING btree ("order_id","key");--> statement-breakpoint
CREATE INDEX "order_pack_checks_order_idx" ON "order_pack_checks" USING btree ("order_id");