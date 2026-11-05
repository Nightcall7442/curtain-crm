CREATE TYPE "public"."terminal_pay_type" AS ENUM('click', 'payme', 'uzum', 'humo', 'uzcard', 'cash');--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "terminal_pay_type" "terminal_pay_type";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_terminal_pay_type_only_checks" CHECK ("payments"."terminal_pay_type" is null or "payments"."kind" = 'terminal_check');