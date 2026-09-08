ALTER TABLE "order_items" DROP CONSTRAINT "order_items_protection_code_required";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_stage_fees_non_negative";--> statement-breakpoint
-- Тюль и карниз были свободным текстом с одним лишь кодом. Прямое приведение
-- к jsonb упало бы на первой же строке: «Т-22» — не JSON. USING заворачивает
-- код в ту же форму, что и у остальных материалов, а метраж и описание
-- оставляет пустыми: их в старых заказах никто не записывал, и выдумывать их
-- задним числом хуже, чем показать прочерк.
ALTER TABLE "order_items"
  ALTER COLUMN "tulle" TYPE jsonb
  USING (
    CASE
      WHEN "tulle" IS NULL OR trim("tulle") = '' THEN NULL
      ELSE jsonb_build_object('code', trim("tulle"), 'meters', NULL, 'description', NULL)
    END
  );--> statement-breakpoint
ALTER TABLE "order_items"
  ALTER COLUMN "cornice" TYPE jsonb
  USING (
    CASE
      WHEN "cornice" IS NULL OR trim("cornice") = '' THEN NULL
      ELSE jsonb_build_object('code', trim("cornice"), 'meters', NULL, 'description', NULL)
    END
  );--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "protection" jsonb;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "plastic" jsonb;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "pipe" jsonb;--> statement-breakpoint
-- Защита переезжает из пары «галочка + код» в такую же строку материала.
-- Галочка без кода (так заводились заказы до прошлой миграции) не пропадает:
-- код у неё пустой, поэтому в новой строке остаётся прочерк вместо кода —
-- сам факт защиты виден, а несуществующий код не выдуман.
UPDATE "order_items"
SET "protection" = jsonb_build_object(
  'code', coalesce(nullif(trim("protection_code"), ''), '—'),
  'meters', NULL,
  'description', NULL
)
WHERE "has_protection";--> statement-breakpoint
-- Портьеры легли прошлой миграцией как «код + количество». Количество ушло:
-- ткань меряют метрами, а не штуками, и спрашивать «сколько портьер этого
-- кода» оказалось не тем вопросом. Коды переносятся, метраж пустой.
UPDATE "order_items"
SET "portieres" = (
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('code', p->>'code', 'meters', NULL, 'description', NULL)),
    '[]'::jsonb
  )
  FROM jsonb_array_elements("portieres") AS p
)
WHERE jsonb_array_length("portieres") > 0;--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "has_protection";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "protection_code";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cornice_fee" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_stage_fees_non_negative" CHECK ("orders"."measurement_fee" >= 0 and "orders"."cutting_fee" >= 0
          and "orders"."sewing_fee" >= 0 and "orders"."qc_fee" >= 0
          and "orders"."cornice_fee" >= 0 and "orders"."installation_fee" >= 0);
