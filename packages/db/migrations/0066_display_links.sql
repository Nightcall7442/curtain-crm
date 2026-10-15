CREATE TABLE "display_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"branch_id" integer,
	"show_workshop" boolean NOT NULL,
	"show_installation" boolean NOT NULL,
	"locale" text DEFAULT 'ru' NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "display_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "display_links_label_length" CHECK (char_length("display_links"."label") between 1 and 60),
	CONSTRAINT "display_links_shows_something" CHECK ("display_links"."show_workshop" or "display_links"."show_installation"),
	CONSTRAINT "display_links_locale" CHECK ("display_links"."locale" in ('ru', 'uz'))
);
--> statement-breakpoint
ALTER TABLE "display_links" ADD CONSTRAINT "display_links_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_links" ADD CONSTRAINT "display_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "display_links_created_at_idx" ON "display_links" USING btree ("created_at");