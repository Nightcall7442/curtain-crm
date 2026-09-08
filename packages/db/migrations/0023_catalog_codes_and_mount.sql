ALTER TYPE "public"."catalog_kind" ADD VALUE 'portiere_code';--> statement-breakpoint
ALTER TYPE "public"."catalog_kind" ADD VALUE 'tulle_code';--> statement-breakpoint
ALTER TYPE "public"."catalog_kind" ADD VALUE 'protection_code';--> statement-breakpoint
ALTER TYPE "public"."catalog_kind" ADD VALUE 'cornice_code';--> statement-breakpoint
ALTER TYPE "public"."catalog_kind" ADD VALUE 'plastic_code';--> statement-breakpoint
ALTER TYPE "public"."catalog_kind" ADD VALUE 'pipe_code';--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "mount_kind" text;