/**
 * Deteção automática de entradas e saídas no roster — mapas da rotação Ranked e
 * brawlers do jogo.
 *
 * O problema que isto resolve: a cada temporada a Supercell troca mapas, e de
 * vez em quando lança um brawler novo. Até aqui, cada uma dessas mudanças era
 * uma edição à mão em `RANKED_MAP_SOURCES` e no catálogo de classes. Enquanto
 * ninguém editasse, o site mostrava confiantemente a rotação da temporada
 * passada — que é pior do que mostrar um aviso, porque parece certo.
 *
 * ## As duas coisas que correm mal se isto for ingénuo
 *
 * **Apagar a rotação por causa de uma falha de rede.** Se o TopBrawl não
 * responder, a leitura vem vazia. Um sistema ingénuo conclui "saíram 26 mapas"
 * e limpa tudo. Por isso a ausência só conta como prova quando a leitura foi
 * COMPLETA — e mesmo assim são precisas duas leituras completas seguidas. É a
 * mesma disciplina que o projeto já usa para remover relações de counter.
 *
 * **Mostrar um mapa novo sem dados.** Um mapa que entrou hoje ainda não tem
 * estatísticas publicadas em lado nenhum. Se entrar logo no Draft, o motor
 * recomenda com base em nada. Por isso entra em QUARENTENA: fica visível e
 * identificado como novo, mas não alimenta recomendações até ter dados a sério.
 *
 * Este módulo é só decisão — não vai à rede nem escreve em lado nenhum. É por
 * isso que se consegue testar a sério.
 */

/** Estado de uma entrada do roster no ciclo de vida deteção → ativo → saída. */
export type RosterEntryStatus =
  /** Detetado pela fonte, ainda sem dados suficientes para contar no Score. */
  | "quarantine"
  /** Com dados confirmados; participa normalmente. */
  | "active"
  /** Deixou de aparecer, mas ainda sem prova suficiente para sair. */
  | "leaving";

export type RosterEntry = {
  name: string;
  status: RosterEntryStatus;
  /** Leituras completas seguidas em que a fonte não publicou esta entrada. */
  absenceStreak: number;
  /** Primeira vez que a entrada foi vista, em ISO. */
  firstSeenAt: string;
  /** Última vez que a fonte a publicou, em ISO. */
  lastSeenAt: string;
  /** Quando saiu da quarentena. Ausente enquanto lá estiver. */
  promotedAt?: string;
  /** O que falta para sair da quarentena, em linguagem corrente. */
  missing?: string[];
};

export type RosterState = {
  maps: RosterEntry[];
  brawlers: RosterEntry[];
  /** Momento da última avaliação, em ISO. */
  evaluatedAt: string;
};

export type RosterChange = {
  kind: "map" | "brawler";
  name: string;
  change: "entered" | "promoted" | "leaving" | "removed" | "returned";
  detail?: string;
};

export type RosterEvaluation = {
  state: RosterState;
  changes: RosterChange[];
};

/**
 * Leituras completas seguidas sem a entrada antes de a remover.
 *
 * Dois é deliberado. Um só permitiria que uma única resposta estranha da fonte
 * — um deploy a meio, uma página em manutenção que devolve 200 com o corpo
 * vazio — apagasse um mapa que está perfeitamente ativo. Três atrasaria a saída
 * de um mapa real em quarenta e cinco minutos sem ganhar praticamente nada.
 */
export const ROSTER_REMOVAL_STREAK = 2;

/** Linhas de dados mínimas para um mapa ser considerado utilizável. */
export const MAP_PROMOTION_MIN_ROWS = 20;

export const emptyRosterState = (evaluatedAt: string): RosterState => ({
  maps: [],
  brawlers: [],
  evaluatedAt,
});

function normalize(name: string) {
  return name.trim().toLowerCase();
}

function indexByName(entries: readonly RosterEntry[]) {
  return new Map(entries.map((entry) => [normalize(entry.name), entry]));
}

/**
 * Uma leitura de uma fonte. `complete` é o campo que faz o trabalho todo: só
 * uma leitura completa pode servir de prova de que algo desapareceu.
 */
export type RosterReading = {
  /** Nomes que a fonte publicou nesta leitura. */
  present: readonly string[];
  /**
   * A leitura terminou sem falhas. Uma recolha parcial (uma fonte em baixo, um
   * mapa que deu timeout) informa sobre o que EXISTE, mas nunca sobre o que
   * deixou de existir.
   */
  complete: boolean;
};

/** Evidência de que uma entrada já tem dados para participar. */
export type RosterEvidence = {
  /** Nome da entrada. */
  name: string;
  /** Linhas de dados associadas (brawlers pontuados no mapa, por exemplo). */
  rows: number;
  /** O que ainda falta, quando falta. */
  missing?: string[];
};

function evaluateSection(
  kind: "map" | "brawler",
  previous: readonly RosterEntry[],
  reading: RosterReading,
  evidence: readonly RosterEvidence[],
  minimumRows: number,
  now: string,
): { entries: RosterEntry[]; changes: RosterChange[] } {
  const before = indexByName(previous);
  const presentKeys = new Set(reading.present.map(normalize));
  const evidenceByName = new Map(evidence.map((item) => [normalize(item.name), item]));
  const entries: RosterEntry[] = [];
  const changes: RosterChange[] = [];

  for (const name of reading.present) {
    const key = normalize(name);
    const existing = before.get(key);
    const support = evidenceByName.get(key);
    const rows = support?.rows ?? 0;
    const missing = support?.missing ?? (rows >= minimumRows ? [] : ["estatísticas publicadas"]);
    const qualifies = rows >= minimumRows && missing.length === 0;

    if (!existing) {
      /**
       * Entrada nova. Mesmo que já venha com dados completos — acontece quando
       * um mapa regressa à rotação e as fontes ainda têm o histórico — entra
       * como ativa de imediato; não há razão para segurar dados que existem.
       */
      entries.push({
        name,
        status: qualifies ? "active" : "quarantine",
        absenceStreak: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        ...(qualifies ? { promotedAt: now } : { missing }),
      });
      changes.push({
        kind,
        name,
        change: "entered",
        detail: qualifies ? "com dados publicados" : `em quarentena — falta: ${missing.join(", ")}`,
      });
      continue;
    }

    // Estava a sair e voltou a aparecer: a contagem de ausências reinicia.
    if (existing.status === "leaving") {
      entries.push({ ...existing, status: existing.promotedAt ? "active" : "quarantine", absenceStreak: 0, lastSeenAt: now });
      changes.push({ kind, name, change: "returned", detail: "voltou a ser publicado antes de sair" });
      continue;
    }

    if (existing.status === "quarantine" && qualifies) {
      entries.push({ ...existing, status: "active", absenceStreak: 0, lastSeenAt: now, promotedAt: now, missing: undefined });
      changes.push({ kind, name, change: "promoted", detail: `${rows} linhas de dados` });
      continue;
    }

    entries.push({
      ...existing,
      absenceStreak: 0,
      lastSeenAt: now,
      ...(existing.status === "quarantine" ? { missing } : {}),
    });
  }

  for (const existing of previous) {
    if (presentKeys.has(normalize(existing.name))) continue;

    /**
     * Ausente numa leitura incompleta não é ausente: preserva-se tudo como
     * estava. É esta linha que impede uma falha de rede de apagar a rotação.
     */
    if (!reading.complete) {
      entries.push(existing);
      continue;
    }

    const absenceStreak = existing.absenceStreak + 1;
    if (absenceStreak >= ROSTER_REMOVAL_STREAK) {
      changes.push({
        kind,
        name: existing.name,
        change: "removed",
        detail: `ausente em ${absenceStreak} leituras completas seguidas`,
      });
      continue; // Não entra na lista nova: saiu.
    }

    if (existing.status !== "leaving") {
      changes.push({ kind, name: existing.name, change: "leaving", detail: "deixou de ser publicado; confirma-se na próxima leitura completa" });
    }
    entries.push({ ...existing, status: "leaving", absenceStreak });
  }

  entries.sort((left, right) => left.name.localeCompare(right.name, "pt-PT"));
  return { entries, changes };
}

/**
 * Aplica uma leitura ao estado anterior e devolve o estado novo mais a lista do
 * que mudou. Puro: as mesmas entradas dão sempre o mesmo resultado.
 */
export function evaluateRoster(
  previous: RosterState | null | undefined,
  input: {
    maps?: RosterReading;
    mapEvidence?: readonly RosterEvidence[];
    brawlers?: RosterReading;
    brawlerEvidence?: readonly RosterEvidence[];
    now?: string;
  },
): RosterEvaluation {
  const now = input.now ?? new Date().toISOString();
  const base = previous ?? emptyRosterState(now);

  const maps = input.maps
    ? evaluateSection("map", base.maps, input.maps, input.mapEvidence ?? [], MAP_PROMOTION_MIN_ROWS, now)
    : { entries: [...base.maps], changes: [] as RosterChange[] };

  /**
   * Para brawlers basta aparecerem no catálogo oficial e terem pelo menos uma
   * linha de dados num mapa qualquer — a API oficial é a autoridade sobre quem
   * existe, e uma linha já é suficiente para o brawler ser comparável.
   */
  const brawlers = input.brawlers
    ? evaluateSection("brawler", base.brawlers, input.brawlers, input.brawlerEvidence ?? [], 1, now)
    : { entries: [...base.brawlers], changes: [] as RosterChange[] };

  return {
    state: { maps: maps.entries, brawlers: brawlers.entries, evaluatedAt: now },
    changes: [...maps.changes, ...brawlers.changes],
  };
}

/** Entradas que já contam para recomendações. */
export function activeNames(entries: readonly RosterEntry[]) {
  return entries.filter((entry) => entry.status === "active" || entry.status === "leaving").map((entry) => entry.name);
}

/**
 * Entradas que devem ser recolhidas e mostradas, incluindo as que estão em
 * quarentena. Um mapa em quarentena continua a ser recolhido — é exatamente
 * assim que ganha os dados de que precisa para sair da quarentena.
 */
export function trackedNames(entries: readonly RosterEntry[]) {
  return entries.map((entry) => entry.name);
}

export function quarantinedEntries(entries: readonly RosterEntry[]) {
  return entries.filter((entry) => entry.status === "quarantine");
}

export function leavingEntries(entries: readonly RosterEntry[]) {
  return entries.filter((entry) => entry.status === "leaving");
}

/** Resumo curto para mostrar na interface. Devolve null quando não há novidades. */
export function describeRosterChanges(state: RosterState | null | undefined) {
  if (!state) return null;
  const novos = quarantinedEntries(state.maps).length + quarantinedEntries(state.brawlers).length;
  const aSair = leavingEntries(state.maps).length + leavingEntries(state.brawlers).length;
  if (!novos && !aSair) return null;

  const partes: string[] = [];
  if (novos) partes.push(`${novos} ${novos === 1 ? "novidade" : "novidades"} a recolher dados`);
  if (aSair) partes.push(`${aSair} a sair da rotação`);
  return partes.join(" · ");
}
