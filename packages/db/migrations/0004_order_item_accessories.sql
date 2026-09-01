ALTER TABLE "order_items" ADD COLUMN "has_protection" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "accessories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "order_items" SET "accessories" =
	(CASE WHEN "accessory" IS NOT NULL AND length(trim("accessory")) > 0
		THEN jsonb_build_array(jsonb_build_object('name', "accessory", 'quantity', 1, 'code', null))
		ELSE '[]'::jsonb END)
	||
	(CASE WHEN "sachak" IS NOT NULL AND length(trim("sachak")) > 0
		THEN jsonb_build_array(jsonb_build_object('name', "sachak", 'quantity', 1, 'code', null))
		ELSE '[]'::jsonb END);--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "sachak";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "accessory";
