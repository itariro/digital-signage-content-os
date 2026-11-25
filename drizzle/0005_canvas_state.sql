CREATE TABLE "canvas_state" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"reported_revision" integer,
	"clock_offset_ms" double precision,
	"clock_uncertainty_ms" double precision,
	"viewport_w" integer,
	"viewport_h" integer,
	"fps_avg" double precision,
	"reported_at" timestamp with time zone
);
