CREATE TABLE `observed_battles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fingerprint` varchar(64) NOT NULL,
	`battle_time` timestamp NOT NULL,
	`map_id` varchar(128) NOT NULL,
	`mode` varchar(64) NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`winning_team` longtext NOT NULL,
	`losing_team` longtext NOT NULL,
	`source_player_tag` varchar(32) NOT NULL,
	`collected_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `observed_battles_id` PRIMARY KEY(`id`),
	CONSTRAINT `observed_battles_fingerprint_uq` UNIQUE(`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `observed_match_collection_config` (
	`id` int NOT NULL DEFAULT 1,
	`schedule_cron_task_uid` varchar(65),
	`cron_expression` varchar(32) NOT NULL DEFAULT '0 5 * * * *',
	`enabled` int NOT NULL DEFAULT 0,
	`last_status` enum('idle','running','success','failed') NOT NULL DEFAULT 'idle',
	`last_started_at` timestamp,
	`last_completed_at` timestamp,
	`last_error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `observed_match_collection_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `observed_match_collection_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trigger` enum('scheduled','manual','bootstrap') NOT NULL,
	`status` enum('running','success','failed') NOT NULL,
	`players_sampled` int NOT NULL DEFAULT 0,
	`battles_fetched` int NOT NULL DEFAULT 0,
	`battles_inserted` int NOT NULL DEFAULT 0,
	`pair_observations` int NOT NULL DEFAULT 0,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`error` text,
	CONSTRAINT `observed_match_collection_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `observed_matchup_aggregates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`map_id` varchar(128) NOT NULL,
	`mode` varchar(64) NOT NULL,
	`brawler` varchar(64) NOT NULL,
	`opponent` varchar(64) NOT NULL,
	`wins` int NOT NULL DEFAULT 0,
	`losses` int NOT NULL DEFAULT 0,
	`samples` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `observed_matchup_aggregates_id` PRIMARY KEY(`id`),
	CONSTRAINT `observed_matchup_context_pair_uq` UNIQUE(`map_id`,`mode`,`brawler`,`opponent`)
);
--> statement-breakpoint
CREATE INDEX `observed_battles_map_mode_time_idx` ON `observed_battles` (`map_id`,`mode`,`battle_time`);--> statement-breakpoint
CREATE INDEX `observed_collection_schedule_task_uid_idx` ON `observed_match_collection_config` (`schedule_cron_task_uid`);--> statement-breakpoint
CREATE INDEX `observed_collection_runs_status_idx` ON `observed_match_collection_runs` (`status`);--> statement-breakpoint
CREATE INDEX `observed_collection_runs_started_at_idx` ON `observed_match_collection_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `observed_matchup_brawler_lookup_idx` ON `observed_matchup_aggregates` (`map_id`,`mode`,`brawler`);