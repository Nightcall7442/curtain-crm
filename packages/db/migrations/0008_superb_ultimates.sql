ALTER TABLE "payroll_schemes" DROP CONSTRAINT "payroll_schemes_fields_match_type";--> statement-breakpoint
DROP INDEX "payroll_schemes_single_active_per_role";--> statement-breakpoint
ALTER TABLE "payroll_schemes" ADD COLUMN "user_id" integer;--> statement-breakpoint
INSERT INTO "payroll_schemes" (
	"user_id", "role", "type", "base_amount", "rate", "kpi_target",
	"commission_percent", "is_active", "effective_from", "created_by",
	"created_at", "updated_at"
)
SELECT
	ur."user_id", s."role", s."type", s."base_amount", s."rate", s."kpi_target",
	s."commission_percent", s."is_active", s."effective_from", s."created_by",
	s."created_at", s."updated_at"
FROM "payroll_schemes" s
JOIN "user_roles" ur ON ur."role" = s."role"
JOIN "users" u ON u."id" = ur."user_id" AND u."is_active"
WHERE s."user_id" IS NULL;--> statement-breakpoint
DELETE FROM "payroll_schemes" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "payroll_schemes" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_schemes" ADD CONSTRAINT "payroll_schemes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_schemes_single_active_per_user_role" ON "payroll_schemes" USING btree ("user_id","role") WHERE "payroll_schemes"."is_active";--> statement-breakpoint
CREATE INDEX "payroll_schemes_user_idx" ON "payroll_schemes" USING btree ("user_id","effective_from");--> statement-breakpoint
ALTER TABLE "payroll_schemes" ADD CONSTRAINT "payroll_schemes_fields_match_type" CHECK (("payroll_schemes"."type" = 'fixed' and "payroll_schemes"."base_amount" is not null)
       or ("payroll_schemes"."type" = 'hourly' and "payroll_schemes"."rate" is not null)
       or ("payroll_schemes"."type" = 'kpi' and "payroll_schemes"."base_amount" is not null
            and "payroll_schemes"."rate" is not null
            and "payroll_schemes"."kpi_target" is not null and "payroll_schemes"."kpi_target" > 0)
       or ("payroll_schemes"."type" = 'commission' and "payroll_schemes"."commission_percent" is not null)
       or ("payroll_schemes"."type"::text = 'per_order' and "payroll_schemes"."rate" is not null));