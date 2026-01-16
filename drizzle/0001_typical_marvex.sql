CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer,
	`user_id` text,
	`action` text NOT NULL,
	`resource_type` text,
	`resource_id` text,
	`ip_address` text,
	`user_agent` text,
	`details` text,
	`success` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `peer_usage_hourly` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`peer_id` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`rx` integer NOT NULL,
	`tx` integer NOT NULL,
	FOREIGN KEY (`peer_id`) REFERENCES `peers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `peer_usage_monthly` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`peer_id` integer NOT NULL,
	`month` text NOT NULL,
	`rx` integer NOT NULL,
	`tx` integer NOT NULL,
	FOREIGN KEY (`peer_id`) REFERENCES `peers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `mfa_backup_codes` text;