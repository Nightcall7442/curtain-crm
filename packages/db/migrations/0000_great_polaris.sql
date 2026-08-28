CREATE TYPE "public"."catalog_kind" AS ENUM('curtain_model', 'material', 'material_option', 'color', 'cornice', 'tulle', 'sachak', 'accessory');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('order_assigned', 'order_status_changed', 'order_rolled_back', 'order_rejected_to_ceo', 'order_qc_failed', 'order_cancelled', 'order_completed', 'order_comment_added', 'shift_adjusted', 'payroll_approved', 'payroll_paid', 'role_changed');--> statement-breakpoint
CREATE TYPE "public"."order_item_kind" AS ENUM('window', 'door', 'other');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'pending_admin_review', 'rejected_to_ceo', 'measurement_assigned', 'measurement_done', 'pending_sewing_assignment', 'sewing_in_progress', 'sewing_done', 'pending_qc', 'qc_failed', 'qc_passed', 'pending_installation_assignment', 'installation_assigned', 'installation_in_progress', 'installation_done', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payroll_record_status" AS ENUM('draft', 'approved', 'paid');--> statement-breakpoint
CREATE TYPE "public"."payroll_scheme_type" AS ENUM('fixed', 'hourly', 'kpi', 'commission');--> statement-breakpoint
CREATE TYPE "public"."photo_stage" AS ENUM('measurement', 'fabric', 'cutting', 'sewing_process', 'qc', 'install_before', 'install_after', 'general');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('normal', 'urgent', 'critical');--> statement-breakpoint
CREATE TYPE "public"."purchase_category" AS ENUM('fabric', 'cornice', 'accessory', 'consumable', 'other');--> statement-breakpoint
CREATE TYPE "public"."purchase_unit" AS ENUM('m', 'm2', 'pcs', 'set', 'kg', 'roll');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ceo', 'admin', 'seller', 'master', 'sewer', 'qc', 'installer', 'smm');--> statement-breakpoint
CREATE TABLE "branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"radius_meters" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_latitude_range" CHECK ("branches"."latitude" between -90 and 90),
	CONSTRAINT "branches_longitude_range" CHECK ("branches"."longitude" between -180 and 180),
	CONSTRAINT "branches_radius_range" CHECK ("branches"."radius_meters" between 20 and 5000)
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_branches" (
	"user_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_branches_user_id_branch_id_pk" PRIMARY KEY("user_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" integer NOT NULL,
	"role" "role" NOT NULL,
	"granted_by" integer NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"telegram_id" bigint,
	"avatar_storage_key" text,
	"hired_at" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_e164" CHECK ("users"."phone" ~ '^\+998[0-9]{9}$')
);
--> statement-breakpoint
CREATE TABLE "order_installation_team" (
	"order_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"added_by" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_installation_team_order_id_user_id_pk" PRIMARY KEY("order_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"kind" "order_item_kind" DEFAULT 'window' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"model" text,
	"materials" text[] DEFAULT '{}'::text[] NOT NULL,
	"material_options" text[] DEFAULT '{}'::text[] NOT NULL,
	"color" text,
	"characteristics" text,
	"width_cm" numeric(7, 1),
	"height_cm" numeric(7, 1),
	"area_m2" numeric(10, 4),
	"cornice" text,
	"cornice_rotation" text,
	"tulle" text,
	"sachak" text,
	"accessory" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_width_range" CHECK ("order_items"."width_cm" is null or "order_items"."width_cm" between 1 and 2000),
	CONSTRAINT "order_items_height_range" CHECK ("order_items"."height_cm" is null or "order_items"."height_cm" between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text GENERATED ALWAYS AS ('DH-' || lpad(id::text, 6, '0')) STORED,
	"branch_id" integer NOT NULL,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"client_name" text NOT NULL,
	"client_phone" text NOT NULL,
	"client_comment" text,
	"install_address" text,
	"install_latitude" double precision,
	"install_longitude" double precision,
	"deadline" date,
	"work_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"deposit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"remaining_payment" numeric(14, 2) GENERATED ALWAYS AS (work_price - deposit) STORED,
	"created_by" integer NOT NULL,
	"master_id" integer,
	"sewer_id" integer,
	"qc_id" integer,
	"installer_id" integer,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_client_phone_e164" CHECK ("orders"."client_phone" ~ '^\+998[0-9]{9}$'),
	CONSTRAINT "orders_work_price_non_negative" CHECK ("orders"."work_price" >= 0),
	CONSTRAINT "orders_deposit_non_negative" CHECK ("orders"."deposit" >= 0),
	CONSTRAINT "orders_cancellation_reason_required" CHECK ("orders"."status" <> 'cancelled' or "orders"."cancellation_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"changed_by" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"stage" "photo_stage" DEFAULT 'general' NOT NULL,
	"storage_key" text NOT NULL,
	"original_file_name" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_photos_size_positive" CHECK ("order_photos"."size_bytes" > 0),
	CONSTRAINT "order_photos_mime_is_image" CHECK ("order_photos"."mime_type" like 'image/%')
);
--> statement-breakpoint
CREATE TABLE "order_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"body" text,
	"is_voice" boolean DEFAULT false NOT NULL,
	"voice_storage_key" text,
	"voice_duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_comments_payload_required" CHECK (("order_comments"."is_voice" and "order_comments"."voice_storage_key" is not null)
          or (not "order_comments"."is_voice" and "order_comments"."body" is not null and length(btrim("order_comments"."body")) > 0)),
	CONSTRAINT "order_comments_voice_duration_positive" CHECK ("order_comments"."voice_duration_seconds" is null or "order_comments"."voice_duration_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"start_latitude" double precision,
	"start_longitude" double precision,
	"start_distance_meters" integer,
	"end_latitude" double precision,
	"end_longitude" double precision,
	"end_distance_meters" integer,
	"is_manually_adjusted" boolean DEFAULT false NOT NULL,
	"adjusted_by" integer,
	"adjusted_at" timestamp with time zone,
	"adjustment_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_ended_after_started" CHECK ("shifts"."ended_at" is null or "shifts"."ended_at" > "shifts"."started_at"),
	CONSTRAINT "shifts_adjustment_metadata_required" CHECK (not "shifts"."is_manually_adjusted"
          or ("shifts"."adjusted_by" is not null
              and "shifts"."adjusted_at" is not null
              and "shifts"."adjustment_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "catalog_kind" NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" "purchase_unit" NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"category" "purchase_category" DEFAULT 'other' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_items_price_non_negative" CHECK ("purchase_items"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"total_price" numeric(14, 2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
	"comment" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_quantity_positive" CHECK ("purchases"."quantity" > 0),
	CONSTRAINT "purchases_unit_price_non_negative" CHECK ("purchases"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payroll_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role" "role" NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"scheme_snapshot" jsonb NOT NULL,
	"calculated_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"kpi_percent" numeric(6, 2),
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "payroll_record_status" DEFAULT 'draft' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_records_month_range" CHECK ("payroll_records"."period_month" between 1 and 12),
	CONSTRAINT "payroll_records_year_range" CHECK ("payroll_records"."period_year" between 2020 and 2100),
	CONSTRAINT "payroll_records_amounts_non_negative" CHECK ("payroll_records"."calculated_amount" >= 0 and "payroll_records"."paid_amount" >= 0),
	CONSTRAINT "payroll_records_approval_metadata" CHECK ("payroll_records"."status" = 'draft'
          or ("payroll_records"."approved_by" is not null and "payroll_records"."approved_at" is not null)),
	CONSTRAINT "payroll_records_paid_metadata" CHECK ("payroll_records"."status" <> 'paid' or "payroll_records"."paid_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "payroll_schemes" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" "role" NOT NULL,
	"type" "payroll_scheme_type" NOT NULL,
	"base_amount" numeric(14, 2),
	"rate" numeric(14, 2),
	"kpi_target" numeric(14, 4),
	"commission_percent" numeric(6, 3),
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" date NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_schemes_fields_match_type" CHECK (("payroll_schemes"."type" = 'fixed' and "payroll_schemes"."base_amount" is not null)
       or ("payroll_schemes"."type" = 'hourly' and "payroll_schemes"."rate" is not null)
       or ("payroll_schemes"."type" = 'kpi' and "payroll_schemes"."base_amount" is not null
            and "payroll_schemes"."rate" is not null
            and "payroll_schemes"."kpi_target" is not null and "payroll_schemes"."kpi_target" > 0)
       or ("payroll_schemes"."type" = 'commission' and "payroll_schemes"."commission_percent" is not null)),
	CONSTRAINT "payroll_schemes_amounts_non_negative" CHECK (coalesce("payroll_schemes"."base_amount", 0) >= 0
          and coalesce("payroll_schemes"."rate", 0) >= 0
          and coalesce("payroll_schemes"."commission_percent", 0) between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"related_order_id" integer,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_read_at_matches_flag" CHECK (("notifications"."is_read" and "notifications"."read_at" is not null)
          or (not "notifications"."is_read" and "notifications"."read_at" is null))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"details" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_installation_team" ADD CONSTRAINT "order_installation_team_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_installation_team" ADD CONSTRAINT "order_installation_team_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_installation_team" ADD CONSTRAINT "order_installation_team_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_master_id_users_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_sewer_id_users_id_fk" FOREIGN KEY ("sewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_qc_id_users_id_fk" FOREIGN KEY ("qc_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_installer_id_users_id_fk" FOREIGN KEY ("installer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_photos" ADD CONSTRAINT "order_photos_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_photos" ADD CONSTRAINT "order_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_comments" ADD CONSTRAINT "order_comments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_comments" ADD CONSTRAINT "order_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_adjusted_by_users_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_item_id_purchase_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."purchase_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_schemes" ADD CONSTRAINT "payroll_schemes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_order_id_orders_id_fk" FOREIGN KEY ("related_order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branches_name_unique" ON "branches" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "branches_is_active_idx" ON "branches" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_unique" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_branches_branch_idx" ON "user_branches" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_branches_single_primary" ON "user_branches" USING btree ("user_id") WHERE "user_branches"."is_primary";--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_id_unique" ON "users" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "users_is_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "users_full_name_idx" ON "users" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "order_installation_team_user_idx" ON "order_installation_team" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_branch_idx" ON "orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "orders_created_by_idx" ON "orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "orders_master_idx" ON "orders" USING btree ("master_id");--> statement-breakpoint
CREATE INDEX "orders_sewer_idx" ON "orders" USING btree ("sewer_id");--> statement-breakpoint
CREATE INDEX "orders_qc_idx" ON "orders" USING btree ("qc_id");--> statement-breakpoint
CREATE INDEX "orders_installer_idx" ON "orders" USING btree ("installer_id");--> statement-breakpoint
CREATE INDEX "orders_deadline_idx" ON "orders" USING btree ("deadline");--> statement-breakpoint
CREATE INDEX "orders_client_phone_idx" ON "orders" USING btree ("client_phone");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_branch_status_created_idx" ON "orders" USING btree ("branch_id","status","created_at");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_status_history_changed_by_idx" ON "order_status_history" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "order_status_history_to_status_idx" ON "order_status_history" USING btree ("to_status");--> statement-breakpoint
CREATE UNIQUE INDEX "order_photos_storage_key_unique" ON "order_photos" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "order_photos_order_stage_idx" ON "order_photos" USING btree ("order_id","stage");--> statement-breakpoint
CREATE INDEX "order_photos_uploaded_by_idx" ON "order_photos" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "order_comments_order_idx" ON "order_comments" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_comments_user_idx" ON "order_comments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_comments_voice_key_unique" ON "order_comments" USING btree ("voice_storage_key");--> statement-breakpoint
CREATE INDEX "shifts_user_started_idx" ON "shifts" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "shifts_branch_idx" ON "shifts" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "shifts_started_at_idx" ON "shifts" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_single_open_per_user" ON "shifts" USING btree ("user_id") WHERE "shifts"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_items_kind_name_unique" ON "catalog_items" USING btree ("kind",lower("name"));--> statement-breakpoint
CREATE INDEX "catalog_items_kind_active_idx" ON "catalog_items" USING btree ("kind","is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_items_name_unique" ON "purchase_items" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "purchase_items_category_idx" ON "purchase_items" USING btree ("category","is_active");--> statement-breakpoint
CREATE INDEX "purchases_order_idx" ON "purchases" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "purchases_item_idx" ON "purchases" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "purchases_created_at_idx" ON "purchases" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_records_period_unique" ON "payroll_records" USING btree ("user_id","role","period_year","period_month");--> statement-breakpoint
CREATE INDEX "payroll_records_period_idx" ON "payroll_records" USING btree ("period_year","period_month","status");--> statement-breakpoint
CREATE INDEX "payroll_records_user_idx" ON "payroll_records" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_schemes_single_active_per_role" ON "payroll_schemes" USING btree ("role") WHERE "payroll_schemes"."is_active";--> statement-breakpoint
CREATE INDEX "payroll_schemes_role_idx" ON "payroll_schemes" USING btree ("role","effective_from");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE not "notifications"."is_read";--> statement-breakpoint
CREATE INDEX "notifications_order_idx" ON "notifications" USING btree ("related_order_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");