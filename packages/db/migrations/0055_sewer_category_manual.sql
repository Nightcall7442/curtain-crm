-- Категория швеи, поставленная руками. `null` — считается сама, по рейтингу.
-- (Значение перечисления `terminal_check` генератор предложил заново: 0053
-- была написана вручную и снимок схемы не обновила. Строка вычищена —
-- значение уже есть.)
ALTER TABLE "users" ADD COLUMN "sewer_category" smallint;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_sewer_category_range" CHECK ("users"."sewer_category" between 1 and 3);