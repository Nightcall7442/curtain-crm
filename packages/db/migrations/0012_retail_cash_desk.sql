CREATE TABLE "retail_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"unit" "purchase_unit" DEFAULT 'pcs' NOT NULL,
	"category" "purchase_category" DEFAULT 'other' NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"stock_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retail_items_price_non_negative" CHECK ("retail_items"."price" >= 0),
	CONSTRAINT "retail_items_stock_non_negative" CHECK ("retail_items"."stock_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "retail_sale_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"item_name" text NOT NULL,
	"unit" "purchase_unit" NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"line_total" numeric(14, 2) GENERATED ALWAYS AS (round(unit_price * quantity, 2)) STORED,
	CONSTRAINT "retail_sale_items_quantity_positive" CHECK ("retail_sale_items"."quantity" > 0),
	CONSTRAINT "retail_sale_items_price_non_negative" CHECK ("retail_sale_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "retail_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"client_name" text,
	"client_phone" text,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retail_sales_client_phone_e164" CHECK ("retail_sales"."client_phone" is null or "retail_sales"."client_phone" ~ '^\+998[0-9]{9}$')
);
--> statement-breakpoint
ALTER TABLE "retail_items" ADD CONSTRAINT "retail_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD CONSTRAINT "retail_sale_items_sale_id_retail_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."retail_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD CONSTRAINT "retail_sale_items_item_id_retail_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."retail_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "retail_items_active_name_unique" ON "retail_items" USING btree (lower("name")) WHERE "retail_items"."is_active";--> statement-breakpoint
CREATE INDEX "retail_items_category_idx" ON "retail_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "retail_sale_items_sale_idx" ON "retail_sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "retail_sale_items_item_idx" ON "retail_sale_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "retail_sales_created_idx" ON "retail_sales" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "retail_sales_seller_idx" ON "retail_sales" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "retail_sales_branch_idx" ON "retail_sales" USING btree ("branch_id","created_at");