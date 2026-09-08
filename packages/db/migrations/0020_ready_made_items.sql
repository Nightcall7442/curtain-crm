CREATE TABLE "ready_made_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"model" varchar(200) NOT NULL,
	"code" varchar(100),
	"color" varchar(100),
	"width_cm" numeric(6, 1) NOT NULL,
	"height_cm" numeric(6, 1) NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"photo_key" text,
	"comment" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ready_made_items_price_non_negative" CHECK ("ready_made_items"."price" >= 0),
	CONSTRAINT "ready_made_items_quantity_non_negative" CHECK ("ready_made_items"."quantity" >= 0),
	CONSTRAINT "ready_made_items_dimensions_positive" CHECK ("ready_made_items"."width_cm" > 0 and "ready_made_items"."height_cm" > 0)
);
--> statement-breakpoint
ALTER TABLE "ready_made_items" ADD CONSTRAINT "ready_made_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ready_made_items" ADD CONSTRAINT "ready_made_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ready_made_items_branch_model_idx" ON "ready_made_items" USING btree ("branch_id",lower("model"));--> statement-breakpoint
CREATE INDEX "ready_made_items_active_idx" ON "ready_made_items" USING btree ("is_active");