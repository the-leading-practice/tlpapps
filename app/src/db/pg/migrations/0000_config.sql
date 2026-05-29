CREATE TABLE IF NOT EXISTS "config" (
	"id" serial PRIMARY KEY NOT NULL,
	"mongo_id" text,
	"location_id" integer NOT NULL,
	"last_run" text,
	"db_provider" text,
	"use_cache_table" boolean,
	"token_refresh_milliseconds" integer,
	"auth_endpoint" text,
	"notification_endpoint" text,
	"patient_endpoint" text,
	"appointment_endpoint" text,
	"connection_string" text,
	"repeat_milliseconds" integer,
	"max_batch_size" integer,
	"software" text,
	CONSTRAINT "config_mongo_id_unique" UNIQUE("mongo_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "location_config_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_id" integer NOT NULL,
	"name" text NOT NULL,
	"unique_field" text NOT NULL,
	"formatted_query" text,
	"sql_query" text NOT NULL,
	"endpoint" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"mongo_id" text,
	"location" text NOT NULL,
	"software" text,
	CONSTRAINT "locations_mongo_id_unique" UNIQUE("mongo_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "config" ADD CONSTRAINT "config_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "location_config_tables" ADD CONSTRAINT "location_config_tables_config_id_config_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."config"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "config_location_id_unique" ON "config" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_config_tables_config_id_idx" ON "location_config_tables" USING btree ("config_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "locations_location_unique" ON "locations" USING btree ("location");