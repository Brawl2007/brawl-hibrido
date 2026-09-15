CREATE TABLE `counter_sync_config` (
	`id` int NOT NULL DEFAULT 1,
	`schedule_cron_task_uid` varchar(65),
	`cron_expression` varchar(32) NOT NULL DEFAULT '0 0 * * * *',
	`enabled` int NOT NULL DEFAULT 0,
	`last_status` enum('idle','running','success','failed') NOT NULL DEFAULT 'idle',
	`last_started_at` timestamp,
	`last_completed_at` timestamp,
	`last_error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `counter_sync_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `counter_sync_relation_evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`snapshot_version` varchar(64) NOT NULL,
	`source` enum('brawlscope','calculator','planet') NOT NULL,
	`attacker` varchar(64) NOT NULL,
	`defender` varchar(64) NOT NULL,
	`source_url` varchar(1024) NOT NULL,
	`observed_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `counter_sync_relation_evidence_id` PRIMARY KEY(`id`),
	CONSTRAINT `counter_sync_evidence_snapshot_source_pair_uq` UNIQUE(`snapshot_version`,`source`,`attacker`,`defender`)
);
--> statement-breakpoint
CREATE TABLE `counter_sync_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trigger` enum('scheduled','manual','bootstrap') NOT NULL,
	`status` enum('running','success','failed') NOT NULL,
	`relation_count` int NOT NULL DEFAULT 0,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`brawlscope_status` varchar(32),
	`calculator_status` varchar(32),
	`planet_status` varchar(32),
	`error` text,
	CONSTRAINT `counter_sync_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `counter_sync_snapshots` (
	`id` int NOT NULL DEFAULT 1,
	`version` varchar(64) NOT NULL,
	`captured_at` timestamp NOT NULL,
	`relation_count` int NOT NULL DEFAULT 0,
	`brawlscope_status` varchar(32) NOT NULL,
	`calculator_status` varchar(32) NOT NULL,
	`planet_status` varchar(32) NOT NULL,
	`source_notes` text,
	`payload` longtext NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `counter_sync_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `counter_sync_schedule_task_uid_idx` ON `counter_sync_config` (`schedule_cron_task_uid`);--> statement-breakpoint
CREATE INDEX `counter_sync_evidence_pair_lookup_idx` ON `counter_sync_relation_evidence` (`attacker`,`defender`,`source`);--> statement-breakpoint
CREATE INDEX `counter_sync_runs_status_idx` ON `counter_sync_runs` (`status`);--> statement-breakpoint
CREATE INDEX `counter_sync_runs_started_at_idx` ON `counter_sync_runs` (`started_at`);