-- Скидка клиенту: сколько сняли с цены и почему. `work_price` — уже со скидкой.
-- (Снимок схемы до этой миграции отставал от 0048: `payments.opening` и индекс
-- выплат по дню генератор предложил заново — они уже есть, 0050 их догнала.)
ALTER TABLE "orders" ADD COLUMN "discount_amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_non_negative" CHECK ("orders"."discount_amount" >= 0);