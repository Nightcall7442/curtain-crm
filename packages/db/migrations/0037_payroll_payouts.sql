CREATE TABLE "payroll_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_id" integer NOT NULL,
	"day" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_by" integer NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_payouts_amount_positive" CHECK ("payroll_payouts"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payroll_payouts" ADD CONSTRAINT "payroll_payouts_record_id_payroll_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."payroll_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payouts" ADD CONSTRAINT "payroll_payouts_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_payouts_record_day_unique" ON "payroll_payouts" USING btree ("record_id","day");