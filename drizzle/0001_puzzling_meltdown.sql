CREATE TABLE `reading_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
