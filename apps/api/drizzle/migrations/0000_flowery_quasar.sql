CREATE TABLE `answer_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`is_correct` integer NOT NULL,
	`answered_at` integer NOT NULL,
	`response_time_ms` integer
);
--> statement-breakpoint
CREATE TABLE `lesson_views` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`viewed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`question_id` text PRIMARY KEY NOT NULL,
	`answer_index` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `srs_states` (
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`ease` integer NOT NULL,
	`interval_days` integer NOT NULL,
	`due_at` integer NOT NULL,
	`reps` integer NOT NULL,
	`lapses` integer NOT NULL,
	PRIMARY KEY(`user_id`, `question_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
