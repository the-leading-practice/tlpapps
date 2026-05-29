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
DO $$ BEGIN
 ALTER TABLE "patient_external_ids" ADD CONSTRAINT "patient_external_ids_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patient_external_ids_system_external_unique" ON "patient_external_ids" USING btree ("system","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patient_external_ids_patient_system_idx" ON "patient_external_ids" USING btree ("patient_id","system");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patients_location_patient_unique" ON "patients" USING btree ("location_id","patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patients_mongo_id_idx" ON "patients" USING btree ("mongo_id");