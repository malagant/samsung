CREATE TYPE "public"."role" AS ENUM('owner', 'family');--> statement-breakpoint
CREATE TABLE "api_call_counts" (
	"month" text PRIMARY KEY NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"manufacturer" text,
	"binary_id" text,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"temperature_reference" text DEFAULT 'water',
	"wc_zone" text DEFAULT 'zone1' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fsv_snapshots" (
	"device_id" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"values" jsonb NOT NULL,
	CONSTRAINT "fsv_snapshots_device_id_reported_at_pk" PRIMARY KEY("device_id","reported_at")
);
--> statement-breakpoint
CREATE TABLE "hourly_summaries" (
	"device_id" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"heating_minutes" double precision DEFAULT 0 NOT NULL,
	"dhw_minutes" double precision DEFAULT 0 NOT NULL,
	"defrost_minutes" double precision DEFAULT 0 NOT NULL,
	"energy_in_wh" double precision DEFAULT 0 NOT NULL,
	"heat_out_wh" double precision DEFAULT 0 NOT NULL,
	"outdoor_min" double precision,
	"outdoor_max" double precision,
	CONSTRAINT "hourly_summaries_device_id_hour_pk" PRIMARY KEY("device_id","hour")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"kind" text NOT NULL,
	"cron" text NOT NULL,
	"params" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"token" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"window_hours" integer DEFAULT 24 NOT NULL,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartthings_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"installed_app_id" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scopes" text NOT NULL,
	"polling_status" text DEFAULT 'active' NOT NULL,
	"last_successful_poll" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"webhooks_enabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetry" (
	"device_id" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"cycle_data_ts" timestamp with time zone,
	"main_system_status" text,
	"heating_circuit_status" text,
	"operating_mode" text,
	"dhw_operating_mode" text,
	"flow_temp" double precision,
	"flow_setpoint" double precision,
	"return_temp" double precision,
	"outdoor_temp" double precision,
	"dhw_temp" double precision,
	"dhw_setpoint" double precision,
	"flow_rate" double precision,
	"compressor_freq" double precision,
	"inverter_pump_percent" double precision,
	"energy_wh" double precision,
	"delta_energy_wh" double precision,
	"diverter_valve_position" text,
	"defrost_active" boolean,
	"raw_outdoor_cycle_data" text,
	"raw_indoor_cycle_data" text,
	CONSTRAINT "telemetry_device_id_ts_pk" PRIMARY KEY("device_id","ts")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'owner' NOT NULL,
	"owner_id" uuid,
	"short_cycle_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fsv_snapshots" ADD CONSTRAINT "fsv_snapshots_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hourly_summaries" ADD CONSTRAINT "hourly_summaries_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smartthings_accounts" ADD CONSTRAINT "smartthings_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telemetry_ts_idx" ON "telemetry" USING btree ("ts");