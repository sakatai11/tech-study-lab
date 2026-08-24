ALTER TABLE `questions` ADD `domain` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `questions` ADD `topic` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `questions` ADD `lesson_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `questions` ADD `is_active` integer DEFAULT false NOT NULL;
