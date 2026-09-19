-- Новые виды проводок. Не ADD VALUE: добавленное значение перечисления нельзя
-- использовать до конца транзакции, а мигратор выполняет весь файл одной
-- транзакцией — и перенос данных ниже упал бы. Тип пересоздаётся целиком.
CREATE TYPE "public"."payment_kind_next" AS ENUM('order_deposit', 'order_balance', 'ready_made', 'other', 'collection', 'payroll', 'refund');--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "kind" TYPE "public"."payment_kind_next" USING "kind"::text::"public"."payment_kind_next";--> statement-breakpoint
DROP TYPE "public"."payment_kind";--> statement-breakpoint
ALTER TYPE "public"."payment_kind_next" RENAME TO "payment_kind";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payroll_record_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "day" date;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "photo_key" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payroll_record_id_payroll_records_id_fk" FOREIGN KEY ("payroll_record_id") REFERENCES "public"."payroll_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_payroll_record_idx" ON "payments" USING btree ("payroll_record_id");--> statement-breakpoint
CREATE INDEX "payments_method_received_at_idx" ON "payments" USING btree ("method","received_at");--> statement-breakpoint
ALTER TABLE "orders" RENAME COLUMN "deposit" TO "paid_amount";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_deposit_non_negative";--> statement-breakpoint
ALTER TABLE "orders" drop column "remaining_payment";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "remaining_payment" numeric(14, 2) GENERATED ALWAYS AS (work_price - paid_amount) STORED;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_non_negative" CHECK ("orders"."paid_amount" >= 0);--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Одна книга проводок. Перенос данных из четырёх учётов — до того, как
-- старые таблицы и поле «предоплата» исчезнут. Каждый перенос сохраняет
-- время, сумму, чьи руки и филиал; чего не было — берётся из владельца
-- записи (его основной филиал), а если и его нет — первый филиал.
-- ---------------------------------------------------------------------------
-- Инкассации.
INSERT INTO "payments" (branch_id, kind, method, amount, comment, received_by, received_at)
SELECT c.branch_id, 'collection', 'cash', c.amount, c.comment, c.user_id, c.created_at
FROM "cash_collections" c;--> statement-breakpoint
-- Терминальные чеки — приход по карте с фото. Чеки без суммы (заведены до
-- того, как сумму стали спрашивать) переносятся с одним тийином и пометкой:
-- фото и штука в норме дня важнее, чем ноль, которого книга не принимает.
INSERT INTO "payments" (branch_id, kind, method, amount, comment, photo_key, received_by, received_at)
SELECT coalesce(t.branch_id,
         (select ub.branch_id from user_branches ub where ub.user_id = t.user_id order by ub.is_primary desc, ub.branch_id limit 1),
         (select min(id) from branches)),
       'other', 'card',
       CASE WHEN t.amount > 0 THEN t.amount ELSE 0.01 END,
       CASE WHEN t.amount > 0 THEN t.comment ELSE concat_ws(' · ', t.comment, 'сумма не указана при переносе') END,
       t.photo_key, t.user_id, t.created_at
FROM "terminal_checks" t;--> statement-breakpoint
-- Выплаты по дням.
INSERT INTO "payments" (branch_id, kind, method, amount, payroll_record_id, day, received_by, received_at)
SELECT coalesce(
         (select ub.branch_id from user_branches ub where ub.user_id = r.user_id order by ub.is_primary desc, ub.branch_id limit 1),
         (select min(id) from branches)),
       'payroll', 'cash', p.amount, p.record_id, p.day, p.paid_by, p.paid_at
FROM "payroll_payouts" p JOIN "payroll_records" r ON r.id = p.record_id;--> statement-breakpoint
-- Выплаты одной суммой (до выплат по дням): разница между выплаченным по расчёту и суммой его дней.
INSERT INTO "payments" (branch_id, kind, method, amount, payroll_record_id, received_by, received_at)
SELECT coalesce(
         (select ub.branch_id from user_branches ub where ub.user_id = r.user_id order by ub.is_primary desc, ub.branch_id limit 1),
         (select min(id) from branches)),
       'payroll', 'cash',
       r.paid_amount - coalesce((select sum(p.amount) from "payroll_payouts" p where p.record_id = r.id), 0),
       r.id, coalesce(r.approved_by, r.user_id), coalesce(r.paid_at, now())
FROM "payroll_records" r
WHERE r.paid_amount - coalesce((select sum(p.amount) from "payroll_payouts" p where p.record_id = r.id), 0) > 0;--> statement-breakpoint
-- Заказы, у которых «предоплата» больше, чем проводок по ним (заведены до книги): недостающее — первой оплатой наличными.
INSERT INTO "payments" (branch_id, kind, method, amount, order_id, comment, received_by, received_at)
SELECT o.branch_id, 'order_deposit', 'cash',
       o.paid_amount - coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from "payments" p where p.order_id = o.id), 0),
       o.id, 'перенос из поля «предоплата»', o.created_by, o.created_at
FROM "orders" o
WHERE o.paid_amount - coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from "payments" p where p.order_id = o.id), 0) > 0;--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- «Оплачено» у заказа поддерживает база: на каждую проводку по заказу
-- пересчитывается сумма приходов минус возвраты. Приложение колонку не пишет.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION orders_sync_paid_amount() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  affected integer;
BEGIN
  FOR affected IN
    SELECT DISTINCT unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.order_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.order_id END
    ])
  LOOP
    IF affected IS NOT NULL THEN
      UPDATE orders SET paid_amount = coalesce((
        SELECT sum(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END)
        FROM payments p
        WHERE p.order_id = affected AND p.kind IN ('order_deposit', 'order_balance', 'ready_made', 'other', 'refund')
      ), 0)
      WHERE id = affected;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER payments_sync_order_paid
AFTER INSERT OR UPDATE OR DELETE ON "payments"
FOR EACH ROW EXECUTE FUNCTION orders_sync_paid_amount();--> statement-breakpoint
-- Первичная сверка: «оплачено» у всех заказов — из книги.
UPDATE "orders" o SET paid_amount = coalesce((
  SELECT sum(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END)
  FROM "payments" p WHERE p.order_id = o.id
), 0);--> statement-breakpoint
ALTER TABLE "cash_collections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "terminal_checks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_payouts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "cash_collections" CASCADE;--> statement-breakpoint
DROP TABLE "terminal_checks" CASCADE;--> statement-breakpoint
DROP TABLE "payroll_payouts" CASCADE;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payroll_link" CHECK (("payments"."kind" = 'payroll') = ("payments"."payroll_record_id" is not null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_day_only_payroll" CHECK ("payments"."day" is null or "payments"."kind" = 'payroll');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_collection_cash" CHECK ("payments"."kind" <> 'collection' or "payments"."method" = 'cash');
