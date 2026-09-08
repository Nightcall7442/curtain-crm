CREATE TYPE "public"."cornice_rotation" AS ENUM('both', 'left', 'right');--> statement-breakpoint
-- Поле было свободным текстом — продавцы писали «левый», «Правый», «оба»,
-- «П-образный» и что угодно ещё. Прямое приведение к перечислению упало бы
-- на первой же строке, не совпавшей с одним из трёх значений буквально.
-- USING сопоставляет узнаваемые написания, а всё остальное (в том числе
-- «П-образный» — четвёртого варианта в перечислении нет) переводит в NULL:
-- потерять устаревшую пометку безопаснее, чем выдумать ей значение.
ALTER TABLE "order_items"
  ALTER COLUMN "cornice_rotation" TYPE cornice_rotation
  USING (
    CASE lower(trim("cornice_rotation"))
      WHEN 'both' THEN 'both'
      WHEN 'оба' THEN 'both'
      WHEN 'left' THEN 'left'
      WHEN 'левый' THEN 'left'
      WHEN 'лево' THEN 'left'
      WHEN 'right' THEN 'right'
      WHEN 'правый' THEN 'right'
      WHEN 'право' THEN 'right'
      ELSE NULL
    END
  )::cornice_rotation;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "portieres" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "protection_code" text;--> statement-breakpoint
-- NOT VALID: у заказов, заведённых до этой миграции, «нужна антимоскитная
-- сетка» стояла без кода — самого поля тогда не было. Требовать код задним
-- числом означало бы либо выдумать его, либо уронить миграцию на первой же
-- такой строке. Ограничение действует для всех НОВЫХ и ИЗМЕНЯЕМЫХ строк
-- сразу же — не проверяются только те, что легли в базу до него.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_protection_code_required" CHECK (not "order_items"."has_protection" or "order_items"."protection_code" is not null) NOT VALID;