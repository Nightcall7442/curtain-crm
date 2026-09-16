ALTER TYPE "public"."notification_type" ADD VALUE 'terminal_check_created' BEFORE 'discipline_recorded';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'terminal_check_due' BEFORE 'discipline_recorded';--> statement-breakpoint
CREATE TABLE "terminal_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"branch_id" integer,
	"photo_key" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terminal_checks" ADD CONSTRAINT "terminal_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_checks" ADD CONSTRAINT "terminal_checks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "terminal_checks_created_idx" ON "terminal_checks" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "cash_collections" DROP COLUMN "receipt_key";