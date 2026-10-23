-- Criação das tabelas do Brawl Híbrido.
--
-- POR QUE ESTE FICHEIRO EXISTE
--
-- O histórico de migrações do projeto estava irrecuperável: três migrações
-- iniciais diferentes, um diário a apontar para um ficheiro inexistente, e sem
-- as fotografias que o drizzle-kit usa para comparar estados. O `migrate`
-- falhava sem criar nada.
--
-- A seguir, o `drizzle-kit push` também falhou — mas por outra razão, e essa é
-- importante: `ER_MULTIPLE_PRI_KEY` ao tentar
-- `ALTER TABLE counter_relations ADD PRIMARY KEY(id)`. Esse erro só acontece
-- quando a tabela JÁ EXISTE e JÁ TEM chave primária. Ou seja: a base de dados
-- não está vazia — tem tabelas de uma instalação anterior, e o push queria
-- alterá-las.
--
-- Este ficheiro não altera nada. Só cria o que falta, com IF NOT EXISTS. Uma
-- tabela que já exista é deixada exatamente como está, com os dados que tem.
-- Pode ser corrido as vezes que forem precisas sem consequência.

CREATE TABLE IF NOT EXISTS `ranked_sync_config` (
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

CREATE TABLE IF NOT EXISTS `ranked_sync_runs` (
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

CREATE TABLE IF NOT EXISTS `ranked_sync_snapshots` (
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

CREATE TABLE IF NOT EXISTS `users` (
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

CREATE TABLE IF NOT EXISTS `prodigy_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brawlerName` varchar(64) NOT NULL,
	`url` varchar(512) NOT NULL,
	`status` enum('pending','verified') NOT NULL DEFAULT 'pending',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prodigy_links_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `counter_relations` (
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

CREATE TABLE IF NOT EXISTS `observed_battles` (
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

CREATE TABLE IF NOT EXISTS `observed_match_collection_config` (
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

CREATE TABLE IF NOT EXISTS `observed_match_collection_runs` (
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

CREATE TABLE IF NOT EXISTS `observed_battle_ranks` (
	`fingerprint` varchar(64) NOT NULL,
	`rank_min` int NOT NULL,
	`rank_max` int NOT NULL,
	`rank_medio` int NOT NULL,
	CONSTRAINT `observed_battle_ranks_fingerprint` PRIMARY KEY(`fingerprint`)
);

CREATE TABLE IF NOT EXISTS `observed_players` (
	`tag` varchar(20) NOT NULL,
	`first_seen_at` timestamp NOT NULL DEFAULT (now()),
	`last_read_at` timestamp,
	`next_read_at` timestamp NOT NULL DEFAULT (now()),
	`last_ranked_at` timestamp,
	`empty_reads` int NOT NULL DEFAULT 0,
	CONSTRAINT `observed_players_tag` PRIMARY KEY(`tag`),
	INDEX `observed_players_next_read_idx` (`next_read_at`)
);

CREATE TABLE IF NOT EXISTS `observed_matchup_aggregates` (
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

CREATE TABLE IF NOT EXISTS `counter_sync_config` (
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

CREATE TABLE IF NOT EXISTS `counter_sync_relation_evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`snapshot_version` varchar(64) NOT NULL,
	`source` enum('brawlscope','calculator','planet','prodigy') NOT NULL,
	`attacker` varchar(64) NOT NULL,
	`defender` varchar(64) NOT NULL,
	`source_url` varchar(1024) NOT NULL,
	`observed_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `counter_sync_relation_evidence_id` PRIMARY KEY(`id`),
	CONSTRAINT `counter_sync_evidence_snapshot_source_pair_uq` UNIQUE(`snapshot_version`,`source`,`attacker`,`defender`)
);

CREATE TABLE IF NOT EXISTS `counter_sync_runs` (
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

CREATE TABLE IF NOT EXISTS `counter_sync_snapshots` (
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

CREATE TABLE IF NOT EXISTS `brawlscope_captures` (
	`id` varchar(128) NOT NULL,
	`view` varchar(32) NOT NULL,
	`brawler` varchar(64) NOT NULL,
	`captured_at` timestamp NOT NULL DEFAULT (now()),
	`payload` longtext NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `brawlscope_captures_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `ranked_map_captures` (
	`map_id` varchar(32) NOT NULL,
	`map` varchar(128) NOT NULL,
	`captured_at` timestamp NOT NULL DEFAULT (now()),
	`payload` longtext NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ranked_map_captures_map_id` PRIMARY KEY(`map_id`)
);

CREATE TABLE IF NOT EXISTS `observed_battle_quality` (
  `fingerprint` varchar(64) NOT NULL,
  `todos_nivel_11` int NOT NULL,
  PRIMARY KEY (`fingerprint`)
);
