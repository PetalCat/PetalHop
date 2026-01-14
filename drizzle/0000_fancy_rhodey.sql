CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `forwards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`peer_id` integer NOT NULL,
	`protocol` text NOT NULL,
	`public_port` integer NOT NULL,
	`private_port` integer NOT NULL,
	FOREIGN KEY (`peer_id`) REFERENCES `peers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `peers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`wg_ip` text NOT NULL,
	`public_key` text,
	`setup_token` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`type` text DEFAULT 'agent' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `peers_wg_ip_unique` ON `peers` (`wg_ip`);--> statement-breakpoint
CREATE UNIQUE INDEX `peers_setup_token_unique` ON `peers` (`setup_token`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`mfa_verified` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`mfa_secret` text,
	`mfa_enabled` integer DEFAULT false NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);