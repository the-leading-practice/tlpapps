CREATE TYPE "public"."sync_conflict_resolution" AS ENUM('pending', 'auto-resolved', 'manual-resolved');--> statement-breakpoint
CREATE TYPE "public"."sync_conflict_source" AS ENUM('shadow', 'sync', 'reconcile');--> statement-breakpoint
CREATE TYPE "public"."sync_event_status" AS ENUM('pending', 'processed', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_mapping_kind" AS ENUM('patient', 'appointment');--> statement-breakpoint
CREATE TYPE "public"."sync_source" AS ENUM('ghl', 'drchrono');--> statement-breakpoint
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
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_links_ghl_event_id_unique" ON "appointment_links" USING btree ("ghl_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_links_drchrono_appointment_id_unique" ON "appointment_links" USING btree ("drchrono_appointment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_conflicts_resolution_created_idx" ON "sync_conflicts" USING btree ("resolution","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_events_dedup_key_unique" ON "sync_events" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_events_status_received_idx" ON "sync_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_kind_status_started_idx" ON "sync_jobs" USING btree ("kind","status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_mappings_kind_drchrono_location_unique" ON "sync_mappings" USING btree ("kind","drchrono_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_mappings_kind_ghl_location_unique" ON "sync_mappings" USING btree ("kind","ghl_id","location_id");