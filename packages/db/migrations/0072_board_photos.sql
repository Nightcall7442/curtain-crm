CREATE TYPE "public"."board_photo_kind" AS ENUM('working', 'idle', 'break');--> statement-breakpoint
CREATE TABLE "board_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" "board_photo_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"preview_key" text,
	"uploaded_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_photos" ADD CONSTRAINT "board_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_photos" ADD CONSTRAINT "board_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_photos_user_kind_uniq" ON "board_photos" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "board_photos_uploaded_by_idx" ON "board_photos" USING btree ("uploaded_by");