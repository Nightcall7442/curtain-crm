ALTER TABLE "users" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_locale_known" CHECK ("users"."locale" in ('ru', 'uz'));