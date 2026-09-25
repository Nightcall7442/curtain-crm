-- Убираем следы обкатки: журнал действий, тестовые учётки, готовые шторы
-- и прайс витрины, заведённые во время проверки.
--
-- Продолжение обнуления (0058). Там стёрлась работа — заказы, смены,
-- деньги; здесь уходит то, что осталось лежать списками и мозолит глаза
-- владельцу: восемь учёток «Тестовая учётка (удалить после проверки)»,
-- готовые шторы из тестовых пошивов и две позиции витрины.
--
-- Журнал действий тоже чистится: он весь про обкатку, и первая настоящая
-- запись должна открывать журнал, а не теряться среди тестовых.

-- Журнал. Сносится первым: на него ничего не ссылается, зато он сам
-- держит сотрудников внешним ключом и не дал бы их удалить.
DELETE FROM "audit_log";--> statement-breakpoint

-- Готовые шторы и прайс витрины: оба списка набиты тестовыми изделиями,
-- остатки по ним и так обнулены предыдущей миграцией.
DELETE FROM "ready_made_items";--> statement-breakpoint
DELETE FROM "retail_items";--> statement-breakpoint

/*
  Тестовые учётки.

  Одним блоком, а не десятком запросов: список удаляемых нужен каждому шагу,
  а повторять его подзапросом двенадцать раз — верный способ однажды описаться
  в одном из них и снести живого сотрудника.

  Узнаются по должности, которую им и проставили («удалить после проверки»),
  и по служебным номерам вида +998 90 000 00 0X. Директор исключён дважды:
  по роли и по идентификатору — никакая опечатка в условии не должна
  оставить мастерскую без владельца.

  Чужие строки, где тестовый сотрудник указан автором (позиция справочника,
  выданная роль, условия оплаты), не удаляются, а переписываются на
  директора: сами эти записи настоящие и нужны. Там, где автор может
  отсутствовать, ставится NULL — врать про авторство незачем.
*/
DO $$
DECLARE
  boss integer;
  victims integer[];
BEGIN
  SELECT u.id INTO boss
    FROM "users" u
    JOIN "user_roles" r ON r.user_id = u.id AND r.role = 'ceo'
   ORDER BY u.id
   LIMIT 1;

  IF boss IS NULL THEN
    RAISE EXCEPTION 'Директор не найден: некому передать авторство записей';
  END IF;

  SELECT array_agg(id) INTO victims
    FROM "users"
   WHERE ("job_title" = 'Тестовая учётка (удалить после проверки)'
          OR "phone" LIKE '+99890000000%')
     AND id <> boss
     AND id NOT IN (SELECT "user_id" FROM "user_roles" WHERE "role" = 'ceo');

  IF victims IS NULL THEN
    RETURN;
  END IF;

  UPDATE "catalog_items"     SET "created_by"  = NULL WHERE "created_by"  = ANY(victims);
  UPDATE "day_off_requests"  SET "reviewed_by" = NULL WHERE "reviewed_by" = ANY(victims);
  UPDATE "purchase_items"    SET "created_by"  = boss WHERE "created_by"  = ANY(victims);
  UPDATE "events"            SET "created_by"  = boss WHERE "created_by"  = ANY(victims);
  UPDATE "user_roles"        SET "granted_by"  = boss WHERE "granted_by"  = ANY(victims);
  UPDATE "payroll_schemes"   SET "created_by"  = boss WHERE "created_by"  = ANY(victims);

  -- Своё — вместе с человеком: условия оплаты, заявки на выходной,
  -- личные работы, сообщения и поручения.
  DELETE FROM "payroll_schemes"  WHERE "user_id"  = ANY(victims);
  DELETE FROM "day_off_requests" WHERE "user_id"  = ANY(victims);
  DELETE FROM "personal_works"   WHERE "user_id"  = ANY(victims);
  DELETE FROM "task_messages"    WHERE "author_id" = ANY(victims);
  DELETE FROM "tasks"            WHERE "created_by" = ANY(victims) OR "assignee_id" = ANY(victims);

  -- Роли, филиалы, токены входа и уведомления уходят каскадом.
  DELETE FROM "users" WHERE id = ANY(victims);
END $$;
