CREATE TABLE "content_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"frame_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "display_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"frame_id" text NOT NULL,
	"decision_id" text NOT NULL,
	"layout_id" text NOT NULL,
	"shown_at" timestamp with time zone NOT NULL,
	"score" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frame_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"resolution_width" integer DEFAULT 1920 NOT NULL,
	"resolution_height" integer DEFAULT 1080 NOT NULL,
	"screen_width_mm" integer,
	"screen_height_mm" integer,
	CONSTRAINT "frame_documents_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "frame_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "display_history_unique" ON "display_history" USING btree ("frame_id","decision_id","shown_at");--> statement-breakpoint
CREATE INDEX "display_history_frame_time" ON "display_history" USING btree ("frame_id","shown_at");