import { OWNER_LOGIN_OPEN_ID } from "@shared/ownerLogin";
import { and, count, desc, eq, isNull, or, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import {
  InsertRankedSyncConfig,
  InsertRankedSyncRun,
  InsertRankedSyncSnapshot,
  InsertCounterSyncConfig,
  InsertCounterSyncRun,
  InsertCounterSyncSnapshot,
  InsertUser,
  InsertObservedBattle,
  InsertObservedMatchCollectionConfig,
  InsertObservedMatchCollectionRun,
  CounterRelation,
  counterRelations,
  counterSyncConfig,
  counterSyncRelationEvidence,
  counterSyncRuns,
  counterSyncSnapshots,
  brawlScopeCaptures,
  InsertBrawlScopeCapture,
  rankedMapCaptures,
  InsertRankedMapCapture,
  observedBattles,
  observedMatchCollectionConfig,
  observedMatchCollectionRuns,
  observedMatchupAggregates,
  rankedSyncConfig,
  rankedSyncRuns,
  rankedSyncSnapshots,
  users,
  prodigyLinks,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { parseDatabaseUrl } from "./databaseUrl";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof createPool> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      /**
       * Uma base de dados alojada fora da plataforma do site exige TLS, e o
       * mysql2 não percebe o `?ssl-mode=REQUIRED` que vem no endereço. A
       * leitura traduz isso; se o endereço não der para ler, entrega-se o texto
       * tal e qual, como sempre se fez.
       */
      const ligacao = parseDatabaseUrl(process.env.DATABASE_URL);
      _pool = ligacao ? createPool(ligacao) : createPool(process.env.DATABASE_URL.trim());
      // The project may resolve mysql2 types through two package paths; the
      // runtime object is the standard mysql2 pool expected by Drizzle.
      _db = drizzle(_pool as never);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _pool = null;
      _db = null;
    }
  }
  return _db;
}

/**
 * Leitura tolerante à base de dados.
 *
 * O QUE ISTO EVITA
 *
 * A página de Início pede a configuração e a última snapshot logo ao abrir. Se
 * a base de dados não estiver acessível — tabelas por criar numa instalação
 * nova, credenciais por definir, servidor em baixo — essas consultas rebentam,
 * o erro sobe até ao cliente, e o SITE INTEIRO deixa de carregar. Foi isso que
 * produziu "Failed query: select ... from ranked_sync_config".
 *
 * E é uma falha absurda, porque o site não precisa da base de dados para
 * funcionar: tem o catálogo do projeto embutido. A base de dados só guarda o
 * que as recolhas trouxeram DEPOIS. Sem ela, os números são os do repositório —
 * antigos, mas certos.
 *
 * Por isso toda a LEITURA passa por aqui: uma falha devolve o valor de recurso e
 * fica registada no log. As ESCRITAS continuam a falhar em voz alta, porque aí
 * ignorar o erro esconderia dados perdidos.
 */
const avisosDados = new Set<string>();

async function lerDaBase<T>(operacao: string, ler: () => Promise<T>, recurso: T): Promise<T> {
  try {
    return await ler();
  } catch (error) {
    // Um aviso por operação: o log serve para diagnosticar, não para inundar.
    if (!avisosDados.has(operacao)) {
      avisosDados.add(operacao);
      const detalhe = error instanceof Error ? error.message : String(error);
      console.warn(`[Database] ${operacao} falhou; o site continua com o catálogo do projeto. Detalhe: ${detalhe}`);
      console.warn("[Database] Se for uma instalação nova, as tabelas ainda não existem: corre `pnpm db:push`.");
    }
    return recurso;
  }
}

/** Diagnóstico: a base de dados está acessível e com as tabelas criadas? */
export async function checkDatabase() {
  const db = await getDb();
  if (!db) {
    return { configured: Boolean(process.env.DATABASE_URL), reachable: false, error: "DATABASE_URL não está definida ou a ligação falhou." };
  }
  try {
    await db.select().from(rankedSyncConfig).where(eq(rankedSyncConfig.id, 1)).limit(1);
    return { configured: true, reachable: true, error: null as string | null };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    /**
     * Quem é o dono do site.
     *
     * Era decidido só por `OWNER_OPEN_ID`: se essa variável não estivesse
     * definida — ou tivesse o valor errado — NINGUÉM ficava admin, e o botão de
     * atualizar respondia "Apenas o proprietário pode forçar uma atualização"
     * para sempre, sem dizer como se resolve. Um site sem dono nenhum não é uma
     * proteção: é uma porta trancada com a chave lá dentro.
     *
     * Três formas de reconhecer o dono, por ordem:
     *  1. `OWNER_OPEN_ID` — o identificador exato, quando se sabe.
     *  2. `OWNER_EMAIL` — o email, que é o que uma pessoa sabe de cor.
     *  3. Se nenhuma estiver configurada E ainda não existir nenhum admin, o
     *     primeiro a entrar reclama o site. Só acontece uma vez: a partir do
     *     momento em que há um admin, esta via fecha-se sozinha.
     */
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (await shouldBeOwner(db, user)) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

/** Há algum admin registado? Fecha a via do "primeiro a entrar". */
export async function hasAnyAdmin() {
  const db = await getDb();
  if (!db) return false;
  return lerDaBase("hasAnyAdmin", async () => {
    const linhas = await db.select({ total: count() }).from(users).where(eq(users.role, "admin"));
    return (linhas[0]?.total ?? 0) > 0;
  }, false);
}

async function shouldBeOwner(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, user: InsertUser) {
  const ownerOpenId = ENV.ownerOpenId.trim();
  const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

  /**
   * Quem entra pela palavra-passe é o dono, e ponto.
   *
   * A palavra-passe está definida no alojamento; só lá chega quem manda no
   * site. Fazer essa sessão depender ainda de `OWNER_OPEN_ID` ou de ser a
   * primeira a entrar dava o caso absurdo de o dono provar quem é e mesmo
   * assim levar com "apenas o proprietário pode forçar uma atualização".
   */
  if (user.openId === OWNER_LOGIN_OPEN_ID) return true;

  if (ownerOpenId && user.openId === ownerOpenId) return true;
  if (ownerEmail && (user.email ?? "").trim().toLowerCase() === ownerEmail) return true;
  // Sem dono configurado: o primeiro a entrar reclama o site.
  if (ownerOpenId || ownerEmail) return false;

  const linhas = await db.select({ total: count() }).from(users).where(eq(users.role, "admin"));
  const jaHaAdmin = (linhas[0]?.total ?? 0) > 0;
  if (jaHaAdmin) return false;

  console.log(`[Auth] Nenhum dono configurado e nenhum admin registado: ${user.email ?? user.openId} fica admin. Para fixar, define OWNER_OPEN_ID=${user.openId}`);
  return true;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return lerDaBase("getUserByOpenId", async () => {
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function ensureRankedSyncConfig() {
  const db = await getDb();
  if (!db) return undefined;
  // Chamada no arranque de cada página; uma tabela em falta não pode fechar o site.
  return lerDaBase("ensureRankedSyncConfig", async () => {
    const existing = await db.select().from(rankedSyncConfig).where(eq(rankedSyncConfig.id, 1)).limit(1);
    if (existing[0]) return existing[0];

    await db.insert(rankedSyncConfig).values({
      id: 1,
      cronExpression: "0 0 * * * *",
      enabled: 0,
      lastStatus: "idle",
    });
    const created = await db.select().from(rankedSyncConfig).where(eq(rankedSyncConfig.id, 1)).limit(1);
    return created[0];
  }, undefined);
}

export async function getRankedSyncConfig() {
  const db = await getDb();
  if (!db) return undefined;
  return lerDaBase("getRankedSyncConfig", async () => {
    const result = await db.select().from(rankedSyncConfig).where(eq(rankedSyncConfig.id, 1)).limit(1);
    return result[0];
  }, undefined);
}

export async function getRankedSyncConfigByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(rankedSyncConfig)
    .where(eq(rankedSyncConfig.scheduleCronTaskUid, taskUid))
    .limit(1);
  return result[0];
}

export async function updateRankedSyncConfig(
  patch: Partial<InsertRankedSyncConfig>
) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureRankedSyncConfig();
  await db.update(rankedSyncConfig).set(patch).where(eq(rankedSyncConfig.id, 1));
  return getRankedSyncConfig();
}

export async function createRankedSyncRun(trigger: "scheduled" | "manual" | "bootstrap") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(rankedSyncRuns).values({ trigger, status: "running" });
  return Number((result as { insertId?: number }).insertId ?? 0);
}

export async function updateRankedSyncRun(
  id: number,
  patch: Partial<InsertRankedSyncRun>
) {
  const db = await getDb();
  if (!db || !id) return;
  await db.update(rankedSyncRuns).set(patch).where(eq(rankedSyncRuns.id, id));
}

export async function upsertRankedSyncSnapshot(snapshot: InsertRankedSyncSnapshot) {
  const db = await getDb();
  if (!db) return undefined;
  await db.insert(rankedSyncSnapshots).values(snapshot).onDuplicateKeyUpdate({
    set: {
      version: snapshot.version,
      capturedAt: snapshot.capturedAt,
      rowCount: snapshot.rowCount,
      topBrawlStatus: snapshot.topBrawlStatus,
      brawlPlanetStatus: snapshot.brawlPlanetStatus,
      sourceNotes: snapshot.sourceNotes,
      payload: snapshot.payload,
    },
  });
  return getRankedSyncSnapshot();
}

export async function getRankedSyncSnapshot() {
  const db = await getDb();
  if (!db) return undefined;
  return lerDaBase("getRankedSyncSnapshot", async () => {
    const result = await db
      .select()
      .from(rankedSyncSnapshots)
      .where(eq(rankedSyncSnapshots.id, 1))
      .limit(1);
    return result[0];
  }, undefined);
}

export async function listRankedSyncRuns(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return lerDaBase("listRankedSyncRuns", () => db.select().from(rankedSyncRuns).orderBy(desc(rankedSyncRuns.startedAt)).limit(limit), []);
}

export async function ensureCounterSyncConfig() {
  const db = await getDb();
  if (!db) return undefined;
  return lerDaBase("ensureCounterSyncConfig", async () => {
    const existing = await db.select().from(counterSyncConfig).where(eq(counterSyncConfig.id, 1)).limit(1);
    if (existing[0]) return existing[0];

    await db.insert(counterSyncConfig).values({
      id: 1,
      cronExpression: "0 0 * * * *",
      enabled: 0,
      lastStatus: "idle",
    });
    const created = await db.select().from(counterSyncConfig).where(eq(counterSyncConfig.id, 1)).limit(1);
    return created[0];
  }, undefined);
}

export async function getCounterSyncConfig() {
  const db = await getDb();
  if (!db) return undefined;
  return lerDaBase("getCounterSyncConfig", async () => {
    const result = await db.select().from(counterSyncConfig).where(eq(counterSyncConfig.id, 1)).limit(1);
    return result[0];
  }, undefined);
}

export async function getCounterSyncConfigByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(counterSyncConfig)
    .where(eq(counterSyncConfig.scheduleCronTaskUid, taskUid))
    .limit(1);
  return result[0];
}

export async function updateCounterSyncConfig(patch: Partial<InsertCounterSyncConfig>) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureCounterSyncConfig();
  await db.update(counterSyncConfig).set(patch).where(eq(counterSyncConfig.id, 1));
  return getCounterSyncConfig();
}

export async function createCounterSyncRun(trigger: "scheduled" | "manual" | "bootstrap") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(counterSyncRuns).values({ trigger, status: "running" });
  return Number((result as { insertId?: number }).insertId ?? 0);
}

export async function updateCounterSyncRun(id: number, patch: Partial<InsertCounterSyncRun>) {
  const db = await getDb();
  if (!db || !id) return;
  await db.update(counterSyncRuns).set(patch).where(eq(counterSyncRuns.id, id));
}

export async function upsertCounterSyncSnapshot(snapshot: InsertCounterSyncSnapshot) {
  const db = await getDb();
  if (!db) return undefined;
  await db.insert(counterSyncSnapshots).values(snapshot).onDuplicateKeyUpdate({
    set: {
      version: snapshot.version,
      capturedAt: snapshot.capturedAt,
      relationCount: snapshot.relationCount,
      brawlScopeStatus: snapshot.brawlScopeStatus,
      calculatorStatus: snapshot.calculatorStatus,
      planetStatus: snapshot.planetStatus,
      sourceNotes: snapshot.sourceNotes,
      payload: snapshot.payload,
    },
  });
  return getCounterSyncSnapshot();
}

export async function getCounterSyncSnapshot() {
  const db = await getDb();
  if (!db) return undefined;
  // Pedida em todas as páginas. Sem ela, o site usa o catálogo do projeto.
  return lerDaBase("getCounterSyncSnapshot", async () => {
    const result = await db
      .select()
      .from(counterSyncSnapshots)
      .where(eq(counterSyncSnapshots.id, 1))
      .limit(1);
    return result[0];
  }, undefined);
}

export async function listCounterSyncRuns(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return lerDaBase("listCounterSyncRuns", () => db.select().from(counterSyncRuns).orderBy(desc(counterSyncRuns.startedAt)).limit(limit), []);
}

export type CounterSyncEvidenceInput = {
  snapshotVersion: string;
  source: "brawlscope" | "calculator" | "planet" | "prodigy";
  attacker: string;
  defender: string;
  sourceUrl: string;
  observedAt: Date;
};

/** Persiste a evidência de um snapshot sem apagar o histórico de snapshots anteriores. */
export async function insertCounterSyncEvidence(rows: CounterSyncEvidenceInput[]) {
  // Latest snapshots retain source provenance. Extra per-cycle history is opt-in.
  if (process.env.BRAWL_EVIDENCE_HISTORY_ENABLED !== "true") return;
  const db = await getDb();
  if (!db || rows.length === 0) return;

  const CHUNK_SIZE = 300;
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);
    await db.insert(counterSyncRelationEvidence).values(chunk).onDuplicateKeyUpdate({
      set: { observedAt: sql`VALUES(observed_at)`, sourceUrl: sql`VALUES(source_url)` },
    });
  }
}

/**
 * Grava as fichas de UM grupo, e só esse grupo.
 *
 * É esta a diferença que torna a importação em lote viável: antes, confirmar
 * vinte fichas reescrevia a snapshot inteira — todas as fichas anteriores
 * incluídas. Aqui escrevem-se vinte linhas, independentemente de já lá estarem
 * setecentas.
 */
export async function upsertBrawlScopeCaptures(rows: InsertBrawlScopeCapture[]) {
  const db = await getDb();
  if (!db || rows.length === 0) return 0;

  // O mesmo recorte da evidência: um grupo grande nunca vira um pacote MySQL
  // grande de mais. Aqui os grupos são de vinte, mas a migração das fichas
  // antigas passa por cá com centenas.
  const CHUNK_SIZE = 50;
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    await db.insert(brawlScopeCaptures).values(rows.slice(index, index + CHUNK_SIZE)).onDuplicateKeyUpdate({
      set: {
        view: sql`VALUES(\`view\`)`,
        brawler: sql`VALUES(brawler)`,
        capturedAt: sql`VALUES(captured_at)`,
        payload: sql`VALUES(payload)`,
      },
    });
  }
  return rows.length;
}

/**
 * A fila completa, para o arranque a recuperar.
 *
 * Isto continua a ser uma leitura grande — mas uma por instância fria, não uma
 * por cada grupo de vinte fichas.
 */
export async function listBrawlScopeCaptures() {
  const db = await getDb();
  if (!db) return [];
  return lerDaBase("listBrawlScopeCaptures", () => db.select().from(brawlScopeCaptures), []);
}

/** Quantas fichas estão na fila, sem trazer nenhuma. */
export async function countBrawlScopeCaptures() {
  const db = await getDb();
  if (!db) return 0;
  return lerDaBase("countBrawlScopeCaptures", async () => {
    const [linha] = await db.select({ total: count() }).from(brawlScopeCaptures);
    return Number(linha?.total ?? 0);
  }, 0);
}

/** Guarda as páginas de mapa recolhidas fora, uma linha por mapa. */
export async function upsertRankedMapCaptures(rows: InsertRankedMapCapture[]) {
  const db = await getDb();
  if (!db || rows.length === 0) return 0;
  const CHUNK_SIZE = 25;
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    await db.insert(rankedMapCaptures).values(rows.slice(index, index + CHUNK_SIZE)).onDuplicateKeyUpdate({
      set: { map: sql`VALUES(\`map\`)`, capturedAt: sql`VALUES(captured_at)`, payload: sql`VALUES(payload)` },
    });
  }
  return rows.length;
}

/**
 * Quantos mapas há guardados, sem trazer os conteúdos.
 *
 * A sincronização precisa de saber se tem com que trabalhar ANTES de decidir
 * se desiste. Contar com `listRankedMapCaptures` obrigaria a carregar o HTML
 * dos 26 mapas só para ler um número.
 */
export async function countRankedMapCaptures() {
  const db = await getDb();
  if (!db) return 0;
  return lerDaBase("countRankedMapCaptures", async () => {
    const [linha] = await db.select({ total: count() }).from(rankedMapCaptures);
    return Number(linha?.total ?? 0);
  }, 0);
}

/** Tudo o que foi recolhido fora, para a sincronização usar. */
export async function listRankedMapCaptures() {
  const db = await getDb();
  if (!db) return [];
  return lerDaBase("listRankedMapCaptures", () => db.select().from(rankedMapCaptures), []);
}

export async function getProdigyLinks() {
  const db = await getDb();
  if (!db) return [];
  return lerDaBase("getProdigyLinks", () => db.select().from(prodigyLinks).orderBy(desc(prodigyLinks.createdAt)), []);
}

export async function addProdigyLink(link: { brawlerName: string; url: string; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(prodigyLinks).values({
    brawlerName: link.brawlerName,
    url: link.url,
    notes: link.notes ?? null,
    status: "pending",
  });
  return result;
}

export async function deleteProdigyLink(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(prodigyLinks).where(eq(prodigyLinks.id, id));
  return { success: true };
}

const counterSourcePriority = {
  prodigy: 0,
  calculator: 1,
  planet: 2,
  topbrawl: 3,
} as const;

export type CounterContext = {
  attacker: string;
  defender: string;
  mapId?: string | null;
  mode?: string | null;
};

export type CounterContextScope = "map" | "mode" | "global" | "none";
export type CounterDirection = "targets" | "counteredBy" | "conflict" | null;

export type ResolvedContextualCounter = {
  scope: CounterContextScope;
  direction: CounterDirection;
  relation: CounterRelation | null;
  opposingRelation: CounterRelation | null;
};

function numericValue(value: string | number | null) {
  if (value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareEvidence(left: CounterRelation, right: CounterRelation) {
  const confidenceDifference = numericValue(left.confidence) - numericValue(right.confidence);
  if (confidenceDifference !== 0) return confidenceDifference;

  const sampleDifference = (left.sampleSize ?? 0) - (right.sampleSize ?? 0);
  if (sampleDifference !== 0) return sampleDifference;

  return counterSourcePriority[right.source] - counterSourcePriority[left.source];
}

function strongestRelation(relations: CounterRelation[]) {
  return relations.reduce<CounterRelation | null>((best, relation) => {
    if (!best || compareEvidence(relation, best) > 0) return relation;
    return best;
  }, null);
}

function relationScope(relation: CounterRelation, context: CounterContext): CounterContextScope {
  if (context.mapId && context.mode && relation.mapId === context.mapId && relation.mode === context.mode) {
    return "map";
  }
  if (!relation.mapId && context.mode && relation.mode === context.mode) return "mode";
  if (!relation.mapId && !relation.mode) return "global";
  return "none";
}

/**
 * Resolve um confronto nas relações já filtradas. O nível de contexto (mapa,
 * modo, global) é escolhido antes da direção para impedir que um fallback global
 * anule ou duplique uma relação específica de mapa.
 */
export function resolveContextualCounterRelations(
  context: CounterContext,
  relations: CounterRelation[]
): ResolvedContextualCounter {
  const scopes: CounterContextScope[] = ["map", "mode", "global"];
  const availableScope = scopes.find(scope =>
    relations.some(relation => relationScope(relation, context) === scope)
  ) ?? "none";

  if (availableScope === "none") {
    return { scope: "none", direction: null, relation: null, opposingRelation: null };
  }

  const scoped = relations.filter(relation => relationScope(relation, context) === availableScope);
  const forward = strongestRelation(
    scoped.filter(relation => relation.attacker === context.attacker && relation.defender === context.defender)
  );
  const reverse = strongestRelation(
    scoped.filter(relation => relation.attacker === context.defender && relation.defender === context.attacker)
  );

  if (forward && !reverse) {
    return { scope: availableScope, direction: "targets", relation: forward, opposingRelation: null };
  }
  if (!forward && reverse) {
    return { scope: availableScope, direction: "counteredBy", relation: reverse, opposingRelation: null };
  }
  if (!forward || !reverse) {
    return { scope: availableScope, direction: null, relation: null, opposingRelation: null };
  }

  const evidenceDifference = compareEvidence(forward, reverse);
  if (evidenceDifference === 0) {
    return {
      scope: availableScope,
      direction: "conflict",
      relation: forward,
      opposingRelation: reverse,
    };
  }

  return evidenceDifference > 0
    ? { scope: availableScope, direction: "targets", relation: forward, opposingRelation: reverse }
    : { scope: availableScope, direction: "counteredBy", relation: reverse, opposingRelation: forward };
}

/** Consulta as duas direções do par e aplica mapa > modo > global. */
export async function getContextualCounterResolution(context: CounterContext) {
  if (!context.attacker || !context.defender || context.attacker === context.defender) {
    return { scope: "none", direction: null, relation: null, opposingRelation: null } as ResolvedContextualCounter;
  }

  const db = await getDb();
  if (!db) {
    return { scope: "none", direction: null, relation: null, opposingRelation: null } as ResolvedContextualCounter;
  }

  const contextualClauses = [
    ...(context.mapId && context.mode
      ? [and(eq(counterRelations.mapId, context.mapId), eq(counterRelations.mode, context.mode))]
      : []),
    ...(context.mode
      ? [and(isNull(counterRelations.mapId), eq(counterRelations.mode, context.mode))]
      : []),
    and(isNull(counterRelations.mapId), isNull(counterRelations.mode)),
  ];

  const relations = await lerDaBase("getContextualCounterResolution", () => db
    .select()
    .from(counterRelations)
    .where(and(
      or(
        and(eq(counterRelations.attacker, context.attacker), eq(counterRelations.defender, context.defender)),
        and(eq(counterRelations.attacker, context.defender), eq(counterRelations.defender, context.attacker))
      ),
      or(...contextualClauses)
    )), [] as CounterRelation[]);

  return resolveContextualCounterRelations(context, relations);
}

export type ObservedMatchupDelta = {
  mapId: string;
  mode: string;
  brawler: string;
  opponent: string;
  wins: number;
  losses: number;
};

export async function ensureObservedMatchCollectionConfig() {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db
    .select()
    .from(observedMatchCollectionConfig)
    .where(eq(observedMatchCollectionConfig.id, 1))
    .limit(1);
  if (existing[0]) return existing[0];

  await db.insert(observedMatchCollectionConfig).values({
    id: 1,
    cronExpression: "0 5 * * * *",
    enabled: 0,
    lastStatus: "idle",
  });
  return lerDaBase("getObservedMatchCollectionConfig", async () => (await db
    .select()
    .from(observedMatchCollectionConfig)
    .where(eq(observedMatchCollectionConfig.id, 1))
    .limit(1))[0], undefined);
}

export async function getObservedMatchCollectionConfig() {
  const db = await getDb();
  if (!db) return undefined;
  return (await db
    .select()
    .from(observedMatchCollectionConfig)
    .where(eq(observedMatchCollectionConfig.id, 1))
    .limit(1))[0];
}

export async function getObservedMatchCollectionConfigByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db
    .select()
    .from(observedMatchCollectionConfig)
    .where(eq(observedMatchCollectionConfig.scheduleCronTaskUid, taskUid))
    .limit(1))[0];
}

export async function updateObservedMatchCollectionConfig(patch: Partial<InsertObservedMatchCollectionConfig>) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureObservedMatchCollectionConfig();
  await db.update(observedMatchCollectionConfig).set(patch).where(eq(observedMatchCollectionConfig.id, 1));
  return getObservedMatchCollectionConfig();
}

export async function createObservedMatchCollectionRun(trigger: "scheduled" | "manual" | "bootstrap") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(observedMatchCollectionRuns).values({ trigger, status: "running" });
  return Number((result as { insertId?: number }).insertId ?? 0);
}

export async function updateObservedMatchCollectionRun(
  id: number,
  patch: Partial<InsertObservedMatchCollectionRun>
) {
  const db = await getDb();
  if (!db || !id) return;
  await db.update(observedMatchCollectionRuns).set(patch).where(eq(observedMatchCollectionRuns.id, id));
}

/** Insere a batalha e seus pares numa única transação; duplicados não recontam o agregado. */
export async function recordObservedBattle(
  battle: InsertObservedBattle,
  deltas: readonly ObservedMatchupDelta[]
) {
  const db = await getDb();
  if (!db) return false;

  return db.transaction(async tx => {
    const insertResult = await tx
      .insert(observedBattles)
      .values(battle)
      .onDuplicateKeyUpdate({ set: { fingerprint: sql`fingerprint` } });
    const inserted = Number((insertResult as { affectedRows?: number }).affectedRows ?? 0) === 1;
    if (!inserted) return false;

    for (const delta of deltas) {
      await tx
        .insert(observedMatchupAggregates)
        .values({
          mapId: delta.mapId,
          mode: delta.mode,
          brawler: delta.brawler,
          opponent: delta.opponent,
          wins: delta.wins,
          losses: delta.losses,
          samples: delta.wins + delta.losses,
        })
        .onDuplicateKeyUpdate({
          set: {
            wins: sql`${observedMatchupAggregates.wins} + ${delta.wins}`,
            losses: sql`${observedMatchupAggregates.losses} + ${delta.losses}`,
            samples: sql`${observedMatchupAggregates.samples} + ${delta.wins + delta.losses}`,
          },
        });
    }
    return true;
  });
}

export async function listObservedMatchCollectionRuns(limit = 8) {
  const db = await getDb();
  if (!db) return [];
  return lerDaBase("listObservedMatchCollectionRuns", () => db.select().from(observedMatchCollectionRuns).orderBy(desc(observedMatchCollectionRuns.startedAt)).limit(limit), []);
}

export async function getObservedMatchupAggregate(input: {
  mapId: string;
  mode: string;
  brawler: string;
  opponent: string;
}) {
  const db = await getDb();
  if (!db) return undefined;
  return lerDaBase("getObservedMatchupAggregate", async () => (await db
    .select()
    .from(observedMatchupAggregates)
    .where(and(
      eq(observedMatchupAggregates.mapId, input.mapId),
      eq(observedMatchupAggregates.mode, input.mode),
      eq(observedMatchupAggregates.brawler, input.brawler),
      eq(observedMatchupAggregates.opponent, input.opponent)
    ))
    .limit(1))[0], undefined);
}

export async function getObservedMatchCollectionCoverage() {
  const db = await getDb();
  if (!db) return { battles: 0, pairSamples: 0 };
  return lerDaBase("getObservedMatchCollectionCoverage", async () => {
    const [battles] = await db.select({ value: count() }).from(observedBattles);
    const [pairs] = await db.select({ value: sum(observedMatchupAggregates.samples) }).from(observedMatchupAggregates);
    return {
      battles: Number(battles?.value ?? 0),
      pairSamples: Number(pairs?.value ?? 0),
    };
  }, { battles: 0, pairSamples: 0 });
}
