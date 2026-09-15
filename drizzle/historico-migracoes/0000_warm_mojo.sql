CREATE TABLE `ranked_sync_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`cronExpression` varchar(32) NOT NULL DEFAULT '0 0 */6 * * *',
	`enabled` int NOT NULL DEFAULT 0,
	`lastStatus` enum('idle','running','success','failed') NOT NULL DEFAULT 'idle',
	`lastStartedAt` timestamp,
	`lastCompletedAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ranked_sync_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ranked_sync_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trigger` enum('scheduled','manual','bootstrap') NOT NULL,
	`status` enum('running','success','failed') NOT NULL,
	`rowCount` int NOT NULL DEFAULT 0,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`topBrawlStatus` varchar(32),
	`brawlPlanetStatus` varchar(32),
	`error` text,
	CONSTRAINT `ranked_sync_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ranked_sync_snapshots` (
	`id` int NOT NULL DEFAULT 1,
	`version` varchar(64) NOT NULL,
	`capturedAt` timestamp NOT NULL,
	`rowCount` int NOT NULL DEFAULT 0,
	`topBrawlStatus` varchar(32) NOT NULL,
	`brawlPlanetStatus` varchar(32) NOT NULL,
	`sourceNotes` text,
	`payload` longtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ranked_sync_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `ranked_sync_schedule_task_uid_idx` ON `ranked_sync_config` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `ranked_sync_runs_status_idx` ON `ranked_sync_runs` (`status`);--> statement-breakpoint
CREATE INDEX `ranked_sync_runs_started_at_idx` ON `ranked_sync_runs` (`startedAt`);