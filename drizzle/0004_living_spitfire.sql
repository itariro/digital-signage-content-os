CREATE TABLE "enrollment_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
