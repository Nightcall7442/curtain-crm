ALTER TABLE "orders" DROP CONSTRAINT "orders_stage_fees_non_negative";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cutting_fee" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_stage_fees_non_negative" CHECK ("orders"."measurement_fee" >= 0 and "orders"."cutting_fee" >= 0
          and "orders"."sewing_fee" >= 0 and "orders"."qc_fee" >= 0
          and "orders"."installation_fee" >= 0);