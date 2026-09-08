-- Карниз становится отдельной работой со своим исполнителем.
--
-- Заказы, заведённые ДО этой миграции, остаются с `not_required` намеренно.
-- Раньше карниз вешали в рамках установки, и о том, повешен ли он у заказа,
-- который уже в цехе, в базе нет ни одной записи. Проставить им «ждёт
-- карнизчика» означало бы создать очередь из работ, половина которых давно
-- сделана. Новый порядок действует для новых заказов.
CREATE TYPE "public"."cornice_status" AS ENUM('not_required', 'pending', 'in_progress', 'done');--> statement-breakpoint
ALTER TYPE "public"."photo_stage" ADD VALUE 'cornice' BEFORE 'install_before';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cornice_status" "cornice_status" DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cornice_installer_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cornice_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cornice_installer_id_users_id_fk" FOREIGN KEY ("cornice_installer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_cornice_status_idx" ON "orders" USING btree ("cornice_status");