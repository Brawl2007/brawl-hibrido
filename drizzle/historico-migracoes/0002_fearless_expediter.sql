CREATE TABLE `counter_relations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attacker` varchar(64) NOT NULL,
	`defender` varchar(64) NOT NULL,
	`map_id` varchar(128),
	`mode` varchar(64),
	`source` enum('prodigy','calculator','planet','topbrawl') NOT NULL,
	`confidence` decimal(5,4),
	`sample_size` int,
	`tip` text,
	`source_url` varchar(1024),
	`observed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `counter_relations_id` PRIMARY KEY(`id`),
	CONSTRAINT `counter_relations_context_source_uq` UNIQUE(`attacker`,`defender`,`map_id`,`mode`,`source`)
);
--> statement-breakpoint
CREATE INDEX `counter_relations_contextual_lookup_idx` ON `counter_relations` (`map_id`,`mode`,`attacker`,`defender`,`source`);