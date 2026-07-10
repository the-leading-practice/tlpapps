CREATE TABLE IF NOT EXISTS "sync_write_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination" text NOT NULL,
	"location_id" text NOT NULL,
	"allowed" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "sync_write_allowlist_destination_location_unique" ON "sync_write_allowlist" ("destination","location_id");
