ALTER TABLE "retail_sales" ADD COLUMN "discount_amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_discount_non_negative" CHECK ("retail_sales"."discount_amount" >= 0);