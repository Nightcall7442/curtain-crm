-- Догоняем 0048 на базе, где она прошла первой редакцией.
--
-- 0048 правили после того, как Railway её уже применил: колонка `opening`,
-- уникальность выплаты по дню, склейка терминальных чеков с приходом по
-- карте и пометка переносов появились в файле, который мигратор считает
-- выполненным. Касса упала на `column "opening" does not exist`.
-- На чистой базе всё это делает сама 0048 — отсюда IF NOT EXISTS и
-- условия «только если ещё не сделано».
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "opening" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_payroll_day_unique" ON "payments" USING btree ("payroll_record_id","day") WHERE "payments"."day" is not null;--> statement-breakpoint
-- Переносы «предоплаты» первая редакция записала обычным приходом — они
-- попадали в «на руках» и «в кассе», хотя через систему не проходили.
UPDATE "payments" SET "opening" = true
WHERE "comment" = 'перенос из поля «предоплата»' AND NOT "opening";--> statement-breakpoint
-- Терминальный чек, снятый к уже принятой по карте сумме (тот же человек,
-- тот же день, та же сумма), первая редакция завела вторым приходом.
-- Фото — к исходному приходу, дубль — долой. Одним запросом: после переноса
-- фото исходный приход сам стал бы похож на дубль, и отдельный DELETE снёс
-- бы оба.
WITH pairs AS (
  SELECT DISTINCT ON (dup.id) dup.id AS dup_id, dup.photo_key, orig.id AS orig_id
  FROM "payments" dup
  JOIN "payments" orig
    ON orig.received_by = dup.received_by AND orig.method = 'card'
   AND orig.photo_key IS NULL AND orig.amount = dup.amount
   AND (orig.received_at AT TIME ZONE 'Asia/Tashkent')::date = (dup.received_at AT TIME ZONE 'Asia/Tashkent')::date
  WHERE dup.kind = 'other' AND dup.method = 'card' AND dup.photo_key IS NOT NULL AND dup.order_id IS NULL
  ORDER BY dup.id, abs(extract(epoch from (orig.received_at - dup.received_at)))
), moved AS (
  UPDATE "payments" p SET "photo_key" = pairs.photo_key
  FROM pairs WHERE p.id = pairs.orig_id
  RETURNING pairs.dup_id
)
DELETE FROM "payments" WHERE id IN (SELECT dup_id FROM moved);
