ALTER TABLE "terminal_checks" ADD COLUMN "amount" numeric(14, 2) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "terminal_checks" ALTER COLUMN "amount" DROP DEFAULT;