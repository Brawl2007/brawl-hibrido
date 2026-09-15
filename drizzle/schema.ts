import {
  decimal,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Singleton configuration row for the project-level 6-hour Heartbeat job. */
export const rankedSyncConfig = mysqlTable(
  "ranked_sync_config",
  {
    id: int("id").autoincrement().primaryKey(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    cronExpression: varchar("cronExpression", { length: 32 })
      .notNull()
      .default("0 0 * * * *"),
    enabled: int("enabled").notNull().default(0),
    lastStatus: mysqlEnum("lastStatus", ["idle", "running", "success", "failed"])
      .notNull()
      .default("idle"),
    lastStartedAt: timestamp("lastStartedAt"),
    lastCompletedAt: timestamp("lastCompletedAt"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    scheduleTaskUidIdx: index("ranked_sync_schedule_task_uid_idx").on(
      table.scheduleCronTaskUid
    ),
  })
);

export type RankedSyncConfig = typeof rankedSyncConfig.$inferSelect;
export type InsertRankedSyncConfig = typeof rankedSyncConfig.$inferInsert;

/** Latest valid payload used by the public dashboard. */
export const rankedSyncSnapshots = mysqlTable("ranked_sync_snapshots", {
  id: int("id").primaryKey().default(1),
  version: varchar("version", { length: 64 }).notNull(),
  capturedAt: timestamp("capturedAt").notNull(),
  rowCount: int("rowCount").notNull().default(0),
  topBrawlStatus: varchar("topBrawlStatus", { length: 32 }).notNull(),
  brawlPlanetStatus: varchar("brawlPlanetStatus", { length: 32 }).notNull(),
  sourceNotes: text("sourceNotes"),
  payload: longtext("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RankedSyncSnapshot = typeof rankedSyncSnapshots.$inferSelect;
export type InsertRankedSyncSnapshot = typeof rankedSyncSnapshots.$inferInsert;

/** Compact audit trail; the last valid snapshot remains available after failures. */
export const rankedSyncRuns = mysqlTable(
  "ranked_sync_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    trigger: mysqlEnum("trigger", ["scheduled", "manual", "bootstrap"]).notNull(),
    status: mysqlEnum("status", ["running", "success", "failed"]).notNull(),
    rowCount: int("rowCount").notNull().default(0),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    topBrawlStatus: varchar("topBrawlStatus", { length: 32 }),
    brawlPlanetStatus: varchar("brawlPlanetStatus", { length: 32 }),
    error: text("error"),
  },
  table => ({
    statusIdx: index("ranked_sync_runs_status_idx").on(table.status),
    startedAtIdx: index("ranked_sync_runs_started_at_idx").on(table.startedAt),
  })
);

export type RankedSyncRun = typeof rankedSyncRuns.$inferSelect;
export type InsertRankedSyncRun = typeof rankedSyncRuns.$inferInsert;


/** Links de guias oficiais do Power League Prodigy submetidos manualmente. */
export const prodigyLinks = mysqlTable("prodigy_links", {
  id: int("id").autoincrement().primaryKey(),
  brawlerName: varchar("brawlerName", { length: 64 }).notNull(),
  url: varchar("url", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["pending", "verified"]).notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProdigyLink = typeof prodigyLinks.$inferSelect;
export type InsertProdigyLink = typeof prodigyLinks.$inferInsert;

/**
 * Relações direcionais de counter com o contexto factual onde foram observadas.
 * `mapId` e `mode` nulos representam, respetivamente, fallback por modo e
 * fallback global. A origem e a evidência são preservadas para auditoria.
 */
export const counterRelations = mysqlTable(
  "counter_relations",
  {
    id: int("id").autoincrement().primaryKey(),
    attacker: varchar("attacker", { length: 64 }).notNull(),
    defender: varchar("defender", { length: 64 }).notNull(),
    mapId: varchar("map_id", { length: 128 }),
    mode: varchar("mode", { length: 64 }),
    source: mysqlEnum("source", ["prodigy", "calculator", "planet", "topbrawl"])
      .notNull(),
    confidence: decimal("confidence", { precision: 5, scale: 4 }),
    sampleSize: int("sample_size"),
    tip: text("tip"),
    sourceUrl: varchar("source_url", { length: 1024 }),
    observedAt: timestamp("observed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    contextSourceUq: uniqueIndex("counter_relations_context_source_uq").on(
      table.attacker,
      table.defender,
      table.mapId,
      table.mode,
      table.source
    ),
    contextualLookupIdx: index("counter_relations_contextual_lookup_idx").on(
      table.mapId,
      table.mode,
      table.attacker,
      table.defender,
      table.source
    ),
  })
);

export type CounterRelation = typeof counterRelations.$inferSelect;
export type InsertCounterRelation = typeof counterRelations.$inferInsert;

/** Configuração singleton da sincronização horária de counters publicados. */
export const counterSyncConfig = mysqlTable(
  "counter_sync_config",
  {
    id: int("id").primaryKey().default(1),
    scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
    cronExpression: varchar("cron_expression", { length: 32 })
      .notNull()
      .default("0 0 * * * *"),
    enabled: int("enabled").notNull().default(0),
    lastStatus: mysqlEnum("last_status", ["idle", "running", "success", "failed"])
      .notNull()
      .default("idle"),
    lastStartedAt: timestamp("last_started_at"),
    lastCompletedAt: timestamp("last_completed_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    scheduleTaskUidIdx: index("counter_sync_schedule_task_uid_idx").on(
      table.scheduleCronTaskUid
    ),
  })
);

export type CounterSyncConfig = typeof counterSyncConfig.$inferSelect;
export type InsertCounterSyncConfig = typeof counterSyncConfig.$inferInsert;

/** Último estado válido que pode alimentar o Draft e os perfis de Brawlers. */
export const counterSyncSnapshots = mysqlTable("counter_sync_snapshots", {
  id: int("id").primaryKey().default(1),
  version: varchar("version", { length: 64 }).notNull(),
  capturedAt: timestamp("captured_at").notNull(),
  relationCount: int("relation_count").notNull().default(0),
  brawlScopeStatus: varchar("brawlscope_status", { length: 32 }).notNull(),
  calculatorStatus: varchar("calculator_status", { length: 32 }).notNull(),
  planetStatus: varchar("planet_status", { length: 32 }).notNull(),
  sourceNotes: text("source_notes"),
  payload: longtext("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type CounterSyncSnapshot = typeof counterSyncSnapshots.$inferSelect;
export type InsertCounterSyncSnapshot = typeof counterSyncSnapshots.$inferInsert;

/** Histórico de execução, inclusive quando uma fonte falha ou fica incompleta. */
export const counterSyncRuns = mysqlTable(
  "counter_sync_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    trigger: mysqlEnum("trigger", ["scheduled", "manual", "bootstrap"]).notNull(),
    status: mysqlEnum("status", ["running", "success", "failed"]).notNull(),
    relationCount: int("relation_count").notNull().default(0),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    brawlScopeStatus: varchar("brawlscope_status", { length: 32 }),
    calculatorStatus: varchar("calculator_status", { length: 32 }),
    planetStatus: varchar("planet_status", { length: 32 }),
    error: text("error"),
  },
  table => ({
    statusIdx: index("counter_sync_runs_status_idx").on(table.status),
    startedAtIdx: index("counter_sync_runs_started_at_idx").on(table.startedAt),
  })
);

export type CounterSyncRun = typeof counterSyncRuns.$inferSelect;
export type InsertCounterSyncRun = typeof counterSyncRuns.$inferInsert;

/** Evidência literal por snapshot e fonte; nunca é tratada como remoção isolada. */
export const counterSyncRelationEvidence = mysqlTable(
  "counter_sync_relation_evidence",
  {
    id: int("id").autoincrement().primaryKey(),
    snapshotVersion: varchar("snapshot_version", { length: 64 }).notNull(),
    source: mysqlEnum("source", ["brawlscope", "calculator", "planet", "prodigy"]).notNull(),
    attacker: varchar("attacker", { length: 64 }).notNull(),
    defender: varchar("defender", { length: 64 }).notNull(),
    sourceUrl: varchar("source_url", { length: 1024 }).notNull(),
    observedAt: timestamp("observed_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => ({
    snapshotSourcePairUq: uniqueIndex("counter_sync_evidence_snapshot_source_pair_uq").on(
      table.snapshotVersion,
      table.source,
      table.attacker,
      table.defender
    ),
    pairLookupIdx: index("counter_sync_evidence_pair_lookup_idx").on(
      table.attacker,
      table.defender,
      table.source
    ),
  })
);

export type CounterSyncRelationEvidence = typeof counterSyncRelationEvidence.$inferSelect;
export type InsertCounterSyncRelationEvidence = typeof counterSyncRelationEvidence.$inferInsert;

/** Configuração singleton da amostragem horária de battle logs públicos. */
export const observedMatchCollectionConfig = mysqlTable(
  "observed_match_collection_config",
  {
    id: int("id").primaryKey().default(1),
    scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
    cronExpression: varchar("cron_expression", { length: 32 })
      .notNull()
      .default("0 5 * * * *"),
    enabled: int("enabled").notNull().default(0),
    lastStatus: mysqlEnum("last_status", ["idle", "running", "success", "failed"])
      .notNull()
      .default("idle"),
    lastStartedAt: timestamp("last_started_at"),
    lastCompletedAt: timestamp("last_completed_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    scheduleTaskUidIdx: index("observed_collection_schedule_task_uid_idx").on(
      table.scheduleCronTaskUid
    ),
  })
);

export type ObservedMatchCollectionConfig = typeof observedMatchCollectionConfig.$inferSelect;
export type InsertObservedMatchCollectionConfig = typeof observedMatchCollectionConfig.$inferInsert;

/** Auditoria compacta de cada execução da coleta de partidas públicas. */
export const observedMatchCollectionRuns = mysqlTable(
  "observed_match_collection_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    trigger: mysqlEnum("trigger", ["scheduled", "manual", "bootstrap"]).notNull(),
    status: mysqlEnum("status", ["running", "success", "failed"]).notNull(),
    playersSampled: int("players_sampled").notNull().default(0),
    battlesFetched: int("battles_fetched").notNull().default(0),
    battlesInserted: int("battles_inserted").notNull().default(0),
    pairObservations: int("pair_observations").notNull().default(0),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    error: text("error"),
  },
  table => ({
    statusIdx: index("observed_collection_runs_status_idx").on(table.status),
    startedAtIdx: index("observed_collection_runs_started_at_idx").on(table.startedAt),
  })
);

export type ObservedMatchCollectionRun = typeof observedMatchCollectionRuns.$inferSelect;
export type InsertObservedMatchCollectionRun = typeof observedMatchCollectionRuns.$inferInsert;

/**
 * Partida de equipa observada pela API oficial. A impressão digital é única,
 * logo a mesma batalha recolhida a partir de dois jogadores só é contada uma vez.
 */
export const observedBattles = mysqlTable(
  "observed_battles",
  {
    id: int("id").autoincrement().primaryKey(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    battleTime: timestamp("battle_time").notNull(),
    mapId: varchar("map_id", { length: 128 }).notNull(),
    mode: varchar("mode", { length: 64 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    winningTeam: longtext("winning_team").notNull(),
    losingTeam: longtext("losing_team").notNull(),
    sourcePlayerTag: varchar("source_player_tag", { length: 32 }).notNull(),
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  table => ({
    fingerprintUq: uniqueIndex("observed_battles_fingerprint_uq").on(table.fingerprint),
    mapModeTimeIdx: index("observed_battles_map_mode_time_idx").on(
      table.mapId,
      table.mode,
      table.battleTime
    ),
  })
);

export type ObservedBattle = typeof observedBattles.$inferSelect;
export type InsertObservedBattle = typeof observedBattles.$inferInsert;

/** Agregado incremental de resultados de equipa por mapa, modo e par direcional. */
export const observedMatchupAggregates = mysqlTable(
  "observed_matchup_aggregates",
  {
    id: int("id").autoincrement().primaryKey(),
    mapId: varchar("map_id", { length: 128 }).notNull(),
    mode: varchar("mode", { length: 64 }).notNull(),
    brawler: varchar("brawler", { length: 64 }).notNull(),
    opponent: varchar("opponent", { length: 64 }).notNull(),
    wins: int("wins").notNull().default(0),
    losses: int("losses").notNull().default(0),
    samples: int("samples").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    matchupUq: uniqueIndex("observed_matchup_context_pair_uq").on(
      table.mapId,
      table.mode,
      table.brawler,
      table.opponent
    ),
    brawlerLookupIdx: index("observed_matchup_brawler_lookup_idx").on(
      table.mapId,
      table.mode,
      table.brawler
    ),
  })
);

export type ObservedMatchupAggregate = typeof observedMatchupAggregates.$inferSelect;
export type InsertObservedMatchupAggregate = typeof observedMatchupAggregates.$inferInsert;
