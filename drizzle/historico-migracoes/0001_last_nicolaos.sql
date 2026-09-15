CREATE TABLE `prodigy_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brawlerName` varchar(64) NOT NULL,
	`url` varchar(512) NOT NULL,
	`status` enum('pending','verified') NOT NULL DEFAULT 'pending',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prodigy_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ranked_sync_config` MODIFY COLUMN `cronExpression` varchar(32) NOT NULL DEFAULT '0 0 * * * *';