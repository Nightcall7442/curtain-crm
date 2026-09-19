-- Уникальность номера заказа. Миграция 0042 пересоздала генерируемую
-- колонку номера и не вернула индекс — на базах, где она уже прошла, его
-- нет. На чистой базе индекс создаёт исправленная 0042, поэтому IF NOT EXISTS.
CREATE UNIQUE INDEX IF NOT EXISTS "orders_order_number_unique" ON "orders" USING btree ("order_number");
