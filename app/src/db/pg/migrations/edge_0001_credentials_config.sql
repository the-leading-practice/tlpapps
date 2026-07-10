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
CREATE TABLE IF NOT EXISTS "patient_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"system" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_external_ids_system_check" CHECK ("patient_external_ids"."system" in ('ghl', 'drchrono', 'embodi', 'silkone'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongo_id" text,
	"location_id" text NOT NULL,
	"patient_id" integer NOT NULL,
	"contact_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_mongo_id_unique" UNIQUE("mongo_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ghl_event_id" text NOT NULL,
	"drchrono_appointment_id" text NOT NULL,
	"location_id" integer,
	"doctor_id" text,
	"patient_id" uuid,
	"calendar_id" text,
	"status" text,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "sync_conflict_source" NOT NULL,
	"entity" text NOT NULL,
	"mongo_value" jsonb,
	"pg_value" jsonb,
	"ghl_value" jsonb,
	"drchrono_value" jsonb,
	"resolution" "sync_conflict_resolution" DEFAULT 'pending' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"diff_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_dead_letter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replayed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "sync_source" NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" "sync_event_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"origin_tag" text,
	"dedup_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" "sync_job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb,
	"location_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "sync_mapping_kind" NOT NULL,
	"drchrono_id" text NOT NULL,
	"ghl_id" text NOT NULL,
	"location_id" integer,
	"origin" text,
	"version" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_hash" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_verify_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"direction" text,
	"event_id" text,
	"would_have_sent" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "edge_calendar_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" integer NOT NULL,
	"ehr_doctor_id" text,
	"ehr_calendar_id" text,
	"edge_business_id" text NOT NULL,
	"edge_calendar_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "edge_location_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"edge_business_id" text,
	"edge_token_ciphertext" text,
	"edge_signed_off" boolean DEFAULT false NOT NULL,
	"edge_enabled" boolean DEFAULT false NOT NULL,
	"demo_business_id_override" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "location_config_tables" ADD CONSTRAINT "location_config_tables_config_id_config_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."config"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patient_external_ids" ADD CONSTRAINT "patient_external_ids_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_links" ADD CONSTRAINT "appointment_links_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_links" ADD CONSTRAINT "appointment_links_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_dead_letter" ADD CONSTRAINT "sync_dead_letter_event_id_sync_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."sync_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_mappings" ADD CONSTRAINT "sync_mappings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edge_calendar_map" ADD CONSTRAINT "edge_calendar_map_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edge_location_config" ADD CONSTRAINT "edge_location_config_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_config_tables_config_id_idx" ON "location_config_tables" USING btree ("config_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "locations_location_unique" ON "locations" USING btree ("location");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patient_external_ids_system_external_unique" ON "patient_external_ids" USING btree ("system","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patient_external_ids_patient_system_idx" ON "patient_external_ids" USING btree ("patient_id","system");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patients_location_patient_unique" ON "patients" USING btree ("location_id","patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patients_mongo_id_idx" ON "patients" USING btree ("mongo_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_links_ghl_event_id_unique" ON "appointment_links" USING btree ("ghl_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_links_drchrono_appointment_id_unique" ON "appointment_links" USING btree ("drchrono_appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "availability_blocks_location_break_unique" ON "availability_blocks" USING btree ("ghl_location_id","drchrono_break_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "availability_blocks_location_idx" ON "availability_blocks" USING btree ("ghl_location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_conflicts_resolution_created_idx" ON "sync_conflicts" USING btree ("resolution","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_events_dedup_key_unique" ON "sync_events" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_events_status_received_idx" ON "sync_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_kind_status_started_idx" ON "sync_jobs" USING btree ("kind","status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_mappings_kind_drchrono_location_unique" ON "sync_mappings" USING btree ("kind","drchrono_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_mappings_kind_ghl_location_unique" ON "sync_mappings" USING btree ("kind","ghl_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "edge_calendar_map_location_calendar_unique" ON "edge_calendar_map" USING btree ("location_id","ehr_calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "edge_location_config_location_id_unique" ON "edge_location_config" USING btree ("location_id");