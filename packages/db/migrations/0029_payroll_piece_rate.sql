/*
  Сдельный тип оплаты: «От расценки».

  Сравнение с `::text`, как и у `per_order` выше, не украшение: drizzle
  прогоняет все накопившиеся миграции одной транзакцией, а новое значение
  enum-типа в той же транзакции использовать нельзя. Через текст ограничение
  добавляется сразу, без второй миграции «на потом», о которой забывают.
*/
ALTER TYPE "public"."payroll_scheme_type" ADD VALUE 'piece_rate';--> statement-breakpoint
ALTER TABLE "payroll_schemes" DROP CONSTRAINT "payroll_schemes_fields_match_type";--> statement-breakpoint
ALTER TABLE "payroll_schemes" ADD CONSTRAINT "payroll_schemes_fields_match_type" CHECK (("payroll_schemes"."type" = 'fixed' and "payroll_schemes"."base_amount" is not null)
       or ("payroll_schemes"."type" = 'hourly' and "payroll_schemes"."rate" is not null)
       or ("payroll_schemes"."type" = 'kpi' and "payroll_schemes"."base_amount" is not null
            and "payroll_schemes"."rate" is not null
            and "payroll_schemes"."kpi_target" is not null and "payroll_schemes"."kpi_target" > 0)
       or ("payroll_schemes"."type" = 'commission' and "payroll_schemes"."commission_percent" is not null)
       or ("payroll_schemes"."type"::text = 'per_order' and "payroll_schemes"."rate" is not null)
       or ("payroll_schemes"."type"::text = 'piece_rate'));