CREATE TABLE `homework` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`student` text NOT NULL,
	`telegram_id` text,
	`lesson` text NOT NULL,
	`comment` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notification` text DEFAULT 'disabled' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `homework_owner` ON `homework` (`owner`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`contact` text NOT NULL,
	`slot` text NOT NULL,
	`plan` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`homework_id` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `uploads_owner` ON `uploads` (`owner`);--> statement-breakpoint
CREATE INDEX `uploads_homework` ON `uploads` (`homework_id`);