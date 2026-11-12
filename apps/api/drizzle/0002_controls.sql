CREATE TABLE "dhw_boosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"started_by" uuid,
	"target" double precision NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"previous_setpoint" double precision,
	"previous_on" boolean,
	"status" text NOT NULL,
	"restore_attempts" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "telemetry" ADD COLUMN "dhw_status" text;--> statement-breakpoint
ALTER TABLE "dhw_boosts" ADD CONSTRAINT "dhw_boosts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dhw_boosts" ADD CONSTRAINT "dhw_boosts_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;