import { normalizeBrawlScopeModeId } from "./brawlScopeModes";
import type { EncodedMatchupMatrices } from "./matchupMatrixCodec";

/** Fontes autorizadas para o catálogo literal usado pelo Draft. */
export type CounterSyncSourceKey = "brawlscope" | "calculator" | "planet" | "prodigy";

export type CounterSyncSourceStatus = "static" | "success" | "partial" | "failed";

export type CounterSyncSourceState = {
  status: CounterSyncSourceStatus;
  complete: boolean;
  fetchedAt: string;
  brawlers: string[];
  modes?: string[];
  relationCount: number;
  note?: string;
};

/** Direção literal publicada por uma fonte, antes da resolução de prioridade. */
export type SyncedCounterRelation = {
  /** Brawler da página pública que listou esta relação. */
  owner: string;
  /** Coluna literal exibida na página titular. */
  direction: "targets" | "counteredBy";
  attacker: string;
  defender: string;
  source: CounterSyncSourceKey;
  sourceUrl: string;
  /** Filtro do BrawlScope ou outro contexto de modo; ausente significa global. */
  modeId?: string;
  mode?: string;
  /** Patente lida na fonte; ausente significa a leitura por omissão (Lendário+). */
  rankId?: string;
  reason?: string;
  delta?: number;
  /** Mantida por uma única confirmação de ausência, aguardando a segunda. */
  pendingRemoval?: boolean;
};

/**
 * Sinergia literal publicada por uma fonte ("Pair with" no BrawlScope). Fica
 * separada de `SyncedCounterRelation` porque não tem direção atacante/defensor:
 * é uma recomendação de par, lida na página do titular e preservada na ordem
 * publicada. Nunca é criada por reciprocidade — se a página do aliado não listar
 * o titular de volta, a relação inversa não existe.
 */
export type SyncedSynergyRelation = {
  /** Brawler da página pública que listou a sinergia. */
  owner: string;
  /** Aliado exatamente como a fonte o nomeia. */
  teammate: string;
  source: CounterSyncSourceKey;
  sourceUrl: string;
  /** Posição publicada na lista (1 = primeiro cartão). */
  rank: number;
  /** Filtro do BrawlScope ou outro contexto de modo; ausente significa global. */
  modeId?: string;
  mode?: string;
  /** Patente lida na fonte; ausente significa a leitura por omissão (Lendário+). */
  rankId?: string;
  delta?: number;
  /** Mantida por uma única leitura completa sem evidência, aguardando a segunda. */
  pendingRemoval?: boolean;
};

export type CounterSyncSnapshotPayload = {
  /** Kept in the database for resume/audit, stripped from visitor snapshots. */
  browserCaptures?: import("./brawlScopeCapture").BrawlScopeCapture[];
  schemaVersion: 2;
  capturedAt: string;
  sourceStates: Record<CounterSyncSourceKey, CounterSyncSourceState>;
  relations: SyncedCounterRelation[];
  /**
   * Listas de sinergia literais. Opcional para compatibilidade com snapshots
   * gravados antes desta leitura; a ausência significa "sem sinergia lida",
   * nunca "sem sinergia publicada".
   */
  synergies?: SyncedSynergyRelation[];
  /** União dos rosters de todas as fontes, preservando os nomes editoriais. */
  activeBrawlers?: string[];
  /** Contador por par direcional, atualizado apenas com leituras completas. */
  absenceStreaks: Record<string, number>;
  /**
   * Matrizes "Every matchup" por vista, no formato compacto.
   *
   * Só existe na cópia **gravada** da snapshot. É deliberadamente removida antes
   * de a snapshot seguir para os clientes: são centenas de milhares de números,
   * e quem precisa deles pede a vista que quer por `counterSync.matchups`, uma
   * de cada vez. Guardá-las serve para uma reinicialização do servidor não
   * apagar a leitura por modo — sem isto, voltar a ter as sete vistas demorava
   * quase duas horas de recolha.
   */
  matchupMatrices?: EncodedMatchupMatrices;
};

export type CounterSnapshotSseEvent = {
  version: string;
  capturedAt: string;
  payload: CounterSyncSnapshotPayload;
};

export function parseCounterSnapshotEvent(data: string): CounterSnapshotSseEvent {
  const parsed = JSON.parse(data) as Partial<CounterSnapshotSseEvent>;
  if (
    typeof parsed.version !== "string" ||
    typeof parsed.capturedAt !== "string" ||
    !parsed.payload ||
    parsed.payload.schemaVersion !== 2 ||
    !Array.isArray(parsed.payload.relations)
  ) {
    throw new Error("Payload counter_snapshot inválido");
  }
  return parsed as CounterSnapshotSseEvent;
}

export function counterRelationKey(attacker: string, defender: string) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${normalize(attacker)}:${normalize(defender)}`;
}

export function counterRelationContextKey(attacker: string, defender: string, modeId?: string) {
  return `${modeId ?? "global"}:${counterRelationKey(attacker, defender)}`;
}

/** Identidade de um par de sinergia dentro de uma fonte e de um modo. */
export function synergyRelationContextKey(owner: string, teammate: string, modeId?: string) {
  return `${modeId ?? "global"}:${counterRelationKey(owner, teammate)}`;
}

/**
 * Sinergias literais do titular, na ordem publicada. Um `modeId` pedido usa as
 * leituras desse modo e só recorre à leitura global quando o modo não publicou
 * nenhuma lista para o titular.
 */
export function getSnapshotSynergies(
  snapshot: CounterSyncSnapshotPayload | undefined,
  owner: string,
  source: CounterSyncSourceKey,
  modeId?: string,
): SyncedSynergyRelation[] {
  if (!snapshot?.synergies?.length) return [];
  const ownerKey = normalizeCounterBrawlerName(owner);
  const mine = snapshot.synergies.filter(
    (entry) => entry.source === source && normalizeCounterBrawlerName(entry.owner) === ownerKey && !entry.pendingRemoval,
  );
  if (!mine.length) return [];
  const modeKey = (value?: string) => normalizeBrawlScopeModeId(value) ?? value;
  const scoped = modeId ? mine.filter((entry) => modeKey(entry.modeId) === modeKey(modeId)) : mine.filter((entry) => !entry.modeId);
  /**
   * A regra é a mesma para todas as fontes.
   *
   * O BrawlScope estava de fora: pedida uma lista por modo, devolvia-se o que
   * esse modo tivesse e mais nada. Só que a recolha lê UMA das sete vistas por
   * ciclo, por isso um modo ainda não lido não tem lista nenhuma — e a sinergia
   * do BrawlScope, que é a principal, desaparecia do Draft sem aviso, em uns
   * brawlers sim e noutros não, consoante a vista que tivesse entrado.
   *
   * Era também o contrário do que esta função promete acima, e do que as outras
   * fontes já faziam.
   *
   * Recorrer à leitura geral não inventa nada: é uma lista que a fonte publicou,
   * na página do titular. O que continua proibido é o inverso — a leitura geral
   * nunca junta listas de modo, porque essas valem no modo delas.
   */
  const chosen = scoped.length ? scoped : modeId ? mine.filter((entry) => !entry.modeId) : [];
  const seen = new Set<string>();
  return chosen
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .filter((entry) => {
      const key = normalizeCounterBrawlerName(entry.teammate);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Identidade partilhada entre fontes e catálogo; o nome editorial não é alterado. */
export function normalizeCounterBrawlerName(value: string) {
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return key === "larry" || key === "larryandlawrie" ? "larrylawrie" : key;
}

export function uniqueCounterBrawlerNames(names: readonly string[]) {
  const unique = new Map<string, string>();
  for (const name of names) {
    const key = normalizeCounterBrawlerName(name);
    if (key && !unique.has(key)) unique.set(key, name.trim());
  }
  return Array.from(unique.values());
}

/** Inclui os estados para compatibilidade com snapshots antigos de roster reduzido. */
export function getCounterSnapshotBrawlers(snapshot?: CounterSyncSnapshotPayload) {
  if (!snapshot) return [];
  return uniqueCounterBrawlerNames([
    ...(snapshot.sourceStates.brawlscope?.brawlers ?? []),
    ...(snapshot.activeBrawlers ?? []),
    ...Object.values(snapshot.sourceStates).flatMap(state => state.brawlers),
  ]);
}
