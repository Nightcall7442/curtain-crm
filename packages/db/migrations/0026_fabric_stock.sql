CREATE TABLE "fabric_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"kind" "catalog_kind" NOT NULL,
	"code" varchar(100) NOT NULL,
	"meters" numeric(12, 3) DEFAULT '0' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fabric_stock_code_not_blank" CHECK (length(btrim("fabric_stock"."code")) > 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fabric_written_off_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fabric_stock" ADD CONSTRAINT "fabric_stock_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fabric_stock" ADD CONSTRAINT "fabric_stock_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fabric_stock_branch_kind_code_unique" ON "fabric_stock" USING btree ("branch_id","kind",lower("code"));--> statement-breakpoint
CREATE INDEX "fabric_stock_branch_kind_idx" ON "fabric_stock" USING btree ("branch_id","kind");