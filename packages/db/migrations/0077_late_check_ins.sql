-- Факты опоздания вместо снимков одобрения.
--
-- Записи дисциплины об опоздании больше не правятся по цепочке решений:
-- сервер выводит их заново из фактов первой отметки дня и решений
-- руководства (`evaluateMonthLateness`). Снимок записи до одобрения
-- (`late_requests.lateness_before_approval`, 0076) больше не нужен — факт
-- хранит то, что было, сам.
CREATE TABLE "late_check_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"check_in_time" time NOT NULL,
	"schedule_start" time NOT NULL,
	"shift_id" integer,
	"forgiven_at" timestamp with time zone,
	"forgiven_by" integer,
	"stashed_comment" text,
	"stashed_comment_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "late_check_ins_late" CHECK ("late_check_ins"."check_in_time" > "late_check_ins"."schedule_start"),
	CONSTRAINT "late_check_ins_forgiven_pair" CHECK (("late_check_ins"."forgiven_at" is null) = ("late_check_ins"."forgiven_by" is null))
);
--> statement-breakpoint
ALTER TABLE "late_check_ins" ADD CONSTRAINT "late_check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_check_ins" ADD CONSTRAINT "late_check_ins_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_check_ins" ADD CONSTRAINT "late_check_ins_forgiven_by_users_id_fk" FOREIGN KEY ("forgiven_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "late_check_ins_user_day" ON "late_check_ins" USING btree ("user_id","day");--> statement-breakpoint
-- Факты из уже записанных опозданий. Отметку и начало по графику система
-- записала в пояснение («Смена с 09:00, отметка в 09:22 — опоздание 22 мин»),
-- разбираем его. Часы и минуты — строгим шаблоном: приведение к time на
-- кривой строке уронило бы всю миграцию, а чужой текст просто пропускается.
--
-- Сначала — снимки одобрений, которые в силе: одобрение уже переписало
-- запись от «приду к» (или сняло её), и исходная отметка с графиком лежит
-- только в снимке. Поправленную одобрением запись руководитель мог потом
-- простить руками — тогда её строки нет, и факта не будет: прощение сильнее.
-- У снятой одобрением записи объяснение сотрудника жило в снимке —
-- переносим его в факт, чтобы снятие согласования вернуло запись с ним.
-- На проде таблицы запросов до этого выпуска не было, и шаг пуст.
INSERT INTO "late_check_ins" ("user_id", "day", "check_in_time", "schedule_start", "stashed_comment", "stashed_comment_at")
SELECT
  r."user_id",
  r."date",
  m[2]::time,
  m[1]::time,
  CASE WHEN r."lateness_before_approval" ->> 'change' = 'removed' THEN r."lateness_before_approval" -> 'row' ->> 'employeeComment' END,
  CASE
    WHEN r."lateness_before_approval" ->> 'change' = 'removed'
     AND r."lateness_before_approval" -> 'row' ->> 'employeeCommentAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$'
    THEN (r."lateness_before_approval" -> 'row' ->> 'employeeCommentAt')::timestamptz
  END
FROM "late_requests" r
CROSS JOIN LATERAL regexp_match(
  r."lateness_before_approval" -> 'row' ->> 'description',
  '^Смена с ((?:[01]?[0-9]|2[0-3]):[0-5][0-9]), отметка в ((?:[01]?[0-9]|2[0-3]):[0-5][0-9]) — опоздание [0-9]+ мин$'
) AS m
WHERE r."status" = 'approved'
  AND r."lateness_before_approval" -> 'row' ->> 'occurredOn' = r."date"::text
  AND m IS NOT NULL
  AND m[2]::time > m[1]::time
  AND (
    r."lateness_before_approval" ->> 'change' = 'removed'
    OR EXISTS (
      SELECT 1 FROM "discipline_events" d
      WHERE d."user_id" = r."user_id" AND d."id"::text = r."lateness_before_approval" -> 'row' ->> 'id'
    )
  )
ON CONFLICT ("user_id", "day") DO NOTHING;--> statement-breakpoint
-- Затем — записи системы (`recorded_by` — сам сотрудник): за день одна,
-- лишние — след старой ошибки, берём самую раннюю разобранную.
INSERT INTO "late_check_ins" ("user_id", "day", "check_in_time", "schedule_start")
SELECT DISTINCT ON (d."user_id", d."occurred_on")
  d."user_id",
  d."occurred_on",
  m[2]::time,
  m[1]::time
FROM "discipline_events" d
CROSS JOIN LATERAL regexp_match(
  d."description",
  '^Смена с ((?:[01]?[0-9]|2[0-3]):[0-5][0-9]), отметка в ((?:[01]?[0-9]|2[0-3]):[0-5][0-9]) — опоздание [0-9]+ мин$'
) AS m
WHERE d."kind" IN ('late_under_15', 'late_15_30', 'late_over_30')
  AND d."recorded_by" = d."user_id"
  AND m IS NOT NULL
  AND m[2]::time > m[1]::time
ORDER BY d."user_id", d."occurred_on", d."id"
ON CONFLICT ("user_id", "day") DO NOTHING;--> statement-breakpoint
ALTER TABLE "late_requests" DROP CONSTRAINT "late_requests_snapshot_only_when_approved";--> statement-breakpoint
ALTER TABLE "late_requests" DROP COLUMN "lateness_before_approval";
