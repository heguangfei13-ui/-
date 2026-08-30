CREATE TABLE `refresh_requests` (
	`city` text PRIMARY KEY NOT NULL,
	`requested_at` text NOT NULL,
	`completed_at` text,
	`status` text NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `visitor_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
