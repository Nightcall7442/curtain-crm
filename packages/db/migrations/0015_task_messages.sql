CREATE TABLE "task_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"body" text,
	"storage_key" text,
	"original_file_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_messages_attachment_complete" CHECK (("task_messages"."storage_key" is null and "task_messages"."mime_type" is null
           and "task_messages"."size_bytes" is null)
          or ("task_messages"."storage_key" is not null and "task_messages"."mime_type" is not null
              and "task_messages"."size_bytes" is not null)),
	CONSTRAINT "task_messages_size_positive" CHECK ("task_messages"."size_bytes" is null or "task_messages"."size_bytes" > 0),
	CONSTRAINT "task_messages_not_empty" CHECK ("task_messages"."body" is not null or "task_messages"."storage_key" is not null)
);
--> statement-breakpoint
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_messages_task_idx" ON "task_messages" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_messages_author_idx" ON "task_messages" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_messages_storage_key_unique" ON "task_messages" USING btree ("storage_key") WHERE "task_messages"."storage_key" is not null;