import { brawlCalculatorCounterData, type BrawlCalculatorCounterRelation } from "./brawlCalculatorCounterData";
import { brawlPlanetRelationData, type BrawlPlanetRelation } from "./brawlPlanetRelationData";
import { brawlScopeCounterData } from "./brawlScopeCounterData";
import { brawlScopeSynergyData, normalizeBrawlScopeSynergyList, type BrawlScopeSynergyEntry } from "./brawlScopeSynergyData";
import { plProdigyCounterData } from "./plProdigyCounterData";
import { getCounterSnapshotBrawlers, getSnapshotSynergies, normalizeCounterBrawlerName, type CounterSyncSnapshotPayload, type CounterSyncSourceKey } from "./counterSyncSnapshot";
import { normalizeBrawlScopeModeId } from "./brawlScopeModes";

export type CounterSourceName = "Brawl Calculator" | "BrawlScope" | "Brawl Planet" | "PL Prodigy";

export type SourcedCounterRelation = {
  brawler: string;
  reason?: string;
  delta?: number;
  source: CounterSourceName;
  sourceUrl: string;
};

export type CounterSourceProfile = {
  source: CounterSourceName;
  sourceUrl: string;
  modeId?: string;
  mode?: string;
  targets: SourcedCounterRelation[];
  counteredBy: SourcedCounterRelation[];
  bestTeammates: SourcedCounterRelation[];
  worstTeammates: SourcedCounterRelation[];
};

export type BrawlCalculatorMatchupTip = {
  attacker: string;
  defender: string;
  reason: string;
  source: "Brawl Calculator";
  sourceUrl: string;
  relationType?: "targets" | "counteredBy";
};

/**
 * O snapshot validado substitui as relações de counter. Por padrão, sem um
 * snapshot live ativo (inexistente ou ainda a ser aguardado), NENHUM catálogo
 * estático (BrawlScope/Calculator/Planet/PL Prodigy literais) alimenta o Draft
 * ou o perfil — `getCounterSourceProfiles` devolve `[]`. O fallback estático só
 * pode ser reativado explicitamente por chamadas de auditoria/teste offline via
 * `setCounterSyncSnapshot(snapshot, { allowOfflineFallback: true })`; nenhum
 * caminho de produção deve fazer essa chamada.
 */
let activeCounterSyncSnapshot: CounterSyncSnapshotPayload | undefined;
let offlineCounterFallbackEnabled = false;

export function setCounterSyncSnapshot(snapshot: CounterSyncSnapshotPayload | undefined, options?: { allowOfflineFallback?: boolean }) {
  activeCounterSyncSnapshot = snapshot;
  if (typeof options?.allowOfflineFallback === "boolean") offlineCounterFallbackEnabled = options.allowOfflineFallback;
  counterSourceProfilesCache.clear();
  resolvedCounterDirectionCache.clear();
  reciprocalCounterRelationCache.clear();
}

export function getActiveCounterSyncSnapshot() {
  return activeCounterSyncSnapshot;
}

function relationKey(value: string) {
  return normalizeCounterBrawlerName(value);
}

/**
 * Direções explicitamente rejeitadas após validação competitiva do utilizador.
 * O registo bruto da fonte é preservado para auditoria, mas não é exposto como
 * relação canónica nem pode alterar o Draft até existir confirmação publicada.
 */
const excludedCounterDirections = new Set(["glowy:bolt"]);

/**
 * Exportada de propósito: a exclusão tem de valer para TODAS as leituras do par,
 * não só para as listas. Antes era aplicada às relações do snapshot e do Brawl
 * Planet, mas não ao delta publicado — o Draft escondia o confronto da auditoria
 * e continuava a somar os seus pontos. A ficha dizia uma coisa e o Score fazia
 * outra, que é o pior dos dois mundos.
 */
export function isExcludedCounterDirection(attacker: string, defender: string) {
  return excludedCounterDirections.has(`${relationKey(attacker)}:${relationKey(defender)}`);
}

function findByBrawler<T extends object>(records: Record<string, T>, brawler: string): T | undefined {
  const requestedKey = relationKey(brawler);
  const recordKey = Object.keys(records).find((key) => relationKey(key) === requestedKey);
  if (recordKey) return records[recordKey];

  return Object.values(records).find((entry) => {
    if (!("brawler" in entry)) return false;
    const value = (entry as { brawler?: unknown }).brawler;
    return typeof value === "string" && relationKey(value) === requestedKey;
  });
}

function calculatorRelations(
  relations: BrawlCalculatorCounterRelation[],
  sourceUrl: string,
): SourcedCounterRelation[] {
  return relations.map((relation) => ({
    brawler: relation.brawler,
    reason: relation.reason || undefined,
    source: "Brawl Calculator",
    sourceUrl,
  }));
}

function planetRelations(
  relations: BrawlPlanetRelation[],
  sourceUrl: string,
  owner: string,
  direction: "targets" | "counteredBy",
): SourcedCounterRelation[] {
  return relations
    .filter((relation) => {
      const attacker = direction === "targets" ? owner : relation.brawler;
      const defender = direction === "targets" ? relation.brawler : owner;
      return !isExcludedCounterDirection(attacker, defender);
    })
    .map((relation) => ({
      brawler: relation.brawler,
      delta: relation.delta,
      source: "Brawl Planet",
      sourceUrl,
    }));
}

/**
 * O catálogo BrawlScope é agora gerado a partir da tabela completa de matchups da
 * própria fonte, com os dois sentidos já na orientação publicada. Deixou de existir
 * a troca histórica de Ruffs: todos os perfis, sem exceção, guardam em `counteredBy`
 * quem pune o titular e em `targets` quem o titular pune.
 */
function getBrawlScopeRelations(source: { targets: readonly string[]; counteredBy: readonly string[] }) {
  return { targets: [...source.targets], counteredBy: [...source.counteredBy] };
}

function sourceLabel(source: CounterSyncSourceKey): CounterSourceName {
  if (source === "brawlscope") return "BrawlScope";
  if (source === "calculator") return "Brawl Calculator";
  if (source === "planet") return "Brawl Planet";
  return "PL Prodigy";
}

function staticPLProdigyProfile(brawler: string): CounterSourceProfile | undefined {
  const prodigy = findByBrawler(plProdigyCounterData, brawler);
  if (!prodigy) return undefined;
  return {
    source: "PL Prodigy",
    sourceUrl: prodigy.sourceUrl,
    targets: prodigy.targets.map(target => ({ brawler: target, source: "PL Prodigy", sourceUrl: prodigy.sourceUrl })),
    counteredBy: prodigy.counteredBy.map(counter => ({ brawler: counter, source: "PL Prodigy", sourceUrl: prodigy.sourceUrl })),
    bestTeammates: [],
    worstTeammates: [],
  };
}

/**
 * Perfil literal do snapshot público PL Prodigy. Este acesso ignora de propósito
 * a snapshot dinâmica e as restantes fontes para auditoria das oito relações
 * `targets` e oito relações `counteredBy` por brawler. O resolvedor live usa a
 * snapshot partilhada de todas as fontes.
 */
export function getPLProdigyCounterProfile(brawler: string): CounterSourceProfile | undefined {
  return staticPLProdigyProfile(brawler);
}

/**
 * Direção literal na ficha do atacante. Não procura reciprocidade, não aplica
 * prioridades de fonte e não infere uma relação a partir da ficha do defensor.
 * Se a mesma ficha publicar ambos os sentidos para o mesmo par, o confronto fica
 * neutro para evitar inventar uma preferência que o snapshot não distingue.
 */
export function getPLProdigyCounterDirection(attacker: string, defender: string): "targets" | "counteredBy" | null {
  const attackerKey = relationKey(attacker);
  const defenderKey = relationKey(defender);
  if (!attackerKey || !defenderKey || attackerKey === defenderKey) return null;

  const profile = staticPLProdigyProfile(attacker);
  if (!profile) return null;
  const targets = profileHasRelation(profile.targets, defender);
  const counteredBy = profileHasRelation(profile.counteredBy, defender);
  if (targets === counteredBy) return null;
  return targets ? "targets" : "counteredBy";
}

/** Relação atacante → defensor literal, usada na auditoria Counter Top do Draft. */
export function getPLProdigyLiteralCounterRelations(attacker: string, defender: string): SourcedCounterRelation[] {
  const attackerKey = relationKey(attacker);
  const defenderKey = relationKey(defender);
  if (!attackerKey || !defenderKey || attackerKey === defenderKey) return [];

  const profile = staticPLProdigyProfile(attacker);
  if (!profile || !profileHasRelation(profile.targets, defender)) return [];
  return [{
    brawler: defender,
    source: "PL Prodigy",
    sourceUrl: profile.sourceUrl,
  }];
}

/**
 * Sinergia literal "Pair with" do BrawlScope, na ordem publicada. A snapshot
 * live tem prioridade; o catálogo estático só responde quando o fallback
 * offline está explicitamente ativo, tal como nos counters.
 */
export function getBrawlScopeSynergyTeammates(brawler: string, modeId?: string): SourcedCounterRelation[] {
  const normalizedModeId = normalizeBrawlScopeModeId(modeId);
  const synced = getSnapshotSynergies(activeCounterSyncSnapshot, brawler, "brawlscope", normalizedModeId);
  if (synced.length) {
    return synced.map((entry) => ({
      brawler: entry.teammate,
      delta: entry.delta,
      source: "BrawlScope" as const,
      sourceUrl: entry.sourceUrl,
    }));
  }

  // O catálogo geral só está disponível em modo offline explícito, sem snapshot.
  if (activeCounterSyncSnapshot || normalizedModeId || !offlineCounterFallbackEnabled) return [];
  const entry = findByBrawler<BrawlScopeSynergyEntry>(brawlScopeSynergyData, brawler);
  if (!entry) return [];
  return normalizeBrawlScopeSynergyList(entry.teammates, entry.brawler).map((teammate) => ({
    brawler: teammate.brawler,
    delta: teammate.delta,
    source: "BrawlScope" as const,
    sourceUrl: entry.sourceUrl,
  }));
}

/**
 * Sinergia literal do Brawl Planet, com o delta publicado, preferindo a snapshot
 * live. O catálogo estático só completa a lista de um perfil que a leitura live
 * já sustenta (`allowStatic`); nunca cria um perfil sozinho.
 */
function planetTeammates(brawler: string, allowStatic: boolean): SourcedCounterRelation[] {
  const synced = getSnapshotSynergies(activeCounterSyncSnapshot, brawler, "planet");
  if (synced.length) {
    return synced.map((entry) => ({
      brawler: entry.teammate,
      delta: entry.delta,
      source: "Brawl Planet" as const,
      sourceUrl: entry.sourceUrl,
    }));
  }
  return allowStatic ? staticPlanetTeams(brawler).bestTeammates : [];
}

function staticPlanetTeams(brawler: string) {
  const planet = findByBrawler(brawlPlanetRelationData, brawler);
  if (!planet) return { bestTeammates: [] as SourcedCounterRelation[], worstTeammates: [] as SourcedCounterRelation[] };
  return {
    bestTeammates: planetRelations(planet.bestTeammates, planet.sourceUrl, planet.brawler, "targets"),
    worstTeammates: planetRelations(planet.worstTeammates, planet.sourceUrl, planet.brawler, "targets"),
  };
}

function getSyncedCounterSourceProfiles(brawler: string, modeId?: string): CounterSourceProfile[] | undefined {
  const snapshot = activeCounterSyncSnapshot;
  if (!snapshot) return undefined;
  const owner = relationKey(brawler);
  const normalizedModeId = normalizeBrawlScopeModeId(modeId);
  const roster = getCounterSnapshotBrawlers(snapshot);
  const activeBrawlers = roster.length ? new Set(roster.map(relationKey)) : undefined;
  const grouped = new Map<CounterSyncSourceKey, { targets: SourcedCounterRelation[]; counteredBy: SourcedCounterRelation[]; sourceUrl: string }>();

  const modeSources = new Set(snapshot.relations
    .filter(r => relationKey(r.owner) === owner && normalizedModeId && normalizeBrawlScopeModeId(r.modeId) === normalizedModeId && !r.pendingRemoval)
    .map(r => r.source));
  const scopedRelations = normalizedModeId
    ? [...snapshot.relations].sort((a, b) => Number(Boolean(b.modeId)) - Number(Boolean(a.modeId)))
    : snapshot.relations;
  for (const relation of scopedRelations) {
    if (relation.source === "calculator") continue;
    if (relationKey(relation.owner) !== owner) continue;
    if (relation.pendingRemoval || isExcludedCounterDirection(relation.attacker, relation.defender)) continue;
    // Geral só lê Geral. Uma ficha de modo existente não é completada com listas gerais.
    const wantedMode = normalizedModeId && modeSources.has(relation.source) ? normalizedModeId : undefined;
    if ((relation.modeId ? normalizeBrawlScopeModeId(relation.modeId) : undefined) !== wantedMode) continue;
    const relatedBrawler = relation.direction === "targets" ? relation.defender : relation.attacker;
    if (activeBrawlers && (!activeBrawlers.has(owner) || !activeBrawlers.has(relationKey(relatedBrawler)))) continue;
    const group = grouped.get(relation.source) ?? { targets: [], counteredBy: [], sourceUrl: relation.sourceUrl };
    const item: SourcedCounterRelation = {
      brawler: relation.direction === "targets" ? relation.defender : relation.attacker,
      reason: relation.reason,
      delta: relation.delta,
      source: sourceLabel(relation.source),
      sourceUrl: relation.sourceUrl,
    };
    const direction = relation.direction === "targets" ? group.targets : group.counteredBy;
    if (!direction.some(existing => relationKey(existing.brawler) === relationKey(item.brawler))) direction.push(item);
    grouped.set(relation.source, group);
  }

  const profiles = (["brawlscope", "planet", "prodigy"] as CounterSyncSourceKey[])
    .map((source): CounterSourceProfile | undefined => {
      const group = grouped.get(source);
      const teams = source === "planet"
        ? {
            bestTeammates: planetTeammates(brawler, Boolean(group)),
            worstTeammates: group ? staticPlanetTeams(brawler).worstTeammates : [],
          }
        : source === "brawlscope"
          ? { bestTeammates: getBrawlScopeSynergyTeammates(brawler, normalizedModeId), worstTeammates: [] as SourcedCounterRelation[] }
          : { bestTeammates: [] as SourcedCounterRelation[], worstTeammates: [] as SourcedCounterRelation[] };
      // Uma fonte que publicou apenas sinergia continua a ter perfil: as duas
      // leituras são independentes e a ausência de counters não pode apagar a
      // lista de aliados que a mesma página expõe.
      if (!group && !teams.bestTeammates.length) return undefined;
      return {
        source: sourceLabel(source),
        sourceUrl: group?.sourceUrl ?? teams.bestTeammates[0]?.sourceUrl ?? "",
        modeId: normalizedModeId && modeSources.has(source) ? normalizedModeId : undefined,
        targets: group?.targets ?? [],
        counteredBy: group?.counteredBy ?? [],
        bestTeammates: teams.bestTeammates,
        worstTeammates: teams.worstTeammates,
      } satisfies CounterSourceProfile;
    })
    .filter((profile): profile is CounterSourceProfile => Boolean(profile));

  return profiles;
}

export function getCounterSourceProfiles(brawler: string, modeId?: string): CounterSourceProfile[] {
  const cacheKey = `${relationKey(brawler)}:${normalizeBrawlScopeModeId(modeId) ?? "global"}`;
  const cached = counterSourceProfilesCache.get(cacheKey);
  if (cached) return cached;

  if (!activeCounterSyncSnapshot && !offlineCounterFallbackEnabled) {
    counterSourceProfilesCache.set(cacheKey, []);
    return [];
  }

  const syncedProfiles = getSyncedCounterSourceProfiles(brawler, modeId);
  if (syncedProfiles) {
    counterSourceProfilesCache.set(cacheKey, syncedProfiles);
    return syncedProfiles;
  }

  const profiles: CounterSourceProfile[] = [];

  const brawlScope = findByBrawler(brawlScopeCounterData, brawler);
  if (brawlScope) {
    const { targets: brawlScopeTargets, counteredBy: brawlScopeCounteredBy } = getBrawlScopeRelations(brawlScope);

    profiles.push({
      source: "BrawlScope",
      sourceUrl: brawlScope.sourceUrl,
      modeId,
      targets: brawlScopeTargets.map((target) => ({
        brawler: target,
        source: "BrawlScope",
        sourceUrl: brawlScope.sourceUrl,
      })),
      counteredBy: brawlScopeCounteredBy.map((counter) => ({
        brawler: counter,
        source: "BrawlScope",
        sourceUrl: brawlScope.sourceUrl,
      })),
      bestTeammates: getBrawlScopeSynergyTeammates(brawler, modeId),
      worstTeammates: [],
    });
  }

  const planet = findByBrawler(brawlPlanetRelationData, brawler);
  if (planet) {
    profiles.push({
      source: "Brawl Planet",
      sourceUrl: planet.sourceUrl,
      targets: planetRelations(planet.strongAgainst, planet.sourceUrl, planet.brawler, "targets"),
      counteredBy: planetRelations(planet.strugglesAgainst, planet.sourceUrl, planet.brawler, "counteredBy"),
      bestTeammates: planetRelations(planet.bestTeammates, planet.sourceUrl, planet.brawler, "targets"),
      worstTeammates: planetRelations(planet.worstTeammates, planet.sourceUrl, planet.brawler, "targets"),
    });
  }

  const prodigy = staticPLProdigyProfile(brawler);
  if (prodigy) profiles.push(prodigy);

  counterSourceProfilesCache.set(cacheKey, profiles);
  return profiles;
}

const draftSourcePriority: Record<Exclude<CounterSourceName, "Brawl Calculator">, number> = {
  "BrawlScope": 0,
  "Brawl Planet": 1,
  "PL Prodigy": 2,
};

const orderedDraftCounterSources = (Object.keys(draftSourcePriority) as Array<Exclude<CounterSourceName, "Brawl Calculator">>)
  .sort((left, right) => draftSourcePriority[left] - draftSourcePriority[right]);

export type ResolvedCounterDirection = {
  direction: "targets" | "counteredBy";
  source: CounterSourceName;
  sourceUrls: string[];
};

/**
 * Evidência de que a fonte prioritária disponível publicou ambos os sentidos
 * do mesmo par. O Draft pode desempatar este caso com o Score contextual, mas
 * nunca altera uma direção única já publicada pelo BrawlScope.
 */
export type ReciprocalCounterRelation = {
  pairKey: string;
  source: CounterSourceName;
  sourceUrls: string[];
};

/**
 * Os catálogos de counter são imutáveis no runtime. Pick e ban consultam os
 * mesmos perfis e pares repetidamente, por isso estes caches eliminam pesquisas
 * e cópias redundantes sem guardar contexto de mapa, equipa ou score.
 */
const counterSourceProfilesCache = new Map<string, CounterSourceProfile[]>();
const resolvedCounterDirectionCache = new Map<string, ResolvedCounterDirection | null>();
const reciprocalCounterRelationCache = new Map<string, ReciprocalCounterRelation | null>();

function resolvedDirectionCacheKey(attacker: string, defender: string) {
  return `${relationKey(attacker)}:${relationKey(defender)}`;
}

/** Chave estável e independente da direção para um par potencialmente recíproco. */
export function getReciprocalCounterPairKey(left: string, right: string) {
  return [relationKey(left), relationKey(right)].sort().join("::");
}

type SourceDirection = "targets" | "counteredBy" | "conflict" | null;

function profileForSource(profiles: CounterSourceProfile[], source: CounterSourceName) {
  return profiles.find((profile) => profile.source === source);
}

function profileHasRelation(relations: SourcedCounterRelation[], brawler: string) {
  const key = relationKey(brawler);
  return relations.some((relation) => relationKey(relation.brawler) === key);
}

function directionInSource(
  attacker: string,
  defender: string,
  attackerProfile: CounterSourceProfile | undefined,
  defenderProfile: CounterSourceProfile | undefined,
): SourceDirection {
  const attackerTargetsDefender = attackerProfile ? profileHasRelation(attackerProfile.targets, defender) : false;
  const attackerCounteredByDefender = attackerProfile ? profileHasRelation(attackerProfile.counteredBy, defender) : false;
  const defenderCounteredByAttacker = defenderProfile ? profileHasRelation(defenderProfile.counteredBy, attacker) : false;
  const defenderTargetsAttacker = defenderProfile ? profileHasRelation(defenderProfile.targets, attacker) : false;
  const targets = attackerTargetsDefender || defenderCounteredByAttacker;
  const counteredBy = attackerCounteredByDefender || defenderTargetsAttacker;

  if (targets && counteredBy) return "conflict";
  if (targets) return "targets";
  if (counteredBy) return "counteredBy";
  return null;
}

function resolvedDirection(
  source: CounterSourceName,
  direction: Exclude<SourceDirection, "conflict" | null>,
  attackerProfile: CounterSourceProfile | undefined,
  defenderProfile: CounterSourceProfile | undefined,
): ResolvedCounterDirection {
  return {
    direction,
    source,
    sourceUrls: Array.from(new Set([
      ...(attackerProfile ? [attackerProfile.sourceUrl] : []),
      ...(defenderProfile ? [defenderProfile.sourceUrl] : []),
    ])),
  };
}

/**
 * Resolve a direção canónica de um confronto para o Draft. A decisão é feita
 * uma única vez por par. Relações repetidas na mesma direção nunca acumulam
 * pontos. Quando fontes divergem, apenas o BrawlScope pode decidir a direção;
 * se o BrawlScope não publicar uma direção única, o confronto é neutro.
 * São aceites as duas representações equivalentes da mesma direção (A.targets B
 * e B.counteredBy A). Se a própria fonte publicar as duas direções para o par,
 * o confronto fica ambíguo e não altera o score.
 */
export function resolveCounterDirectionFromProfiles(
  attacker: string,
  defender: string,
  attackerProfiles: CounterSourceProfile[],
  defenderProfiles: CounterSourceProfile[],
): ResolvedCounterDirection | null {
  const attackerKey = relationKey(attacker);
  const defenderKey = relationKey(defender);
  if (!attackerKey || !defenderKey || attackerKey === defenderKey) return null;

  const evidence = orderedDraftCounterSources.map((source) => {
    const attackerProfile = profileForSource(attackerProfiles, source);
    const defenderProfile = profileForSource(defenderProfiles, source);
    return {
      source,
      attackerProfile,
      defenderProfile,
      direction: directionInSource(attacker, defender, attackerProfile, defenderProfile),
    };
  });

  // A direção publicada pela fonte de maior prioridade disponível decide o
  // matchup: BrawlScope → Brawl Planet → PL Prodigy. Um desacordo de
  // uma fonte inferior não pode eliminar uma relação literal de uma fonte
  // superior; apenas um conflito publicado pela própria fonte permanece
  // neutro, por não existir uma direção auditável nessa fonte.
  for (const entry of evidence) {
    if (entry.direction === null) continue;
    if (entry.direction === "conflict") return null;
    return resolvedDirection(entry.source, entry.direction, entry.attackerProfile, entry.defenderProfile);
  }

  return null;
}

export function getResolvedCounterDirection(attacker: string, defender: string, modeId?: string): ResolvedCounterDirection | null {
  /**
   * A rejeição vale nos dois sentidos. Só a excluir num deles, o par ficava
   * incoerente: Glowy não ganhava nada contra Bolt, mas Bolt continuava a perder
   * pontos contra Glowy pelo mesmo confronto que o projeto decidiu não
   * reconhecer. Sem direção estabelecida, o par é neutro para ambos — o registo
   * bruto de cada fonte fica na mesma visível na ficha, para auditoria.
   */
  if (isExcludedCounterDirection(attacker, defender) || isExcludedCounterDirection(defender, attacker)) {
    return null;
  }

  const cacheKey = `${modeId ?? "global"}:${resolvedDirectionCacheKey(attacker, defender)}`;
  if (resolvedCounterDirectionCache.has(cacheKey)) {
    return resolvedCounterDirectionCache.get(cacheKey) ?? null;
  }

  const resolved = resolveCounterDirectionFromProfiles(
    attacker,
    defender,
    getCounterSourceProfiles(attacker, modeId),
    getCounterSourceProfiles(defender, modeId),
  );
  resolvedCounterDirectionCache.set(cacheKey, resolved);
  return resolved;
}

/** Direção publicada por uma fonte autorizada, sem consultar o Calculator. */
export function getCounterSourceDirection(
  attacker: string,
  defender: string,
  source: Exclude<CounterSourceName, "Brawl Calculator">,
  modeId?: string,
): Exclude<SourceDirection, "conflict"> {
  const direction = directionInSource(
    attacker,
    defender,
    profileForSource(getCounterSourceProfiles(attacker, modeId), source),
    profileForSource(getCounterSourceProfiles(defender, modeId), source),
  );
  return direction === "conflict" ? null : direction;
}

/**
 * Devolve uma relação apenas quando a primeira fonte que publica o par o faz
 * nos dois sentidos. Se existir direção única em BrawlScope, Brawl Calculator
 * ou Brawl Planet, ela continua a ser resolvida exclusivamente por
 * `getResolvedCounterDirection` e não entra no desempate contextual.
 */
export function getReciprocalCounterRelation(attacker: string, defender: string, modeId?: string): ReciprocalCounterRelation | null {
  const attackerKey = relationKey(attacker);
  const defenderKey = relationKey(defender);
  if (!attackerKey || !defenderKey || attackerKey === defenderKey) return null;

  const pairKey = `${modeId ?? "global"}:${getReciprocalCounterPairKey(attacker, defender)}`;
  if (reciprocalCounterRelationCache.has(pairKey)) {
    return reciprocalCounterRelationCache.get(pairKey) ?? null;
  }

  const attackerProfiles = getCounterSourceProfiles(attacker, modeId);
  const defenderProfiles = getCounterSourceProfiles(defender, modeId);
  let reciprocal: ReciprocalCounterRelation | null = null;

  for (const source of orderedDraftCounterSources) {
    const attackerProfile = profileForSource(attackerProfiles, source);
    const defenderProfile = profileForSource(defenderProfiles, source);
    const direction = directionInSource(attacker, defender, attackerProfile, defenderProfile);
    if (direction === null) continue;
    if (direction === "conflict") {
      reciprocal = {
        pairKey,
        source,
        sourceUrls: Array.from(new Set([
          ...(attackerProfile ? [attackerProfile.sourceUrl] : []),
          ...(defenderProfile ? [defenderProfile.sourceUrl] : []),
        ])),
      };
    }
    // A primeira fonte que menciona o par decide se ele é único ou recíproco.
    break;
  }

  reciprocalCounterRelationCache.set(pairKey, reciprocal);
  return reciprocal;
}

/**
 * Devolve a relação direta publicada pela primeira fonte que menciona o par.
 * Ao contrário de `getResolvedCounterDirection`, esta função não suprime uma
 * direção literal só porque a mesma fonte também publica o sentido oposto.
 * Isso é essencial para a auditoria de Counter Top: cada counter publicado na
 * janela ativa deve ser contabilizado. O desempate por Score de pares recíprocos
 * continua exclusivamente em `getDraftCounterDirection` / `getCounterMatchup`.
 */
export function getLiteralCounterRelations(attacker: string, defender: string, modeId?: string): SourcedCounterRelation[] {
  const attackerKey = relationKey(attacker);
  const defenderKey = relationKey(defender);
  if (!attackerKey || !defenderKey || attackerKey === defenderKey || isExcludedCounterDirection(attacker, defender)) {
    return [];
  }

  const attackerProfiles = getCounterSourceProfiles(attacker, modeId);
  const defenderProfiles = getCounterSourceProfiles(defender, modeId);

  for (const source of orderedDraftCounterSources) {
    const attackerProfile = profileForSource(attackerProfiles, source);
    const defenderProfile = profileForSource(defenderProfiles, source);
    const attackerTargetsDefender = attackerProfile ? profileHasRelation(attackerProfile.targets, defender) : false;
    const attackerCounteredByDefender = attackerProfile ? profileHasRelation(attackerProfile.counteredBy, defender) : false;
    const defenderCounteredByAttacker = defenderProfile ? profileHasRelation(defenderProfile.counteredBy, attacker) : false;
    const defenderTargetsAttacker = defenderProfile ? profileHasRelation(defenderProfile.targets, attacker) : false;
    const sourceMentionsPair = attackerTargetsDefender
      || attackerCounteredByDefender
      || defenderCounteredByAttacker
      || defenderTargetsAttacker;

    if (!sourceMentionsPair) continue;
    if (!attackerTargetsDefender && !defenderCounteredByAttacker) return [];

    return [{
      brawler: defender,
      source,
      sourceUrl: Array.from(new Set([
        ...(attackerProfile ? [attackerProfile.sourceUrl] : []),
        ...(defenderProfile ? [defenderProfile.sourceUrl] : []),
      ])).join(" · "),
    }];
  }

  return [];
}

/** Dicas táticas literais do Brawl Calculator para a direção atacante → defensor. */
export function getBrawlCalculatorTips(attacker: string, defender: string): BrawlCalculatorMatchupTip[] {
  const attackerKey = relationKey(attacker);
  const defenderKey = relationKey(defender);
  const tips: BrawlCalculatorMatchupTip[] = [];
  const attackerProfile = findByBrawler(brawlCalculatorCounterData, attacker);
  const defenderProfile = findByBrawler(brawlCalculatorCounterData, defender);

  attackerProfile?.targets
    .filter((relation) => relationKey(relation.brawler) === defenderKey && relation.reason.trim())
    .forEach((relation) => tips.push({
      attacker,
      defender,
      reason: relation.reason.trim(),
      source: "Brawl Calculator",
      sourceUrl: attackerProfile.sourceUrl,
      relationType: "targets",
    }));

  defenderProfile?.counteredBy
    .filter((relation) => relationKey(relation.brawler) === attackerKey && relation.reason.trim())
    .forEach((relation) => tips.push({
      attacker,
      defender,
      reason: relation.reason.trim(),
      source: "Brawl Calculator",
      sourceUrl: defenderProfile.sourceUrl,
      relationType: "counteredBy",
    }));

  const seen = new Set<string>();
  return tips.filter((tip) => {
    const key = `${relationKey(tip.reason)}:${tip.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Devolve todas as explicações táticas literais publicadas para um brawler.
 * É usado apenas como fallback editorial quando a combinação exata escolhida
 * no Draft/Matriz não possui uma relação direta no Brawl Calculator.
 */
export function getBrawlCalculatorTipsForBrawler(brawler: string): BrawlCalculatorMatchupTip[] {
  const profile = findByBrawler(brawlCalculatorCounterData, brawler);
  if (!profile) return [];

  const tips: BrawlCalculatorMatchupTip[] = [
    ...profile.targets
      .filter((relation) => relation.reason.trim())
      .map((relation) => ({
        attacker: profile.brawler,
        defender: relation.brawler,
        reason: relation.reason.trim(),
        source: "Brawl Calculator" as const,
        sourceUrl: profile.sourceUrl,
        relationType: "targets" as const,
      })),
    ...profile.counteredBy
      .filter((relation) => relation.reason.trim())
      .map((relation) => ({
        attacker: relation.brawler,
        defender: profile.brawler,
        reason: relation.reason.trim(),
        source: "Brawl Calculator" as const,
        sourceUrl: profile.sourceUrl,
        relationType: "counteredBy" as const,
      })),
  ];

  const seen = new Set<string>();
  return tips.filter((tip) => {
    const key = `${relationKey(tip.attacker)}:${relationKey(tip.defender)}:${relationKey(tip.reason)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
