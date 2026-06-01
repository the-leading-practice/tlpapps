CREATE TABLE IF NOT EXISTS "sync_verify_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"direction" text,
	"event_id" text,
	"would_have_sent" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
