CREATE TABLE "work_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" "role" NOT NULL,
	"user_id" integer,
	"effective_from" date NOT NULL,
	"target" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_plans_role_user_month_unique" UNIQUE NULLS NOT DISTINCT("role","user_id","effective_from"),
	CONSTRAINT "work_plans_role_planned" CHECK ("work_plans"."role" in ('sewer', 'installer', 'cornice_installer')),
	CONSTRAINT "work_plans_effective_from_first_day" CHECK (extract(day from "work_plans"."effective_from") = 1),
	CONSTRAINT "work_plans_target_positive" CHECK ("work_plans"."target" > 0),
	CONSTRAINT "work_plans_norm_has_target" CHECK ("work_plans"."user_id" is not null or "work_plans"."target" is not null)
);
--> statement-breakpoint
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;