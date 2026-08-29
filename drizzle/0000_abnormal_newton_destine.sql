CREATE TABLE `amenities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`distance_meters` integer,
	`source_url` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `amenities_project_idx` ON `amenities` (`project_id`);--> statement-breakpoint
CREATE TABLE `commute_estimates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`destination` text NOT NULL,
	`mode` text NOT NULL,
	`minutes` integer NOT NULL,
	`transfers` integer,
	`source_name` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `commute_project_idx` ON `commute_estimates` (`project_id`);--> statement-breakpoint
CREATE TABLE `dashboard_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`city` text NOT NULL,
	`period` text NOT NULL,
	`payload_json` text NOT NULL,
	`checksum` text NOT NULL,
	`observed_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_city_period_uidx` ON `dashboard_snapshots` (`city`,`period`);--> statement-breakpoint
CREATE INDEX `dashboard_city_observed_idx` ON `dashboard_snapshots` (`city`,`observed_at`);--> statement-breakpoint
CREATE TABLE `ingestion_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`checksum` text NOT NULL,
	`observed_at` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`city` text NOT NULL,
	`title` text NOT NULL,
	`published_at` text NOT NULL,
	`impact` text NOT NULL,
	`source_url` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `policies_city_date_idx` ON `policies` (`city`,`published_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`city` text NOT NULL,
	`name` text NOT NULL,
	`district` text NOT NULL,
	`developer` text,
	`address` text,
	`area_min` real,
	`area_max` real,
	`avg_price` real,
	`estimated_total_min` real,
	`estimated_total_max` real,
	`delivery_date` text,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`updated_at` text NOT NULL,
	`preservation_score` real,
	`environment_score` real,
	`commute_score` real,
	`risk_penalty` real DEFAULT 0,
	`final_score` real,
	`evidence_status` text DEFAULT 'pending' NOT NULL,
	`risk_flags_json` text DEFAULT '[]' NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_city_score_idx` ON `projects` (`city`,`final_score`);--> statement-breakpoint
CREATE INDEX `projects_city_total_idx` ON `projects` (`city`,`estimated_total_min`);--> statement-breakpoint
CREATE TABLE `source_health` (
	`source_id` text PRIMARY KEY NOT NULL,
	`source_name` text NOT NULL,
	`status` text NOT NULL,
	`last_success_at` text,
	`last_attempt_at` text NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`note` text
);
