CREATE TABLE IF NOT EXISTS "availability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ghl_location_id" text NOT NULL,
	"drchrono_break_id" text NOT NULL,
	"ghl_block_id" text NOT NULL,
	"provider_id" text,
	"ghl_user_id" text,
	"start_time" text,
	"end_time" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "availability_blocks_location_break_unique" ON "availability_blocks" ("ghl_location_id","drchrono_break_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "availability_blocks_location_idx" ON "availability_blocks" ("ghl_location_id");
