CREATE TABLE "canvas_assets" (
	"hash" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
