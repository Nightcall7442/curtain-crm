ALTER TABLE "orders" drop column "order_number";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_number" text GENERATED ALWAYS AS ((case when order_type in ('ready_made', 'stock') then 'TDH-' else 'DH-' end) || lpad(id::text, 6, '0')) STORED;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique" ON "orders" USING btree ("order_number");
