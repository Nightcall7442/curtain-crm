CREATE TYPE "public"."order_type" AS ENUM('custom', 'ready_made');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_type" "order_type" DEFAULT 'custom' NOT NULL;