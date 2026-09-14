CREATE TYPE "public"."payment_kind" AS ENUM('order_deposit', 'order_balance', 'ready_made', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'qr', 'click');--> statement-breakpoint
CREATE TABLE "cash_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_collections_amount_positive" CHECK ("cash_collections"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"order_id" integer,
	"retail_sale_id" integer,
	"comment" text,
	"received_by" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "price" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "unit" "purchase_unit";--> statement-breakpoint
ALTER TABLE "cash_collections" ADD CONSTRAINT "cash_collections_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_collections" ADD CONSTRAINT "cash_collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_retail_sale_id_retail_sales_id_fk" FOREIGN KEY ("retail_sale_id") REFERENCES "public"."retail_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_collections_user_idx" ON "cash_collections" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "cash_collections_created_at_idx" ON "cash_collections" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payments_received_at_idx" ON "payments" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_received_by_idx" ON "payments" USING btree ("received_by","method");