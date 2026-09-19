/*
  Пошив для склада: третий тип заказа — цех шьёт штору заранее, без клиента
  и без установки, чтобы она легла на витрину готовых штор.

  Не ADD VALUE: новое значение перечисления нельзя использовать до конца
  транзакции, а мигратор выполняет все ожидающие файлы одной транзакцией —
  на чистой базе (CI, новый стенд) миграция 0042 падала на «stock». Тип
  пересоздаётся целиком; генерируемая колонка номера зависит от типа и на
  время пересоздания снимается вместе со своим уникальным индексом.
*/
ALTER TABLE "orders" DROP COLUMN "order_number";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "order_type" DROP DEFAULT;--> statement-breakpoint
CREATE TYPE "public"."order_type_next" AS ENUM('custom', 'ready_made', 'stock');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "order_type" TYPE "public"."order_type_next" USING "order_type"::text::"public"."order_type_next";--> statement-breakpoint
DROP TYPE "public"."order_type";--> statement-breakpoint
ALTER TYPE "public"."order_type_next" RENAME TO "order_type";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "order_type" SET DEFAULT 'custom';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_number" text GENERATED ALWAYS AS ((case when order_type = 'ready_made' then 'TDH-' else 'DH-' end) || lpad(id::text, 6, '0')) STORED;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique" ON "orders" USING btree ("order_number");
