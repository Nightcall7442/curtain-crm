/*
  Остатков на складе больше нет: ни прихода, ни расхода, ни списания.

  Учёт метров не прижился — за полкой он не поспевал, и колонка «Остаток»
  показывала минусы там, где ткань просто не успели завести. Склад остаётся
  списком того, что бывает: код с бирки и мини-описание к нему.

  Коды из `fabric_stock` перед удалением таблицы переезжают в справочник —
  тот самый, из которого продавец выбирает код в заказе. Иначе заведённое
  кладовщиком пропало бы вместе с метрами.
*/
INSERT INTO "catalog_items" ("kind", "name", "description", "created_by")
SELECT DISTINCT ON ("s"."kind", lower(btrim("s"."code")))
  "s"."kind", btrim("s"."code"), "s"."description", "s"."created_by"
FROM "fabric_stock" "s"
WHERE btrim("s"."code") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "catalog_items" "c"
    WHERE "c"."kind" = "s"."kind" AND lower("c"."name") = lower(btrim("s"."code"))
  )
ORDER BY "s"."kind", lower(btrim("s"."code")), "s"."id";--> statement-breakpoint

/* Описание, заведённое на складе, дополняет пустое описание кода. */
UPDATE "catalog_items" "c"
SET "description" = "s"."description"
FROM "fabric_stock" "s"
WHERE "c"."kind" = "s"."kind"
  AND lower("c"."name") = lower(btrim("s"."code"))
  AND "c"."description" IS NULL
  AND "s"."description" IS NOT NULL;--> statement-breakpoint

DROP TABLE "fabric_stock" CASCADE;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "fabric_written_off_at";