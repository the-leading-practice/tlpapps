CREATE TYPE "public"."sync_direction" AS ENUM('drchrono_to_ghl', 'ghl_to_drchrono');--> statement-breakpoint
CREATE TYPE "public"."sync_entity" AS ENUM('patients', 'appointments');--> statement-breakpoint
CREATE TYPE "public"."sync_control_mode" AS ENUM('off', 'dry', 'on');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_controls" (
	"direction" "sync_direction" NOT NULL,
	"entity" "sync_entity" NOT NULL,
	"mode" "sync_control_mode" DEFAULT 'off' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "sync_controls_direction_entity_pk" PRIMARY KEY("direction","entity")
);
--> statement-breakpoint
INSERT INTO sync_controls (direction, entity, mode, updated_at)
VALUES
  ('drchrono_to_ghl',  'patients',     'off', now()),
  ('drchrono_to_ghl',  'appointments', 'off', now()),
  ('ghl_to_drchrono',  'patients',     'off', now()),
  ('ghl_to_drchrono',  'appointments', 'off', now())
ON CONFLICT (direction, entity) DO NOTHING;
