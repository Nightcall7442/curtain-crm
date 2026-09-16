ALTER TABLE "ready_made_items" ADD COLUMN "set_key" text;--> statement-breakpoint
CREATE INDEX "ready_made_items_set_idx" ON "ready_made_items" USING btree ("set_key");--> statement-breakpoint
UPDATE "ready_made_items" SET "set_key" = 'order:' || "source_order_id" WHERE "source_order_id" IS NOT NULL;