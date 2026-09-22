-- Терминальный чек — отдельный вид записи, не движение денег.
--
-- Владелец: «терминальный чек к кассе отношения не имеет». Раньше пробитый
-- чек заводился прочим приходом по карте и увеличивал «На счёте». Теперь у
-- него свой вид: в приход не входит, в кассу и на счёт не попадает,
-- считается только норма дня.
--
-- Тип пересоздаётся целиком, а не `ADD VALUE`: добавленное значение
-- перечисления нельзя использовать до конца транзакции, а перенос строк
-- ниже идёт в той же. Проверки, ссылающиеся на `kind`, на время подмены
-- снимаются и возвращаются как были.
ALTER TABLE "payments" DROP CONSTRAINT "payments_payroll_link";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_day_only_payroll";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_collection_cash";--> statement-breakpoint
CREATE TYPE "public"."payment_kind_next" AS ENUM('order_deposit', 'order_balance', 'ready_made', 'other', 'collection', 'payroll', 'refund', 'terminal_check');--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "kind" TYPE "public"."payment_kind_next" USING "kind"::text::"public"."payment_kind_next";--> statement-breakpoint
DROP TYPE "public"."payment_kind";--> statement-breakpoint
ALTER TYPE "public"."payment_kind_next" RENAME TO "payment_kind";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payroll_link" CHECK (("payments"."kind" = 'payroll') = ("payments"."payroll_record_id" is not null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_day_only_payroll" CHECK ("payments"."day" is null or "payments"."kind" = 'payroll');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_collection_cash" CHECK ("payments"."kind" <> 'collection' or "payments"."method" = 'cash');--> statement-breakpoint
-- Уже пробитые чеки: приход по карте с фото, не привязанный ни к заказу, ни
-- к чеку витрины, — это и есть терминальный чек, заведённый по-старому.
UPDATE "payments" SET "kind" = 'terminal_check'
WHERE "kind" = 'other' AND "method" = 'card' AND "photo_key" IS NOT NULL
  AND "order_id" IS NULL AND "retail_sale_id" IS NULL;
