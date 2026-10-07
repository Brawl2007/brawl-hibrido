import { versaoDoMotor } from "./versaoDoMotor";
import { lerContextoDoMotor, partesAtivasDoPL, pontuarComMotor, type ComponentesDoCandidato, type ConfigDoMotor, type ContextoDoMotor, type MotorDoDraft } from "./motoresDoDraft";
import { getDraftRoleOverride } from "./draftRoleOverrides";
import { getMatchupValue, describeMatchupValue, getBrawlScopeReading, definirLeituraDasDuasFichas, fonteObservadaAtiva, sinergiaObservada, vitoriaObservadaNoMapa } from "./counterMatchupValue";
import { normalizeCounterBrawlerName } from "./counterSyncSnapshot";
export type DraftTeam = "blue" | "red";
import { getMainAttackRange } from "./brawlerAttackRanges";
import {
  getCounterSourceProfiles,
  getLiteralCounterRelations,
  getReciprocalCounterRelation,
  getResolvedCounterDirection,
  isExcludedCounterDirection,
  type CounterSourceName,
  type SourcedCounterRelation,
} from "./counterSourceRelations";
import { brawlScopeCounterData } from "./brawlScopeCounterData";
import { brawlScopeMatchupDeltas } from "./brawlScopeMatchupDeltas.generated";
import {
  findBrawlPlanetMapTeam,
  getBrawlPlanetMapTeamsForBrawler,
  type BrawlPlanetMapTeam,
  type BrawlPlanetMapTeamEntry,
} from "./brawlPlanetMapTeams";
import { defaultDraftRuleSettings, getCounterPickMultiplier, regrasDoMotor, type DraftRuleSettings } from "./draftRules";

export type DraftKind = "ban" | "pick";
export type DraftStep = { kind: DraftKind; team: DraftTeam; label: string };
export type DraftTier = "Todos" | "S" | "A" | "B";
export type DraftRole = "side" | "mid" | "flex";
export type DraftRoleFilter = "Todas" | DraftRole;
export type ScrimPreset = "standard" | "fast" | "custom";

export const scrimPresetLabels: Record<ScrimPreset, string> = {
  standard: "Competitivo padrão",
  fast: "Rápido · 2 bans",
  custom: "Customizado",
};

export const draftRoleLabels: Record<DraftRoleFilter, string> = {
  Todas: "Todas as funções",
  side: "Lane",
  mid: "Mid",
  flex: "Flex",
};

/** Bónus aplicados exclusivamente quando a respetiva condição é satisfeita. */
export const draftSignalBonuses = {
  counter: defaultDraftRuleSettings.counterPick1,
  missingMid: defaultDraftRuleSettings.missingMid,
  missingSide: defaultDraftRuleSettings.missingSide,
  /** Taxa máxima do bónus de counter banido, aplicada no primeiro pick. */
  bannedCounter: defaultDraftRuleSettings.banPick1,
  openingLongRange: defaultDraftRuleSettings.openingLongRange,
  /** Taxa de sinergia do primeiro Pick; cada Pick tem uma taxa configurável própria. */
  synergy: defaultDraftRuleSettings.synergyPick1,
  /** Composição literal publicada do Brawl Planet usa a mesma taxa de sinergia do Pick. */
  mapTeamSynergy: defaultDraftRuleSettings.synergyPick1,
  enemyCounterPenalty: defaultDraftRuleSettings.enemyCounterPenalty,
  /** Pressão adicional por aliado já counterado pelo mesmo inimigo, limitada a dois aliados. */
  repeatedEnemyCounterPressure: defaultDraftRuleSettings.repeatedEnemyCounterPressure,
  /** Penalização por cada counter literal do candidato que está no Top 20 contextual. */
  topTwentyCounterPenalty: defaultDraftRuleSettings.topCounterPenalty,
  sameClassPenalty: defaultDraftRuleSettings.sameClassPenalty,
  worstTeammatePenalty: defaultDraftRuleSettings.worstTeammatePenalty,
} as const;

/** Bónus por cada counter direto banido, indexado pelo pick ativo do Draft. */
export const bannedCounterBonusRatesByPick = [
  defaultDraftRuleSettings.banPick1,
  defaultDraftRuleSettings.banPick2,
  defaultDraftRuleSettings.banPick3,
  defaultDraftRuleSettings.banPick4,
  defaultDraftRuleSettings.banPick5Plus,
] as const;

/** Escala de Counter direto por pick, sempre derivada da matriz configurável oficial. */
export const counterBonusRatesByPick = {
  1: defaultDraftRuleSettings.counterPick1,
  2: defaultDraftRuleSettings.counterPick2,
  3: defaultDraftRuleSettings.counterPick3,
  4: defaultDraftRuleSettings.counterPick4,
  5: defaultDraftRuleSettings.counterPick5,
  6: defaultDraftRuleSettings.counterPick6,
} as const;

/** Todos os Picks têm uma taxa de sinergia individual configurável. */
export const synergyBonusPicks = [1, 2, 3, 4, 5, 6] as const;

export function getDraftPickNumber(pickNumber?: number) {
  const requestedPick = typeof pickNumber === "number" && Number.isFinite(pickNumber)
    ? Math.floor(pickNumber)
    : 1;
  return Math.max(requestedPick, 1);
}

/** Janela contextual de counters: reduz quatro posições depois de cada pick concluído. */
export const topCounterWindowSizesByCompletedPickCount = {
  0: 20,
  1: 16,
  2: 12,
  3: 8,
  4: 4,
  5: 0,
  6: 0,
} as const;

export function getTopCounterWindowSize(pickNumber?: number, completedPickCount?: number) {
  const completedPicks = typeof completedPickCount === "number" && Number.isFinite(completedPickCount)
    ? Math.max(0, Math.floor(completedPickCount))
    : Math.max(getDraftPickNumber(pickNumber) - 1, 0);
  return topCounterWindowSizesByCompletedPickCount[completedPicks as keyof typeof topCounterWindowSizesByCompletedPickCount] ?? 0;
}

/**
 * Normaliza a lista que representa a janela contextual num único ponto do motor.
 * A chamada é deliberadamente defensiva: uma lista recebida de outra superfície
 * nunca pode reativar uma posição acima do limite do pick atual.
 */
export function getActiveCounterWindowNames(topRecommendationNames: Iterable<string> | undefined, windowSize: number) {
  if (windowSize <= 0 || !topRecommendationNames) return [];
  return Array.from(topRecommendationNames)
    .slice(0, windowSize)
    .filter((name) => counterKey(name).length > 0);
}

/**
 * Um candidato não escolhido só pode receber desbónus de counter se pertencer à
 * janela Top contextual que está ativa neste exato pick.
 */
export function isInActiveCounterWindow(candidateName: string, topRecommendationNames: Iterable<string> | undefined, windowSize: number) {
  const candidateKey = counterKey(candidateName);
  return Boolean(candidateKey) && getActiveCounterWindowNames(topRecommendationNames, windowSize)
    .some((name) => counterKey(name) === candidateKey);
}

export function getCounterBonusRate(pickNumber?: number, ruleSettings?: Partial<DraftRuleSettings>) {
  const rules = regrasDoMotor(ruleSettings);
  const pick = getDraftPickNumber(pickNumber);
  const rates: Record<number, number> = {
    1: rules.counterPick1,
    2: rules.counterPick2,
    3: rules.counterPick3,
    4: rules.counterPick4,
    5: rules.counterPick5,
    6: rules.counterPick6,
  };
  return rates[pick] ?? rules.counterPick1;
}

export function getSynergyBonusRate(pickNumber?: number, ruleSettings?: Partial<DraftRuleSettings>) {
  const rules = regrasDoMotor(ruleSettings);
  const pick = getDraftPickNumber(pickNumber);
  const rates: Record<number, number> = {
    1: rules.synergyPick1,
    2: rules.synergyPick2,
    3: rules.synergyPick3,
    4: rules.synergyPick4,
    5: rules.synergyPick5,
    6: rules.synergyPick6,
  };
  return rates[pick] ?? rules.synergyPick1;
}

export function getMapTeamSynergyRate(pickNumber?: number, ruleSettings?: Partial<DraftRuleSettings>) {
  return getSynergyBonusRate(pickNumber, ruleSettings);
}

export function getBannedCounterBonusRate(pickNumber?: number, ruleSettings?: Partial<DraftRuleSettings>) {
  const rules = regrasDoMotor(ruleSettings);
  const requestedPick = typeof pickNumber === "number" && Number.isFinite(pickNumber)
    ? Math.floor(pickNumber)
    : 1;
  const pick = Math.min(Math.max(requestedPick, 1), bannedCounterBonusRatesByPick.length);
  const rates: Record<number, number> = {
    1: rules.banPick1,
    2: rules.banPick2,
    3: rules.banPick3,
    4: rules.banPick4,
    5: rules.banPick5Plus,
  };
  return rates[pick];
}

export function getBannedCounterBonusPick(pickNumber?: number) {
  const requestedPick = typeof pickNumber === "number" && Number.isFinite(pickNumber)
    ? Math.floor(pickNumber)
    : 1;
  return Math.min(Math.max(requestedPick, 1), bannedCounterBonusRatesByPick.length);
}

/**
 * O limite contextual foi retirado.
 *
 * POR QUE ISTO ESTÁ AQUI ESCRITO E NÃO LÁ EM CIMA EM CÓDIGO
 *
 * Havia um tecto por estado de Draft — +4% na abertura, +12% na resposta
 * inicial, +16% a meio, +20% no fecho, com tectos próprios para os desbónus —
 * aplicado sobre a Base híbrida. A ideia era o mapa continuar a mandar enquanto
 * o tabuleiro estivesse vazio.
 *
 * O efeito prático era outro: as regras que se afinam no painel do Draft
 * deixavam de valer o que dizem. Punha-se um bónus de Counter a +8%, viam-se os
 * fatores somados no cartão, e o Score subia menos do que a soma — cortado por
 * um tecto que não está em lado nenhum desse painel. Dois candidatos com
 * fatores muito diferentes podiam encostar ao mesmo tecto e empatar.
 *
 * Agora o ajuste contextual é exatamente a soma dos fatores ativos: o que o
 * cartão mostra é o que entra no Score.
 */

/** Sete classes oficiais, na terminologia apresentada pelo Draft em português. */
export const officialBrawlerClasses = [
  "Destruidor", "Tank", "Artilheiro", "Lançador", "Assassino", "Controlador", "Suporte",
] as const;

/** Mapeamento único das sete classes oficiais para o desbónus de -5% por repetição no mesmo time. */
export const brawlerClassCatalog: Record<string, string> = {
  "8-bit": "Destruidor", "Alli": "Assassino", "Amber": "Controlador", "Angelo": "Artilheiro", "Ash": "Tank",
  "Barley": "Lançador", "Bea": "Artilheiro", "Belle": "Artilheiro", "Berry": "Suporte", "Bibi": "Tank",
  "Bo": "Controlador", "Bolt": "Tank", "Bonnie": "Artilheiro", "Brock": "Artilheiro", "Bull": "Tank",
  "Buster": "Tank", "Buzz": "Assassino", "Byron": "Suporte", "Carl": "Destruidor", "Charlie": "Controlador",
  "Chester": "Destruidor", "Chuck": "Controlador", "Clancy": "Destruidor", "Colette": "Destruidor", "Colt": "Destruidor",
  "Cordelius": "Assassino", "Crow": "Assassino", "Damian": "Tank", "Darryl": "Tank", "Doug": "Suporte",
  "Draco": "Tank", "Dynamike": "Lançador", "Edgar": "Assassino", "El Primo": "Tank", "Emz": "Controlador",
  "Eve": "Destruidor", "Fang": "Assassino", "Finx": "Controlador", "Frank": "Tank", "Gale": "Controlador",
  "Gene": "Controlador", "Gigi": "Assassino", "Glowy": "Suporte", "Gray": "Suporte", "Griff": "Controlador",
  "Grom": "Lançador", "Gus": "Suporte", "Hank": "Tank", "Jacky": "Tank", "Jae-yong": "Suporte",
  "Janet": "Artilheiro", "Jessie": "Controlador", "Juju": "Lançador", "Kaze": "Assassino", "Kenji": "Assassino",
  "Kit": "Suporte", "Larry & Lawrie": "Lançador", "Leon": "Assassino", "Lily": "Assassino", "Lola": "Destruidor",
  "Lou": "Controlador", "Lumi": "Destruidor", "Maisie": "Artilheiro", "Mandy": "Artilheiro", "Max": "Suporte",
  "Meeple": "Controlador", "Meg": "Tank", "Melodie": "Assassino", "Mico": "Assassino", "Mina": "Destruidor",
  "Moe": "Destruidor", "Mortis": "Assassino", "Mr. P": "Controlador", "Najia": "Destruidor", "Nani": "Artilheiro",
  "Nita": "Destruidor", "Nori": "Assassino", "Ollie": "Tank", "Otis": "Controlador", "Pam": "Suporte",
  "Pearl": "Destruidor", "Penny": "Controlador", "Pierce": "Artilheiro", "Piper": "Artilheiro", "Poco": "Suporte",
  "R-T": "Destruidor", "Rico": "Destruidor", "Rosa": "Tank", "Ruffs": "Suporte", "Sam": "Tank",
  "Sandy": "Controlador", "Shade": "Assassino", "Shelly": "Destruidor", "Sirius": "Controlador", "Spike": "Destruidor",
  "Sprout": "Lançador", "Squeak": "Controlador", "Starr Nova": "Assassino", "Stu": "Assassino", "Surge": "Destruidor",
  "Tara": "Destruidor", "Tick": "Lançador", "Trunk": "Tank", "Wendy": "Suporte", "Willow": "Controlador", "Ziggy": "Controlador"
};

/**
 * Guardada por nome. Percorria o catálogo inteiro e passava CADA chave a
 * minúsculas em cada chamada — centenas de chamadas por pick, para uma
 * resposta que, para o mesmo nome, é sempre a mesma: o catálogo e a lista de
 * lançadores são constantes do módulo.
 */
const classesGuardadas = new Map<string, string>();
export function getBrawlerClass(brawlerName: string): string {
  const guardada = classesGuardadas.get(brawlerName);
  if (guardada !== undefined) return guardada;
  const classe = calcularClasseDoBrawler(brawlerName);
  if (classesGuardadas.size > 4000) classesGuardadas.clear();
  classesGuardadas.set(brawlerName, classe);
  return classe;
}

/** O cálculo sem cache. Exportado só para o teste que o compara com a cache. */
export function calcularClasseDoBrawler(brawlerName: string): string {
  const clean = brawlerName.trim().toLowerCase();
  for (const [key, cls] of Object.entries(brawlerClassCatalog)) {
    if (key.toLowerCase() === clean) return cls;
  }
  if (isArtilleryBrawler(brawlerName)) return "Lançador";
  return "Flex";
}

export const openingRangeThreshold = 6;
const openingBonusIncludedNames = new Map([
  ["gene", "Eugenio"],
  ["angelo", "Angelo"],
  ["charlie", "Charlie"],
  ["najia", "Najia"],
  ["janet", "Janet"],
]);
const openingBonusExcludedNames = new Set([
  "ziggy",
  "berry",
  "darryl",
  "frank",
  "ollie",
  "kit",
  "buster",
  "nori",
]);

/** Lançadores/Artillery oficiais: estes brawlers não recebem o bónus de abertura. */
const artilleryBrawlerKeys = new Set([
  "Barley",
  "Dynamike",
  "Grom",
  "Juju",
  "Larry & Lawrie",
  "Sprout",
  "Tick",
].map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "")));

export function isArtilleryBrawler(brawlerName: string) {
  return artilleryBrawlerKeys.has(brawlerName.toLowerCase().replace(/[^a-z0-9]+/g, ""));
}

export function isOpeningLongRangeEligible(brawlerName: string) {
  const normalizedName = counterKey(brawlerName);
  if (openingBonusExcludedNames.has(normalizedName)) return false;
  if (openingBonusIncludedNames.has(normalizedName)) return true;
  const mainAttackRange = getMainAttackRange(brawlerName);
  const passesRangeThreshold = mainAttackRange !== null && mainAttackRange >= openingRangeThreshold;
  return passesRangeThreshold && !isArtilleryBrawler(brawlerName);
}

export function getOpeningBonusEligibilityLabel(brawlerName: string) {
  return openingBonusIncludedNames.get(counterKey(brawlerName)) ?? `≥${openingRangeThreshold} blocos`;
}

const teamLabel = (team: DraftTeam) => team === "blue" ? "Azul" : "Vermelha";
const stepLabel = (kind: DraftKind) => kind === "ban" ? "Ban" : "Pick";

// Competitivo: equipa inicial escolhe 1, oponente 2, equipa inicial 2 e oponente fecha 1.
// O padrão é resolvido contra initialTeam e, por isso, espelha automaticamente quando Vermelha abre.
export const competitivePickPattern = ["initial", "opponent", "opponent", "initial", "initial", "opponent"] as const;

export function buildScrimSequence(preset: Exclude<ScrimPreset, "custom">, initialTeam: DraftTeam): DraftStep[] {
  const otherTeam: DraftTeam = initialTeam === "blue" ? "red" : "blue";
  const banCount = preset === "fast" ? 2 : 3;
  const bans = Array.from({ length: banCount * 2 }, (_, index) => ({ kind: "ban" as const, team: index % 2 === 0 ? initialTeam : otherTeam, label: "Ban" }));
  const picks = competitivePickPattern.map((turn) => ({ kind: "pick" as const, team: turn === "initial" ? initialTeam : otherTeam, label: "Pick" }));
  return [...bans, ...picks];
}

export function remapDraftProgress(
  previousSteps: DraftStep[],
  nextSteps: DraftStep[],
  previousChoices: (string | null)[],
  previousSkipped: boolean[],
  previousSelectedStepIndex: number | null,
) {
  const nextSlotsByIdentity = new Map<string, number[]>();
  nextSteps.forEach((step, index) => {
    const identity = `${step.kind}:${step.team}`;
    const slots = nextSlotsByIdentity.get(identity) ?? [];
    slots.push(index);
    nextSlotsByIdentity.set(identity, slots);
  });

  const previousIdentityOccurrences = new Map<string, number>();
  const remappedIndexByPreviousIndex = previousSteps.map((step) => {
    const identity = `${step.kind}:${step.team}`;
    const occurrence = previousIdentityOccurrences.get(identity) ?? 0;
    previousIdentityOccurrences.set(identity, occurrence + 1);
    return nextSlotsByIdentity.get(identity)?.[occurrence] ?? null;
  });

  const choices = Array<string | null>(nextSteps.length).fill(null);
  const skipped = Array<boolean>(nextSteps.length).fill(false);
  previousSteps.forEach((_step, previousIndex) => {
    const nextIndex = remappedIndexByPreviousIndex[previousIndex];
    if (nextIndex === null) return;
    if (previousChoices[previousIndex]) choices[nextIndex] = previousChoices[previousIndex];
    if (previousSkipped[previousIndex]) skipped[nextIndex] = true;
  });

  const selectedStepIndex = previousSelectedStepIndex === null
    ? null
    : remappedIndexByPreviousIndex[previousSelectedStepIndex] ?? null;

  return { choices, skipped, selectedStepIndex };
}

export function normalizeScrimSequence(steps: DraftStep[], fallback = buildScrimSequence("standard", "blue")): DraftStep[] {
  const valid = steps.filter((step) => (step.kind === "ban" || step.kind === "pick") && (step.team === "blue" || step.team === "red"));
  return valid.length > 0 ? valid.map((step) => ({ ...step, label: stepLabel(step.kind) })) : fallback;
}

export function describeDraftStep(step: DraftStep) {
  return `${stepLabel(step.kind)} · ${teamLabel(step.team)}`;
}

/** Devolve o ordinal global de um pick, partilhado entre Azul e Vermelho e ignorando Bans. */
export function getGlobalPickNumber(steps: DraftStep[], activeStepIndex: number | null) {
  if (activeStepIndex === null) return undefined;
  const activeStep = steps[activeStepIndex];
  if (!activeStep || activeStep.kind !== "pick") return undefined;
  return steps
    .slice(0, activeStepIndex + 1)
    .filter((step) => step.kind === "pick")
    .length;
}

export function getDraftLockedNames(steps: DraftStep[], choices: (string | null)[], activeStepIndex: number | null) {
  // Competitive Rule (Power League / Ranked - similar to Power League Prodigy):
  // Once a brawler is banned anywhere in the sequence, or picked by either team,
  // they are permanently excluded from being picked or banned again.
  const locked = new Set<string>();
  steps.forEach((step, index) => {
    if (index === activeStepIndex) return;
    const choice = choices[index];
    if (choice) {
      locked.add(choice);
    }
  });
  return locked;
}

type DraftRow = {
  brawler: string;
  modeId?: string;
  score: number | null;
  tier: "S" | "A" | "B" | null;
  usage?: number | null;
  winRate?: number | null;
  topBrawlWinRate?: number | null;
  topBrawlUseRate?: number | null;
  topBrawlScore?: number | null;
  brawlPlanetWinRate?: number | null;
  brawlPlanetPickRate?: number | null;
  brawlPlanetStarPlayer?: number | null;
  banRate?: number | null;
  counterRate?: number | null;
};

type CounterDraftRow = DraftRow;

export type DraftRankingContext<T extends DraftRow = DraftRow> = {
  /** Invalida o contexto memoizado na UI quando a snapshot live muda. */
  counterSnapshotVersion?: string;
  mapModeId?: string;
  /** Catálogo original completo do mapa. A popularidade não é renormalizada por bans, picks ou filtros. */
  popularityRows?: readonly T[];
  /** Equipas literais do Brawl Planet já filtradas para o mapa Ranked selecionado. */
  mapTeams?: readonly BrawlPlanetMapTeam[];
  /** Nome do mapa ativo. Quando presente, o quadro de composições é restringido a ele. */
  mapName?: string;
  /**
   * Leitura BrawlScope ativa ("overall" ou "byMode"). O motor lê a escolha do
   * módulo de matchups; este campo existe para as memoizações da interface
   * recalcularem quando o utilizador troca de leitura.
   */
  brawlScopeReading?: string;
  allyRows?: T[];
  enemyRows?: T[];
  role?: DraftRoleFilter;
  /** Número ordinal do pick ativo (1–6). O bónus de abertura só vale nos picks 1–3. */
  pickNumber?: number;
  /** Número de picks já concluídos, incluindo Azul e Vermelho; controla a janela Counter Top mesmo durante bans. */
  completedPickCount?: number;
  /** Brawlers banidos no draft atual. Apenas counters diretos presentes nesta coleção acionam o bónus contextual. */
  bannedNames?: Iterable<string>;
  /** Top 25 fixo do mapa por Score Híbrido base; ignora picks, bans e todos os efeitos contextuais. */
  baseHybridTop25Names?: Iterable<string>;
  /** Top 30 fixo do mapa por Score Híbrido base; apenas candidatos nesta lista podem receber bónus de Counter de Pick ou Counter de Ban. */
  baseHybridTop30Names?: Iterable<string>;
  /** Pesos locais Vitória/Uso (0–100 cada, somam 100), já aplicados às linhas do mapa. */
  experimentalWeights?: { winRate: number; usageRate: number };
  /** Regras percentuais locais do Draft. Valores ausentes usam a configuração competitiva padrão. */
  ruleSettings?: Partial<DraftRuleSettings>;
  /** Janela única de recomendações contextual, usada pela UI, pelos chips e por todos os desbónus de counter. */
  topRecommendationNames?: Iterable<string>;
  /** Subconjunto estável do Top exibido que pode receber Counter Top e Pressão Enemy Counter. */
  counterPenaltyEligibleNames?: Iterable<string>;
  /** Scores contextuais da passagem anterior, usados exclusivamente em pares de counter recíprocos. */
  reciprocalCounterScores?: ReadonlyMap<string, number>;
  /**
   * Motor que ordena as sugestões: o do Brawl Híbrido (por omissão) ou os que
   * imitam o PL Prodigy e o MetaPick. Ver `motoresDoDraft.ts`.
   */
  motor?: ConfigDoMotor;
};

/** Referência de Pontos Base e resultado contextual já convertido para a escala visual do Draft. */
export type NormalizedDraftPoints = {
  /** Score Híbrido relativo ao melhor brawler disponível no mapa: líder = 100. */
  basePoints: number;
  /** Pontos Base depois dos bónus e desbónus percentuais contextuais; não tem teto máximo. */
  finalPoints: number;
};

export type DraftPosition = "left" | "mid" | "right";

export type CounterMatchup = {
  attacker: string;
  defender: string;
  counterScore: number;
  /** Delta do matchup: positivo favorece o atacante; negativo indica counter. */
  counterDelta: number;
  position: DraftPosition;
  note: string;
  sources: CounterSourceName[];
};

export type CounterProfile = {
  brawler: string;
  counters: string[];
  counteredBy: string[];
};

export type RepeatedEnemyCounterPressure = {
  enemy: string;
  counteredAllies: string[];
  rate: number;
};

export type LaneMatchup = {
  ally: string;
  enemy: string;
  score: number;
  position: DraftPosition;
  source: "explicit-counter" | "explicit-defense" | "win-rate-inference";
  note: string;
};

export type DraftSignal = {
  score: number;
  role: DraftRole;
  roleFit: number;
  coverage: number;
  synergy: number;
  winRate: number;
  fit: number;
  usageRate: number;
  counter: number | null;
  metaSignal: number;
  banRate: number | null;
  /** Pontuação final em pontos que ordena as sugestões no Draft. Pode passar de 100 quando há bónus ativos. */
  draftScore: number;
  /** Decomposição auditável da base híbrida e dos bónus condicionais ativos. */
	  scoreBreakdown: {
	    hybridScore: number;
	    hybridPoints: number;
	    counterPoints: number;
	    /** Taxa de Counter direto e pick que a ativou. */
	    counterBonusRate: number;
    /** Ajuste aplicado ao delta de Counter por Pick. */
    counterPickMultiplier?: number;
	    counterBonusPick: number;
	    /** Apenas candidatos do Top 30 base do mapa podem receber bónus de Counter de Pick ou Ban. */
	    isTop30CounterBonusEligible: boolean;
	    missingMidPoints: number;
    missingSidePoints: number;
    banPoints: number;
    /** Taxa aplicada a cada counter banido e pick a que ela corresponde. */
    banBonusRate: number;
    banBonusPick: number;
	    openingLongRangePoints: number;
	    synergyPoints: number;
	    /** Taxa aplicada: percentagem publicada pela fonte, quando existe. */
	    configuredSynergyBonusRate?: number;
	    hasPublishedSynergyRate?: boolean;
	    /** Taxa de Sinergia e pick que a ativou. */
	    synergyBonusRate: number;
	    synergyBonusPick: number;
	    mapTeamSynergyPoints: number;
	    enemyCounterPenaltyPoints: number;
	    /** Percentagem cumulativa do Enemy Counter direto ativo. */
	    enemyCounterPenaltyPercent: number;
	    repeatedEnemyCounterPressurePoints: number;
    topTwentyCounterPenaltyPoints: number;
    /** Número de recomendações contextuais que podem ativar o desbónus de counter neste pick. */
    topCounterWindowSize: number;
	    sameClassPenaltyPoints: number;
	    worstTeammatePenaltyPoints: number;
	    /** Soma dos fatores contextuais a favor e contra. O ajuste é a diferença entre as duas. */
	    rawContextualBonusPoints: number;
	    rawContextualPenaltyPoints: number;
	    contextualAdjustment: number;
    activeBonuses: string[];
  };
  coachScore: number;
  confidence: number;
  reasons: string[];
  decisionType: "Seguro" | "Resposta" | "Win Condition" | "Flex";
  position: DraftPosition;
  positionAdvice: string;
  counterMatchups: CounterMatchup[];
  /** Número de counters diretos deste brawler que estão banidos no draft atual. */
  bannedCounterCount: number;
    /** Brawlers concretos que ativam os bónus contextuais mostrados no Draft. */
	  bonusSources: {
	    counterTargets: string[];
	    /** Inimigos que continuam a gerar bónus de Counter neste pick. */
	    counterBonusTargets: string[];
	    /** Matchups visíveis sem bónus porque o candidato está fora do Top 30 base. */
	    nonTop30CounterBonusTargets: string[];
	    /** Inimigos já cobertos por um aliado; anulam apenas o Counter unitário redundante. */
	    coveredCounterTargets: Array<{ enemy: string; allies: string[] }>;
	    /** Dos cobertos, aqueles em que o aliado tem mesmo o inimigo no Top 10 dele. */
	    fullyCoveredTargets: Array<{ enemy: string; allies: string[] }>;
	    /** Inimigos cujo bónus a regra opcional "resposta já coberta" retirou. Vazio com a regra desligada. */
	    suppressedCounterTargets: string[];
	    /** Bans no Top 25 que não geram bónus porque o candidato está fora do Top 30 base. */
	    nonTop30BannedCounters: string[];
    /** Bans que counteram o candidato, mas estão fora do Top 25 de Score Híbrido base do mapa. */
    nonTop25BannedCounters: string[];
    bannedCounters: string[];
    /** Todos os bans registados no draft, independentemente de pagarem bónus. */
    registeredBans: string[];
    /** Bans registados que não constam do Top 10 de counters deste candidato. */
    bannedNonCounters: string[];
    synergyAllies: string[];
    /** Fonte que sustentou o bónus de sinergia ativo neste pick. */
    synergySource?: CounterSourceName;
    synergySourceUrl?: string;
    /** Top 10 literal "Pair with" do BrawlScope para o candidato, na ordem publicada. */
    brawlScopeSynergyTop: string[];
    /** Aliados já escolhidos que constam nesse Top 10. */
    brawlScopeSynergyAllies: string[];
    /**
     * Cada aliado que sustenta o bónus, com a percentagem que a fonte publica
     * para o par. Sem valor publicado, o Draft usa a taxa fixa do pick — e é
     * essa diferença que a interface mostra.
     */
    synergyDetails: Array<{ brawler: string; delta?: number; source: CounterSourceName }>;
    mapTeamSynergy?: BrawlPlanetMapTeam;
    /** Top 10 literal de composições do mapa ativo publicado pelo Brawl Planet. */
    mapTeamBoard?: BrawlPlanetMapTeamEntry[];
    enemyCounters: string[];
    repeatedEnemyCounterPressures: RepeatedEnemyCounterPressure[];
    topTwentyCounters?: string[];
    sameClassPenalties?: string[];
    sameClassClass?: string;
    worstTeammatePenalties?: string[];
    /** v169: cada confronto com a percentagem do ecrã e se conta (bónus, desbónus ou não conta). */
    confrontosAvaliados?: Array<{ inimigo: string; delta: number; percentagem: number; conta: AvaliacaoDoConfronto }>;
    /** v169: cada dupla com o valor (pp acima/abaixo dele) e se conta. */
    duplasAvaliadas?: Array<{ aliado: string; delta: number | null; fonte: CounterSourceName | "API" | null; conta: boolean }>;
    /** O mínimo em vigor, em % (55 por omissão). */
    minimoDoCounterPct?: number;
  };
};

export type DraftRoleCounts = Record<DraftRole, number>;

export type CoachComposition = {
  roleCounts: DraftRoleCounts;
  roleCoverage: number;
  roleBalance: string;
  allyWinRate: number | null;
  allyHybridScore: number | null;
  enemyWinRate: number | null;
  objectiveFit: number;
  confidence: number;
  winCondition: string;
  openingPlan: string;
  midGamePlan: string;
  closingPlan: string;
  strengths: string[];
  risks: string[];
};

export const draftSteps: DraftStep[] = buildScrimSequence("standard", "blue");

const midRoster = new Set([
  "8-Bit", "Angelo", "Bea", "Belle", "Bo", "Brock", "Byron", "Chuck", "Gale", "Gene", "Gray", "Gus", "Janet", "Jessie", "Lou", "Mandy", "Max", "Mr. P", "Nani", "Pam", "Penny", "Pierce", "Piper", "Poco", "R-T", "Squeak",
]);

const sideRoster = new Set([
  "Shade", "Melodie", "Cordelius",
  "Alli", "Ash", "Bibi", "Bolt", "Bull", "Buster", "Buzz", "Chester", "Clancy", "Crow", "Damian", "Darryl", "Doug", "Draco", "Edgar", "El Primo", "Fang", "Frank", "Gigi", "Griff", "Hank", "Jacky", "Kaze", "Kenji", "Lily", "Mico", "Mortis", "Nita", "Nori", "Ollie", "Pearl", "Rosa", "Sam", "Shelly", "Starr Nova", "Stu", "Surge", "Trunk",
]);

// Flex é uma terceira função distinta: pode preencher Mid ou Lane, sem acumular dois Fits.
const flexRoster = new Set([
  "Rico",
  "Colt", "Dynamike", "Eve", "Juju", "Larry & Lawrie", "Lola", "Maisie", "Mina", "Moe", "Otis", "Ruffs", "Spike", "Sprout", "Tara",
]);

export function inferDraftRole(brawler: string): DraftRole {
  const override = getDraftRoleOverride(brawler);
  if (override) return override;
  if (midRoster.has(brawler)) return "mid";
  if (sideRoster.has(brawler)) return "side";
  if (flexRoster.has(brawler)) return "flex";
  return "flex";
}

function numeric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function counterKey(value: string) {
  return normalizeCounterBrawlerName(value);
}

/** Memorizada pela mesma razão que `normalizeCounterBrawlerName`: pura, e
 *  chamada milhares de vezes por interação sobre os mesmos nomes. */
const nomesMostrados = new Map<string, string>();
function displayCounterName(value: string) {
  const guardado = nomesMostrados.get(value);
  if (guardado !== undefined) return guardado;
  const resultado = value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (nomesMostrados.size > 4000) nomesMostrados.clear();
  nomesMostrados.set(value, resultado);
  return resultado;
}

function uniqueCounterNames(names: string[]) {
  const seen = new Set<string>();
  return names.filter((name) => {
    const normalized = counterKey(name);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

const explicitCounterNotes: Record<string, { targets: string[]; counteredBy: string[]; counterScore: number; note: string }> = Object.fromEntries(
  Object.entries(brawlScopeCounterData).map(([name, entry]) => [
    counterKey(name),
    {
      targets: [...entry.targets],
      counteredBy: [...entry.counteredBy],
      counterScore: 80,
      note: `BrawlScope · ${entry.sourceUrl}`,
    },
  ]),
);

/** Retorna o edge real publicado pelo BrawlScope para este par, em pontos percentuais. */
function brawlScopeDelta(attacker: string, defender: string): number {
  const owner = Object.entries(brawlScopeMatchupDeltas).find(([name]) => counterKey(name) === counterKey(attacker));
  const delta = owner?.[1].deltas
    ? Object.entries(owner[1].deltas).find(([name]) => counterKey(name) === counterKey(defender))?.[1]
    : undefined;
  if (typeof delta === "number" && Number.isFinite(delta)) return delta;
  return 0;
}
function brawlScopeHasMatchup(attacker: string, defender: string): boolean {
  const owner = Object.entries(brawlScopeMatchupDeltas).find(([name]) => counterKey(name) === counterKey(attacker));
  return Boolean(owner?.[1].deltas && Object.keys(owner[1].deltas).some((name) => counterKey(name) === counterKey(defender)));
}

export function getBrawlScopeMatchupDelta(attacker: string, defender: string): number {
  return brawlScopeDelta(attacker, defender);
}

const explicitCounterEntries = new Map(
  Object.entries(explicitCounterNotes).map(([name, entry]) => [counterKey(name), entry]),
);

function scoreForReciprocalCounter(name: string, reciprocalCounterScores: ReadonlyMap<string, number> | undefined) {
  const score = reciprocalCounterScores?.get(counterKey(name));
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

function reciprocalCounterMatchup(attacker: string, defender: string, reciprocalCounterScores: ReadonlyMap<string, number> | undefined, modeId?: string): CounterMatchup | null {
  const reciprocal = getReciprocalCounterRelation(attacker, defender, modeId);
  if (!reciprocal) return null;
  const attackerScore = scoreForReciprocalCounter(attacker, reciprocalCounterScores);
  const defenderScore = scoreForReciprocalCounter(defender, reciprocalCounterScores);
  if (attackerScore === null || defenderScore === null || Math.abs(attackerScore - defenderScore) < 0.0001 || attackerScore < defenderScore) return null;
  const role = inferDraftRole(attacker);
  const position: DraftPosition = role === "mid" ? "mid" : role === "side" ? "left" : "right";
  return {
    attacker,
    defender,
    counterScore: 80,
    counterDelta: 0,
    position,
    sources: [reciprocal.source],
    note: `Counter recíproco · ${reciprocal.source} · Score de Draft ${attackerScore.toFixed(2)} vs ${defenderScore.toFixed(2)} · ${reciprocal.sourceUrls.join(" · ")}`,
  };
}

export function getCounterMatchup(attacker: string, defender: string, reciprocalCounterScores?: ReadonlyMap<string, number>, modeId?: string): CounterMatchup | null {
  const value = getMatchupValue(attacker, defender, modeId);
  if (value.base === null || value.total === 0) return null;
  const role = inferDraftRole(attacker);
  return { attacker, defender, counterScore: 50 + value.total, counterDelta: value.total,
    position: role === "mid" ? "mid" : role === "side" ? "left" : "right",
    sources: ["BrawlScope", ...(value.prodigy ? ["PL Prodigy" as const] : []), ...(value.planet ? ["Brawl Planet" as const] : [])],
    note: describeMatchupValue(value) };
}

function getDraftCounterDirection(attacker: string, defender: string, reciprocalCounterScores?: ReadonlyMap<string, number>, modeId?: string) {
  const value = getMatchupValue(attacker, defender, modeId);
  if (value.base !== null) return value.total > 0 ? "targets" : value.total < 0 ? "counteredBy" : null;
  return getResolvedCounterDirection(attacker, defender, modeId)?.direction ?? null;
}

/**
 * O perfil de counters de um brawler, guardado.
 *
 * MEDIDO ANTES (Draft, sem abrandar o CPU): escrever UMA letra na pesquisa
 * custava 25ms de JavaScript, escolher um brawler 86ms — num telemóvel médio,
 * quatro vezes isso. A maior fatia era esta função: cada cartão de sugestão
 * chama-a a cada desenho, e cada chamada normaliza os ~106 nomes candidatos e
 * cruza o brawler com cada um deles. Doze cartões, ~1300 confrontos, a cada
 * tecla — para chegar sempre à mesma resposta.
 *
 * A resposta só depende dos argumentos e dos quatro estados de módulo que o
 * `versaoDoMotor` segue. Mudou algum deles, a versão avança e a cache
 * esvazia-se na chamada seguinte.
 *
 * O perfil devolvido vai CONGELADO: é partilhado entre todos os que pedem o
 * mesmo, e quem o alterasse no sítio (um `.sort()` sem cópia) estragava-o para
 * os outros sem dar erro nenhum. Congelado, a tentativa rebenta alto.
 */
const perfisGuardados = new Map<string, CounterProfile>();
let versaoDosPerfis = -1;
export function getCounterProfile(brawler: string, candidateNames: string[] = [], modeId?: string): CounterProfile {
  const versao = versaoDoMotor();
  if (versao !== versaoDosPerfis || perfisGuardados.size > 20000) {
    perfisGuardados.clear();
    versaoDosPerfis = versao;
  }
  const chave = `${modeId ?? ""}\u0000${brawler}\u0000${candidateNames.join("\u0001")}`;
  const guardado = perfisGuardados.get(chave);
  if (guardado) return guardado;
  const perfil = calcularPerfilDeCounter(brawler, candidateNames, modeId);
  Object.freeze(perfil.counters);
  Object.freeze(perfil.counteredBy);
  Object.freeze(perfil);
  perfisGuardados.set(chave, perfil);
  return perfil;
}

/** O cálculo sem cache. Exportado só para o teste que o compara com a cache. */
export function calcularPerfilDeCounter(brawler: string, candidateNames: string[] = [], modeId?: string): CounterProfile {
  const key = counterKey(brawler);
  const sourcePriority: Record<string, number> = {
    "BrawlScope": 0,
    "Brawl Calculator": 1,
    "Brawl Planet": 2,
    "PL Prodigy": 3,
  };
  const sourceProfiles = (fonteObservadaAtiva() ? [] : [...getCounterSourceProfiles(brawler, modeId)])
    .sort((left, right) => (sourcePriority[left.source] ?? 99) - (sourcePriority[right.source] ?? 99));
  const mentionedNames = [
    ...Object.keys(explicitCounterNotes),
    ...Object.values(explicitCounterNotes).flatMap((entry) => entry.targets),
    ...sourceProfiles.flatMap((profile) => [...profile.targets, ...profile.counteredBy].map((relation) => relation.brawler)),
  ].map(displayCounterName);
  const rosterNames = [...candidateNames, ...sourceProfiles.flatMap(profile => [...profile.targets, ...profile.counteredBy].map(relation => relation.brawler)), ...(candidateNames.length >= 8 ? [] : mentionedNames)];
  const allNames = uniqueCounterNames(rosterNames);
  const labels = new Map(allNames.map((name) => [counterKey(name), name]));
  const labelFor = (name: string) => labels.get(counterKey(name)) ?? (candidateNames.length > 0 ? null : displayCounterName(name));
  const selfLabel = labels.get(key) ?? brawler.trim();
  const directionByBrawler = new Map<string, { name: string; direction: "target" | "counteredBy" }>();
  /**
   * Direções rejeitadas manualmente não entram no perfil canónico do Draft. A
   * lista literal de cada fonte continua visível na ficha do brawler, para
   * auditoria — o que não pode acontecer é o motor pontuar um confronto que o
   * projeto decidiu não reconhecer.
   */
  const isRejected = (name: string) =>
    isExcludedCounterDirection(brawler, name) || isExcludedCounterDirection(name, brawler);
  for (const profile of sourceProfiles) {
    for (const relation of profile.targets) {
      const name = labelFor(relation.brawler);
      if (!name || counterKey(name) === key || isRejected(name)) continue;
      const relationKey = counterKey(name);
      if (!directionByBrawler.has(relationKey)) directionByBrawler.set(relationKey, { name, direction: "target" });
    }
    for (const relation of profile.counteredBy) {
      const name = labelFor(relation.brawler);
      if (!name || counterKey(name) === key || isRejected(name)) continue;
      const relationKey = counterKey(name);
      if (!directionByBrawler.has(relationKey)) directionByBrawler.set(relationKey, { name, direction: "counteredBy" });
    }
  }

  for (const name of allNames) {
    if (counterKey(name) === key) continue;
    const value = getMatchupValue(brawler, name, modeId);
    if (value.base !== null && value.total !== 0) directionByBrawler.set(counterKey(name), { name, direction: value.total > 0 ? "target" : "counteredBy" });
  }

  return {
    brawler: labels.get(key) ?? selfLabel,
    counters: Array.from(directionByBrawler.values()).filter((relation) => relation.direction === "target").map((relation) => relation.name),
    counteredBy: Array.from(directionByBrawler.values()).filter((relation) => relation.direction === "counteredBy").map((relation) => relation.name),
  };
}

export interface LiveCounterSuggestion {
  enemyBrawler: string;
  recommendedBrawler: string;
  position: DraftPosition;
  advantageScore: number;
  explanation: string;
}

export function getLiveCounterSuggestions<T extends DraftRow>(enemyBrawlers: string[], availableRows: T[], reciprocalCounterScores?: ReadonlyMap<string, number>): LiveCounterSuggestion[] {
  const suggestions: LiveCounterSuggestion[] = [];
  const modeId = availableRows[0]?.modeId;
  for (const enemy of enemyBrawlers) {
    if (!enemy) continue;
    const enemyLower = enemy.trim().toLowerCase();
    // Procurar brawlers na pool que counteram o inimigo
    const matching = availableRows.filter((row) => {
      return (getCounterMatchup(row.brawler, enemy, reciprocalCounterScores, row.modeId ?? modeId)?.counterDelta ?? 0) > 0;
    });
    if (matching.length > 0) {
      // Ordenar pelo score híbrido/counter
      matching.sort((a, b) => (Number((b as any).score ?? (b as any).hybridScore ?? 0) - Number((a as any).score ?? (a as any).hybridScore ?? 0)));
      const best = matching[0];
      const match = getCounterMatchup(best.brawler, enemy, reciprocalCounterScores, best.modeId ?? modeId);
      suggestions.push({
        enemyBrawler: enemy,
        recommendedBrawler: best.brawler,
        position: match?.position ?? "mid",
        advantageScore: match?.counterScore ?? 84,
        explanation: match?.note ?? `O brawler ${best.brawler} possui vantagem direta de matchup contra ${enemy} no mapa atual.`
      });
    }
  }
  return suggestions;
}

export function calculateLaneMatchup<T extends DraftRow>(ally: T, enemy: T, position: DraftPosition = "mid", reciprocalCounterScores?: ReadonlyMap<string, number>): LaneMatchup {
  const modeId = ally.modeId ?? enemy.modeId;
  const direct = getCounterMatchup(ally.brawler, enemy.brawler, reciprocalCounterScores, modeId);
  const reverse = getCounterMatchup(enemy.brawler, ally.brawler, reciprocalCounterScores, modeId);
  const allyWinRate = numeric(ally.brawlPlanetWinRate) ?? numeric(ally.topBrawlWinRate) ?? numeric(ally.winRate) ?? 50;
  const enemyWinRate = numeric(enemy.brawlPlanetWinRate) ?? numeric(enemy.topBrawlWinRate) ?? numeric(enemy.winRate) ?? 50;
  const inferred = clamp(50 + (allyWinRate - enemyWinRate) * 1.5);
  const value = getMatchupValue(ally.brawler, enemy.brawler, modeId);
  if (value.base === 0) return { ally: ally.brawler, enemy: enemy.brawler, score: 50, position, source: "explicit-counter", note: describeMatchupValue(value) };
  if (direct) return { ally: ally.brawler, enemy: enemy.brawler, score: direct.counterScore, position, source: direct.counterDelta > 0 ? "explicit-counter" : "explicit-defense", note: direct.note };
  if (reverse) return { ally: ally.brawler, enemy: enemy.brawler, score: 100 - reverse.counterScore, position, source: reverse.counterDelta > 0 ? "explicit-defense" : "explicit-counter", note: reverse.note };
  return { ally: ally.brawler, enemy: enemy.brawler, score: inferred, position, source: "win-rate-inference", note: `Inferência por Win Rate: ${allyWinRate.toFixed(1)}% aliado vs ${enemyWinRate.toFixed(1)}% adversário; confirma o matchup através da execução e cobertura da lane.` };
}

export type DueloAtribuido<T extends DraftRow> = {
  ally: T;
  enemy: T;
  /** Vantagem de `ally` sobre `enemy`, 0–100, a mesma de `calculateLaneMatchup`. */
  score: number;
  /** Porque é este o adversário, dito na perspetiva da equipa favorecida. */
  motivo: string;
};

/**
 * Quem joga contra quem na matriz 1v1.
 *
 * Emparelhar por função (Mid contra Mid, Lane contra Lane) ignorava os
 * counters: com El Primo, Gus e Dynamike do outro lado, o Mortis ficava com
 * quem calhasse na mesma posição, mesmo sendo a Dynamike quem ele pune.
 *
 * Aqui escolhe-se a combinação de duelos que dá mais vantagem à equipa
 * favorecida no TOTAL, e não a cada brawler isolado. É isso que permite a um
 * brawler deixar o seu melhor alvo a um colega que só ganha a esse adversário
 * e ficar com o segundo — a soma da equipa é maior assim.
 *
 * Com três de cada lado há seis combinações; experimentam-se todas. Empates
 * desfazem-se por: pior duelo menos mau (não sacrificar ninguém), depois
 * função igual (Mid com Mid, como antes), depois a ordem das escolhas.
 */
export function atribuirDuelosPorCounter<T extends DraftRow>(
  allyRows: readonly T[],
  enemyRows: readonly T[],
  favorece: "ally" | "enemy" = "ally",
  /** Vantagem 0–100 de ally sobre enemy. Por omissão, a leitura híbrida do cartão. */
  pontuar: (ally: T, enemy: T) => number = (ally, enemy) => calculateLaneMatchup(ally, enemy).score,
): DueloAtribuido<T>[] {
  const pares = Math.min(allyRows.length, enemyRows.length);
  if (!pares) return [];
  const scores = allyRows.map((ally) => enemyRows.map((enemy) => pontuar(ally, enemy)));
  const sinal = favorece === "ally" ? 1 : -1;
  const vantagem = (a: number, e: number) => sinal * (scores[a][e] - 50);
  const eMid = (row: T) => inferDraftRole(row.brawler) === "mid";
  const mesmaFuncao = (a: number, e: number) => (eMid(allyRows[a]) === eMid(enemyRows[e]) ? 1 : 0);

  // Percorre os emparelhamentos do lado mais curto para o mais comprido.
  const aliadosMandam = allyRows.length <= enemyRows.length;
  const curto = aliadosMandam ? allyRows.length : enemyRows.length;
  const comprido = aliadosMandam ? enemyRows.length : allyRows.length;
  let melhor: { pares: Array<[number, number]>; total: number; pior: number; funcao: number } | null = null;
  const usados = new Array<boolean>(comprido).fill(false);
  const atual: Array<[number, number]> = [];
  const EPS = 1e-9;
  const percorrer = (i: number) => {
    if (i === curto) {
      const valores = atual.map(([a, e]) => vantagem(a, e));
      const total = valores.reduce((soma, valor) => soma + valor, 0);
      const pior = Math.min(...valores);
      const funcao = atual.reduce((soma, [a, e]) => soma + mesmaFuncao(a, e), 0);
      const ganha = !melhor
        || total > melhor.total + EPS
        || (Math.abs(total - melhor.total) <= EPS && (pior > melhor.pior + EPS
          || (Math.abs(pior - melhor.pior) <= EPS && funcao > melhor.funcao)));
      if (ganha) melhor = { pares: atual.map(([a, e]) => [a, e] as [number, number]), total, pior, funcao };
      return;
    }
    for (let j = 0; j < comprido; j++) {
      if (usados[j]) continue;
      usados[j] = true;
      atual.push(aliadosMandam ? [i, j] : [j, i]);
      percorrer(i + 1);
      atual.pop();
      usados[j] = false;
    }
  };
  percorrer(0);
  const escolhidos = (melhor as { pares: Array<[number, number]> } | null)?.pares ?? [];
  escolhidos.sort((left, right) => left[0] - right[0]);

  const adversarioDe = new Map(escolhidos.map(([a, e]) => [e, a]));
  return escolhidos.map(([a, e]) => {
    const ally = allyRows[a];
    const enemy = enemyRows[e];
    // O motivo fala pela equipa favorecida: o "próprio" é o brawler dessa equipa.
    const proprio = favorece === "ally" ? ally.brawler : enemy.brawler;
    const alvo = favorece === "ally" ? enemy.brawler : ally.brawler;
    const deste = vantagem(a, e);
    const opcoes = favorece === "ally"
      ? enemyRows.map((_, j) => ({ nome: enemyRows[j].brawler, valor: vantagem(a, j), quem: adversarioDe.get(j) }))
      : allyRows.map((_, j) => ({ nome: allyRows[j].brawler, valor: vantagem(j, e), quem: escolhidos.find(([aa]) => aa === j)?.[1] }));
    const melhorAlvo = opcoes.reduce((top, opcao) => (opcao.valor > top.valor + EPS ? opcao : top), opcoes.find((opcao) => opcao.nome === alvo)!);
    let motivo: string;
    if (melhorAlvo.nome === alvo) {
      motivo = deste > 0
        ? `${alvo} é o adversário a quem ${proprio} mais ganha.`
        : `Nenhum adversário é favorável a ${proprio}; ${alvo} é o duelo menos mau.`;
    } else {
      const colega = melhorAlvo.quem === undefined ? undefined : favorece === "ally" ? allyRows[melhorAlvo.quem]?.brawler : enemyRows[melhorAlvo.quem]?.brawler;
      motivo = colega
        ? `${proprio} ganharia mais a ${melhorAlvo.nome}, mas fica com ${alvo} para ${colega} jogar contra ${melhorAlvo.nome}: a equipa soma mais assim.`
        : `${proprio} ganharia mais a ${melhorAlvo.nome}, mas ${alvo} dá mais vantagem à equipa no total.`;
    }
    return { ally, enemy, score: scores[a][e], motivo };
  });
}

/**
 * O que o PL Prodigy diz de um duelo, e só ele: 1 se `ally` ganha a `enemy`,
 * -1 se perde, 0 se nenhuma das duas guias fala do par (ou se se contradizem).
 *
 * Cada guia publica um Top 8 de "counters" e outro de "countered by", sem
 * percentagem. Vale qualquer uma das duas páginas: a do `ally` a dizer que
 * ganha, ou a do `enemy` a dizer que perde com ele — é o que a fonte publica,
 * e nas leituras de produção nenhum par tem as duas páginas em contradição.
 */
export function leituraDoPLProdigy(ally: string, enemy: string): -1 | 0 | 1 {
  const chave = (nome: string) => normalizeCounterBrawlerName(nome);
  const perfil = (nome: string) => getCounterSourceProfiles(nome).find((profile) => profile.source === "PL Prodigy");
  const tem = (lista: readonly { brawler: string }[] | undefined, nome: string) => lista?.some((r) => chave(r.brawler) === chave(nome)) ?? false;
  const doAliado = perfil(ally);
  const doAdversario = perfil(enemy);
  const ganha = tem(doAliado?.targets, enemy) || tem(doAdversario?.counteredBy, ally);
  const perde = tem(doAliado?.counteredBy, enemy) || tem(doAdversario?.targets, ally);
  return ganha === perde ? 0 : ganha ? 1 : -1;
}

export type PosicaoNoMapa = "left" | "mid" | "right";

/**
 * Em que coluna do mapa dos duelos fica cada brawler da tua equipa.
 *
 * O de Mid vai para o meio, os de Lane para as pontas, e o que sobra (Flex,
 * ou um segundo Mid) ocupa o primeiro lugar livre, a começar pelo meio. Antes
 * a ordem era esquerda→meio→direita com recurso imediato, e um só brawler de
 * Mid acabava na lane esquerda porque era o primeiro a ser procurado.
 *
 * `ocupadas` deixa preencher em duas passagens: primeiro os duelos, depois os
 * brawlers ainda sem adversário nas colunas que ficaram livres.
 */
export function posicionarNoMapa<T>(
  itens: readonly T[],
  funcaoDe: (item: T) => DraftRole,
  ocupadas: ReadonlySet<PosicaoNoMapa> = new Set(),
): Array<{ position: PosicaoNoMapa; item: T }> {
  const livres = [...itens];
  const tirar = (quer: (item: T) => boolean) => {
    const indice = livres.findIndex(quer);
    return indice >= 0 ? livres.splice(indice, 1)[0] : undefined;
  };
  const lugar = new Map<PosicaoNoMapa, T>();
  const pedir = (position: PosicaoNoMapa, quer: (item: T) => boolean) => {
    if (ocupadas.has(position) || lugar.has(position)) return;
    const item = tirar(quer);
    if (item !== undefined) lugar.set(position, item);
  };
  pedir("mid", (item) => funcaoDe(item) === "mid");
  pedir("left", (item) => funcaoDe(item) === "side");
  pedir("right", (item) => funcaoDe(item) === "side");
  for (const position of ["mid", "left", "right"] as const) pedir(position, () => true);
  return (["left", "mid", "right"] as const)
    .filter((position) => lugar.has(position))
    .map((position) => ({ position, item: lugar.get(position) as T }));
}

export function getPositionRecommendation(brawler: string, enemyRows: Array<{ brawler: string; modeId?: string }>): { position: DraftPosition; label: string; advice: string } {
  const role = inferDraftRole(brawler);
  const direct = enemyRows.map((enemy) => getCounterMatchup(brawler, enemy.brawler, undefined, enemy.modeId)).find(matchup => matchup && matchup.counterDelta > 0);
  if (direct) {
    const label = direct.position === "mid" ? "Mid" : direct.position === "left" ? "Lane esquerda" : "Lane direita";
    return { position: direct.position, label, advice: `${label}: aplica o counter em ${direct.defender} sem abandonar a cobertura do objetivo.` };
  }
  if (role === "mid") return { position: "mid", label: "Mid", advice: "Mid: mantém visão do centro e roda para a Lane sob pressão." };
  if (role === "side") return { position: "left", label: "Lane esquerda", advice: "Lane esquerda: joga por cobertura e cria a primeira ameaça sem oferecer dive gratuito." };
  return { position: "right", label: "Flex", advice: "Flex: pode preencher Mid ou Lane sem receber Fit duplo." };
}

function average(values: Array<number | null | undefined>) {
  const available = values.map(numeric).filter((value): value is number => value !== null);
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function modeRolePriority(modeId?: string): DraftRole[] {
  if (modeId === "brawl-ball") return ["side", "flex"];
  if (modeId === "heist") return ["side", "flex"];
  if (modeId === "bounty" || modeId === "knockout") return ["flex", "side"];
  return ["flex", "side"];
}

function modeWinCondition(modeId?: string) {
  if (modeId === "heist") return "Criar uma janela segura de dano ao cofre sem perder a defesa no contra-ataque.";
  if (modeId === "brawl-ball") return "Ganhar espaço, preservar a posse e converter a vantagem numérica em golo.";
  if (modeId === "bounty" || modeId === "knockout") return "Trocar apenas em vantagem, manter a vida e fechar a ronda sem oferecer eliminações.";
  if (modeId === "hot-zone") return "Controlar a zona com presença contínua e negar o acesso antes de procurar eliminações.";
  return "Garantir o controlo do centro, proteger o carregador de gemas e transformar pressão em contagem.";
}

function roleObjectiveFit(modeId: string | undefined, role: DraftRole) {
  const priority = modeRolePriority(modeId);
  return priority[0] === role ? 1 : priority[1] === role ? 0.72 : 0.48;
}

function roleCountsFor<T extends DraftRow>(rows: T[]): DraftRoleCounts {
  return rows.reduce<DraftRoleCounts>((counts, row) => {
    counts[inferDraftRole(row.brawler)] += 1;
    return counts;
  }, { side: 0, mid: 0, flex: 0 });
}

function rowsAverage<T extends DraftRow>(rows: T[], selector: (row: T) => number | null | undefined) {
  return average(rows.map(selector));
}

export function analyzeDraftComposition<T extends DraftRow>(allyRows: T[], enemyRows: T[] = [], modeId?: string): CoachComposition {
  const roleCounts = roleCountsFor(allyRows);
  const coveredSlots = Math.min(roleCounts.side, 2) + (roleCounts.mid + roleCounts.flex > 0 ? 1 : 0);
  const roleCoverage = Math.round((coveredSlots / 3) * 100);
  const priority = modeRolePriority(modeId);
  const objectiveFit = allyRows.length
    ? Math.round(average(allyRows.map((row) => roleObjectiveFit(modeId, inferDraftRole(row.brawler)) * 100)) ?? 0)
    : 0;
  const allyWinRate = rowsAverage(allyRows, (row) => row.brawlPlanetWinRate ?? row.topBrawlWinRate ?? row.winRate);
  const allyHybridScore = rowsAverage(allyRows, (row) => row.score);
  const enemyWinRate = rowsAverage(enemyRows, (row) => row.brawlPlanetWinRate ?? row.topBrawlWinRate ?? row.winRate);
  const missingPriority = priority.filter((role) => roleCounts[role] === 0);
  const duplicateRole = roleCounts.side >= 3 || roleCounts.flex >= 2 || roleCounts.mid >= 2;
  const risks: string[] = [];
  const strengths: string[] = [];

  if (roleCounts[priority[0]] > 0) strengths.push(`${priority[0].toUpperCase()} alinhada com a condição principal do modo.`);
  if (coveredSlots === 3) strengths.push("A composição cobre Mid, duas Lanes e Flex sem depender de uma única função.");
  if (allyWinRate !== null && allyWinRate >= 55) strengths.push(`Win Rate médio aliado de ${allyWinRate.toFixed(1)}% no mapa.`);
  if (missingPriority.length) risks.push(`Falta ${missingPriority.map((role) => role.toUpperCase()).join(" e ")} para fechar a estrutura ideal.`);
  if (duplicateRole && coveredSlots < 3) risks.push("Há sobreposição de função; a composição pode perder cobertura quando o primeiro pick é pressionado.");
  if (enemyRows.length && enemyWinRate !== null && allyWinRate !== null && allyWinRate < enemyWinRate - 3) risks.push("O adversário tem vantagem de Win Rate média; prioriza segurança e counter direto.");
  if (!allyRows.length) risks.unshift("Ainda não há picks aliados: começa por garantir a função prioritária do modo.");

  const roleBalance = allyRows.length === 0 ? "A aguardar primeiro pick" : risks.length === 0 ? "Estrutura estável" : roleCoverage >= 67 ? "Quase completa" : "A corrigir";
  const confidence = Math.round(clamp((roleCoverage * 0.45) + (Math.min(100, allyRows.length * 25) * 0.25) + (allyWinRate === null ? 30 : Math.min(100, allyWinRate) * 0.3)));

  return {
    roleCounts,
    roleCoverage,
    roleBalance,
    allyWinRate,
    allyHybridScore,
    enemyWinRate,
    objectiveFit,
    confidence,
    winCondition: modeWinCondition(modeId),
    openingPlan: modeId === "heist" ? "Preserva o defensor e só abre o cofre após ganhar a primeira troca." : modeId === "brawl-ball" ? "Ganha a primeira parede/ângulo e mantém um jogador atrás da bola." : "Estabelece visão e prioridade do centro antes de forçar a primeira eliminação.",
    midGamePlan: modeId === "bounty" || modeId === "knockout" ? "Joga por informação e vantagem numérica; não troca vida por espaço vazio." : "Roda a pressão entre lanes e usa o Super para negar o objetivo, não apenas para causar dano.",
    closingPlan: modeId === "hot-zone" ? "Fecha as entradas da zona e recua apenas depois de garantir o relógio." : modeId === "heist" ? "Coordena o avanço ao cofre com a respawn do adversário sob controlo." : "Converte a vantagem com duas ameaças simultâneas e evita perseguir eliminações fora do objetivo.",
    strengths: strengths.length ? strengths : ["A leitura será atualizada à medida que os picks forem adicionados."],
    risks: risks.length ? risks : ["Sem alerta crítico nesta fase."],
  };
}

/**
 * Calcula a base híbrida sem qualquer efeito de Draft. Esta função é a fonte
 * única para a referência de 100 Pontos Base e para a auditoria do sinal.
 */
export function calculateDraftHybridScore<T extends DraftRow>(row: T, _experimentalWeights?: DraftRankingContext<T>["experimentalWeights"]) {
  const mapScore = numeric(row.score);
  const winRate = numeric(row.winRate) ?? numeric(row.brawlPlanetWinRate) ?? numeric(row.topBrawlWinRate) ?? 0;
  return mapScore === null ? winRate : clamp(mapScore);
}

/** O maior Score Híbrido disponível é sempre a referência de 100 Pontos Base. */
export function getDraftMaximumHybridScore<T extends DraftRow>(rows: readonly T[], experimentalWeights?: DraftRankingContext<T>["experimentalWeights"]) {
  return rows.reduce((maximum, row) => Math.max(maximum, calculateDraftHybridScore(row, experimentalWeights)), 0);
}

/**
 * Aplica a normalização antes dos efeitos contextuais. Como todos os efeitos do
 * motor são percentuais do Score Híbrido, o multiplicador draft/hybrid mantém
 * exatamente os bónus e desbónus em pontos (100 +10% = 110; 100 −5% = 95).
 */
export function calculateNormalizedDraftPoints(hybridScore: number, draftScore: number, maxHybridScore: number): NormalizedDraftPoints {
  const basePoints = maxHybridScore > 0 ? (hybridScore / maxHybridScore) * 100 : 0;
  const contextualMultiplier = hybridScore > 0 ? draftScore / hybridScore : 1;
  return { basePoints, finalPoints: basePoints * contextualMultiplier };
}

function getDraftUsageRate(row: DraftRow) {
  const explicitUsage = numeric(row.usage);
  if (explicitUsage !== null) return explicitUsage;
  const sources = [numeric(row.topBrawlUseRate), numeric(row.brawlPlanetPickRate)]
    .filter((value): value is number => value !== null);
  return sources.length ? sources.reduce((sum, value) => sum + value, 0) / sources.length : null;
}

/**
 * A percentagem de um confronto, como o site a mostra.
 *
 * Com «API oficial»: a vitória real de `a` contra `b` neste mapa (a vitória
 * dele no mapa mais a diferença medida contra este adversário) — o mesmo
 * número da página «Partidas» e da Matriz. Com as fontes: 50% + a diferença
 * publicada, que é o número dos duelos (as fontes medem a diferença contra a
 * média de cada um, não publicam a vitória do par).
 */
export function percentagemDoConfronto(a: string, b: string, modeId?: string) {
  const delta = getMatchupValue(a, b, modeId).total;
  const base = fonteObservadaAtiva() ? vitoriaObservadaNoMapa(a) ?? 50 : 50;
  return { delta, percentagem: Math.round((base + delta) * 10) / 10 };
}

export type AvaliacaoDoConfronto = "bonus" | "desbonus" | "nao";
/**
 * v168: um confronto só conta a partir do mínimo (55%). O bónus precisa de
 * 55% ou mais a favor E de uma diferença positiva; o desbónus, de o adversário
 * ter 55% ou mais contra (45% ou menos para nós) E de uma diferença negativa.
 * Com o mínimo em 50%, qualquer diferença conta — a regra de antes.
 */
export function avaliarConfronto(delta: number, percentagem: number, minimoPct: number): AvaliacaoDoConfronto {
  if (!delta) return "nao";
  if (minimoPct <= 50) return delta > 0 ? "bonus" : "desbonus";
  if (delta > 0 && percentagem >= minimoPct - 1e-9) return "bonus";
  if (delta < 0 && percentagem <= 100 - minimoPct + 1e-9) return "desbonus";
  return "nao";
}

export function calculateDraftSignal<T extends DraftRow>(row: T, context: DraftRankingContext<T> = {}, includePresentation = true): DraftSignal {
  const winRate = numeric(row.brawlPlanetWinRate) ?? numeric(row.topBrawlWinRate) ?? numeric(row.winRate) ?? 50;
  const mapScore = numeric(row.score);
  const topBrawlScore = numeric(row.topBrawlScore);
  const banRate = numeric(row.banRate);
  const counterRate = numeric(row.counterRate);
  const coverageValues = [row.topBrawlWinRate, row.topBrawlUseRate, row.topBrawlScore, row.brawlPlanetWinRate, row.brawlPlanetPickRate, row.brawlPlanetStarPlayer];
  const coverage = coverageValues.filter((value) => numeric(value) !== null).length / coverageValues.length;
  const role = inferDraftRole(row.brawler);
  const roleFit = !context.role || context.role === "Todas" ? 0.5 : role === context.role ? 1 : role === "flex" ? 0.62 : 0.18;
  const ruleSettings = regrasDoMotor(context.ruleSettings);
  const allyRows = context.allyRows ?? [];
  const enemyRows = context.enemyRows ?? [];
  const fit = clamp((roleObjectiveFit(context.mapModeId, role) * 100 * 0.75) + (roleFit * 100 * 0.25));
  /**
   * «Só API oficial»: os perfis das outras fontes ficam vazios. Sem eles não há
   * sinergia do BrawlScope/Brawl Planet, nem Worst Teammate, nem counter banido
   * pelo Top 10 publicado — tudo o que o Draft lê passa a sair das partidas.
   */
  const soApi = fonteObservadaAtiva();
  const sourceProfiles = soApi ? [] : getCounterSourceProfiles(row.brawler, getBrawlScopeReading() === "byMode" ? context.mapModeId : undefined);
  const brawlPlanetProfile = sourceProfiles.find((profile) => profile.source === "Brawl Planet");
  const brawlScopeProfile = sourceProfiles.find((profile) => profile.source === "BrawlScope");
  const bestTeammateKeys = new Set((brawlPlanetProfile?.bestTeammates ?? []).map((relation) => counterKey(relation.brawler)));
  const worstTeammateKeys = new Set((brawlPlanetProfile?.worstTeammates ?? []).map((relation) => counterKey(relation.brawler)));
  // Top 10 "Pair with" publicado na ficha BrawlScope do candidato.
  const brawlScopeSynergyTeammates = brawlScopeProfile?.bestTeammates ?? [];
  const brawlScopeSynergyKeys = new Set(brawlScopeSynergyTeammates.map((relation) => counterKey(relation.brawler)));
  const activeBrawlScopeSynergyAllies = allyRows
    .map((ally) => ally.brawler)
    .filter((ally) => brawlScopeSynergyKeys.has(counterKey(ally)));
  const activeBestTeammates = allyRows
    .map((ally) => ally.brawler)
    .filter((ally) => bestTeammateKeys.has(counterKey(ally)));
  const activeWorstTeammates = allyRows
    .map((ally) => ally.brawler)
    .filter((ally) => worstTeammateKeys.has(counterKey(ally)));
  const mapTeamSynergy = soApi ? null : findBrawlPlanetMapTeam(row.brawler, allyRows.map((ally) => ally.brawler), context.mapTeams);
  // Quadro literal do mapa restrito às composições que incluem o candidato.
  const mapTeamBoard = getBrawlPlanetMapTeamsForBrawler(
    row.brawler,
    context.mapTeams,
    context.mapName,
    allyRows.map((ally) => ally.brawler),
  );
  // A composição do mapa é a evidência mais específica; não acumulamos o
  // Best Teammate global para o mesmo candidato e evitamos bónus duplicado.
  // A equipa tripla só conta com o interruptor ligado (desligado por omissão desde a v168).
  const hasMapTeamSynergy = Boolean(mapTeamSynergy) && ruleSettings.sinergiaDeEquipaTripla >= 0.5;
  // Uma única fatia de bónus de sinergia por candidato, atribuída à fonte mais
  // prioritária que publicou o aliado já escolhido: BrawlScope antes de Brawl
  // Planet, a mesma ordem usada na resolução de counters.
  /**
   * v168: a dupla só conta quando o par ganha mais do que o brawler sozinho —
   * a percentagem publicada do par (vitória do par menos a dele) é positiva.
   * Sem número publicado não se sabe, e não conta.
   */
  const sinergiaSoAcima = ruleSettings.sinergiaSoAcimaDaVitoria >= 0.5;
  const parAcimaDaVitoria = (relation: { delta?: number }) => typeof relation.delta === "number" && Number.isFinite(relation.delta) && relation.delta > 0;
  const aliadoNaLista = (lista: readonly SourcedCounterRelation[]) => lista.filter((relation) => allyRows.some((ally) => counterKey(ally.brawler) === counterKey(relation.brawler)));
  // Com a regra ligada, a fonte é a que tem uma dupla que CONTA: uma dupla abaixo
  // no BrawlScope já não esconde uma dupla acima no Brawl Planet.
  const brawlScopeConta = aliadoNaLista(brawlScopeSynergyTeammates).some(parAcimaDaVitoria);
  const planetConta = aliadoNaLista(brawlPlanetProfile?.bestTeammates ?? []).some(parAcimaDaVitoria);
  const synergySource: CounterSourceName | null = sinergiaSoAcima && (brawlScopeConta || planetConta)
    ? (brawlScopeConta ? "BrawlScope" : "Brawl Planet")
    : activeBrawlScopeSynergyAllies.length
      ? "BrawlScope"
      : activeBestTeammates.length
        ? "Brawl Planet"
        : null;
  const activeSynergyAllies = synergySource === "BrawlScope" ? activeBrawlScopeSynergyAllies : activeBestTeammates;
  // Relações literais correspondentes aos aliados ativos, para ler a percentagem
  // publicada pela fonte que sustenta o bónus.
  const activeSynergyRelations = (synergySource === "BrawlScope" ? brawlScopeSynergyTeammates : brawlPlanetProfile?.bestTeammates ?? [])
    .filter((relation) => activeSynergyAllies.some((ally) => counterKey(ally) === counterKey(relation.brawler)))
    .filter((relation) => !sinergiaSoAcima || parAcimaDaVitoria(relation));
  const synergySourceUrl = synergySource === "BrawlScope"
    ? brawlScopeSynergyTeammates.find((relation) => counterKey(relation.brawler) === counterKey(activeSynergyAllies[0] ?? ""))?.sourceUrl
      ?? brawlScopeProfile?.sourceUrl
    : brawlPlanetProfile?.sourceUrl;
  const hasSynergy = sinergiaSoAcima ? activeSynergyRelations.length > 0 : activeSynergyAllies.length > 0;
  // Os aliados que dão mesmo sinergia (com a regra da v168, só os pares acima da vitória dele).
  const aliadosDaSinergia = sinergiaSoAcima ? activeSynergyRelations.map((relation) => relation.brawler) : activeSynergyAllies;
  const synergy = hasSynergy ? 100 : 0;
  const directCounters = enemyRows
    .map((enemy) => getCounterMatchup(row.brawler, enemy.brawler, context.reciprocalCounterScores, context.mapModeId))
    .filter((matchup): matchup is CounterMatchup => matchup !== null);
  const brawlScopeMatchups = directCounters;
  const directCounterSignal = directCounters.length
    ? average(directCounters.map((matchup) => matchup.counterScore))
    : null;
  const hasBaseHybridTop30Reference = context.baseHybridTop30Names !== undefined;
  const baseHybridTop30Keys = new Set(Array.from(context.baseHybridTop30Names ?? []).map(counterKey));
  // O delta BrawlScope é específico do par e vale para qualquer brawler do catálogo;
  // não limitar o bônus a uma janela Top 30 evita transformar a leitura do matchup
  // em um percentual fixo ou descartar counters legítimos.
  const isTop30CounterBonusEligible = true;
  // Quem já responde a cada inimigo. Continua a ser exposto na auditoria, porque
  // saber que um inimigo já está coberto por um aliado é informação útil ao
  // escolher — mas deixou de retirar pontos (ver `bonusCounterMatchups` abaixo).
  const coveredCounterTargets = directCounters
    .map((matchup) => ({
      enemy: matchup.defender,
      allies: allyRows
        .map((ally) => ally.brawler)
        .filter((ally) => getDraftCounterDirection(ally, matchup.defender, context.reciprocalCounterScores, context.mapModeId) === "targets"),
    }))
    .filter((coverage) => coverage.allies.length > 0);
  const coveredCounterTargetKeys = new Set(coveredCounterTargets.map((coverage) => counterKey(coverage.enemy)));
  /**
   * Cobertura a sério: o aliado tem aquele inimigo no Top 10 do que ele countera.
   *
   * A diferença entre isto e `coveredCounterTargets` é a que decide se vale a
   * pena não pagar o bónus outra vez. Um aliado com um delta positivo residual
   * contra o inimigo não o está a responder — está só a não perder. Um aliado
   * que o tem nos dez primeiros da lista publicada dele, esse responde.
   *
   * A lista usada é a mesma que o bónus de ban usa, do outro lado: ali é o Top
   * 10 de quem me countera, aqui é o Top 10 de quem o aliado countera.
   */
  const top10TargetKeysOf = (brawler: string) => new Set(
    getCounterSourceProfiles(brawler, getBrawlScopeReading() === "byMode" ? context.mapModeId : undefined)
      .filter((profile) => profile.source === "BrawlScope" || profile.source === "PL Prodigy")
      .flatMap((profile) => profile.targets.slice(0, 10))
      .map((relation) => counterKey(relation.brawler)),
  );
  const fullyCoveredTargets = coveredCounterTargets
    .map((coverage) => ({
      enemy: coverage.enemy,
      allies: coverage.allies.filter((ally) => top10TargetKeysOf(ally).has(counterKey(coverage.enemy))),
    }))
    .filter((coverage) => coverage.allies.length > 0);
  const fullyCoveredKeys = new Set(fullyCoveredTargets.map((coverage) => counterKey(coverage.enemy)));
  /**
   * A supressão do "Counter unitário já coberto" era da era da taxa fixa: dar
   * +5% ao segundo brawler que respondia ao mesmo inimigo era mesmo pagar duas
   * vezes pela mesma resposta, porque a taxa não dizia nada sobre o par.
   *
   * Com o delta publicado deixou de o ser. O delta é a vantagem medida daquele
   * par concreto: se o candidato ganha 6,2% contra o Bibi, ganha-os quer um
   * aliado também o counter quer não — a vantagem dele não desaparece por
   * existir outra. Descontá-la castigava precisamente os drafts com resposta
   * dupla, que é o oposto do que se quer.
   *
   * O que se mantém é a informação: `coveredCounterTargets` continua a dizer
   * quem já está coberto, para quem lê a auditoria decidir. O que se tinha de
   * corrigir era a incoerência — a auditoria anunciava um bónus suprimido que o
   * Score, esse, pagava na mesma.
   */
  const bonusCounterMatchups = isTop30CounterBonusEligible ? directCounters : [];
  const nonTop30CounterBonusTargets = !isTop30CounterBonusEligible
    ? directCounters.map((matchup) => matchup.defender)
    : [];
  // As relações literais publicadas por qualquer fonte auditada ativam o bónus.
  const effectiveCounter = directCounterSignal;
  const counterSignal = effectiveCounter ?? 0;
  // A base vem da fórmula por mapa 70% vitória agregada + 30% uso agregado
  // normalizado. `row.score` já é calculado na camada de ranking.
  const metaSignal = calculateDraftHybridScore(row, context.experimentalWeights);

  const rawBannedNames = Array.from(context.bannedNames ?? []);
  // Top 10 literal de counters do brawler: a lista "Counter with" publicada na
  // ficha dele. Um ban só conta como counter removido se estiver nesta lista —
  // um delta positivo residual não transforma um brawler qualquer num counter.
  const top10PositiveCounterKeys = new Set(
    sourceProfiles
      .filter(profile => profile.source === "BrawlScope" || profile.source === "PL Prodigy")
      .flatMap(profile => profile.counteredBy.slice(0, 10))
      .map(relation => counterKey(relation.brawler)),
  );
  const allBannedCounters = uniqueCounterNames(rawBannedNames).filter((banned) => top10PositiveCounterKeys.has(counterKey(banned)));
  const baseHybridTop25Keys = new Set(Array.from(context.baseHybridTop25Names ?? []).map(counterKey));
  const top25BannedCounters = allBannedCounters.filter((banned) =>
    baseHybridTop25Keys.has(counterKey(banned)) && top10PositiveCounterKeys.has(counterKey(banned)),
  );
  const bannedCounters = isTop30CounterBonusEligible ? top25BannedCounters : [];
  const nonTop30BannedCounters = !isTop30CounterBonusEligible ? top25BannedCounters : [];
  const nonTop25BannedCounters = allBannedCounters.filter((banned) => !baseHybridTop25Keys.has(counterKey(banned)));
  /**
   * Bans registados no draft e bans que não são counter deste candidato.
   *
   * Sem isto, a interface só conseguia falar do bónus quando ele acontecia. Um
   * bónus que exige duas condições e que fica calado quando falha parece
   * avariado — e a pergunta "tens a certeza de que o bónus de Ban funciona?"
   * não tinha resposta no ecrã, só no código. Expostos aqui para o cartão poder
   * dizer sempre o que os bans registados fizeram a ESTE candidato.
   */
  const registeredBans = uniqueCounterNames(rawBannedNames);
  const allBannedCounterKeys = new Set(allBannedCounters.map(counterKey));
  const bannedNonCounters = registeredBans.filter((banned) => !allBannedCounterKeys.has(counterKey(banned)));
  const selectedCandidateKeys = new Set([...allyRows, ...enemyRows].map((selectedRow) => counterKey(selectedRow.brawler)));
  const isAlreadyChosen = selectedCandidateKeys.has(counterKey(row.brawler));
  const topCounterWindowSize = getTopCounterWindowSize(context.pickNumber, context.completedPickCount);
  const activeTopCounterWindowNames = getActiveCounterWindowNames(
    context.counterPenaltyEligibleNames ?? context.topRecommendationNames,
    topCounterWindowSize,
  );
  // A janela dinâmica limita os *counters que provocam* Counter Top, e não o
  // candidato penalizado. Assim, um brawler fora do Top ainda recebe −3% por
  // cada counter literal seu que permaneça no Top ativo.
  const activeEnemyCounters = !isAlreadyChosen
    ? enemyRows
      .map((enemy) => enemy.brawler)
      .filter((enemy) => getDraftCounterDirection(row.brawler, enemy, context.reciprocalCounterScores, context.mapModeId) === "counteredBy")
    : [];
  // v168: a pressão por aliado também só conta com o adversário a 55% ou mais contra (ver `counterMinimo`).
  const counteradoPor = (quem: string, inimigo: string) => {
    if (ruleSettings.counterMinimo * 100 <= 50) return getDraftCounterDirection(quem, inimigo, context.reciprocalCounterScores, context.mapModeId) === "counteredBy";
    const { delta, percentagem } = percentagemDoConfronto(quem, inimigo, context.mapModeId);
    return avaliarConfronto(delta, percentagem, ruleSettings.counterMinimo * 100) === "desbonus";
  };
  const repeatedEnemyCounterPressures = isAlreadyChosen
    ? []
    : enemyRows
      .filter((enemy) => counteradoPor(row.brawler, enemy.brawler))
      .map((enemy) => {
        const counteredAllies = allyRows
          .map((ally) => ally.brawler)
          .filter((ally) => counteradoPor(ally, enemy.brawler));
        const count = Math.min(counteredAllies.length, 2);
        return {
          enemy: enemy.brawler,
          counteredAllies,
          rate: ruleSettings.repeatedEnemyCounterPressure * count,
        };
      })
      .filter((pressure) => pressure.counteredAllies.length > 0);
  const topTwentyCounters = !isAlreadyChosen
    ? activeTopCounterWindowNames
      .filter((candidate) => counterKey(candidate) !== counterKey(row.brawler))
      // A ficha do candidato tem a última palavra: uma relação literal publicada
      // na página do adversário não transforma em counter quem o próprio perfil
      // do candidato mostra como confronto favorável.
      .filter((candidate) => getMatchupValue(row.brawler, candidate, context.mapModeId).total < 0)
      .filter((candidate) => getLiteralCounterRelations(candidate, row.brawler, context.mapModeId).length > 0)
    : [];
	const usageRate = getDraftUsageRate(row) ?? 0;
  /**
   * O Fit no primeiro pick da equipa.
   *
   * Antes, com a equipa vazia, o Fit valia zero: não havia composição para
   * completar, e dar a mesma percentagem a toda a gente seria o mesmo que não
   * dar nada. O problema é que o Score ficava mudo exatamente onde a análise de
   * composição já dizia "começa por garantir a função prioritária do modo" — o
   * treinador aconselhava uma coisa e a pontuação ignorava-a.
   *
   * A correção não é remover a condição, é trocá-la. Sem aliados escolhidos
   * todas as funções estão por preencher, portanto o que separa os candidatos
   * não é a falta, é a prioridade da função NESSE modo. O Fit de abertura vale
   * a taxa configurada escalada por `roleObjectiveFit`: 1x para a função
   * prioritária do modo, 0,72x para a segunda, 0,48x para a restante. Numa
   * Brawl Ball a Lane recebe a taxa inteira; num Nocaute é o Flex. Continua a
   * diferenciar candidatos, continua a depender do mapa, e deixa de haver um
   * bónus que nunca dispara nos dois primeiros picks do draft.
   */
  const hasAllyPick = allyRows.length > 0;
  const sideLaneCount = allyRows.filter((ally) => inferDraftRole(ally.brawler) === "side").length;
  const teamNeedsMid = hasAllyPick ? !allyRows.some((ally) => inferDraftRole(ally.brawler) === "mid") : true;
  const teamNeedsSide = hasAllyPick ? sideLaneCount < 2 : true;
  const canFillMid = role === "mid" || role === "flex";
  const canFillSide = role === "side" || role === "flex";
  // Flex pode cobrir Mid ou Lane, mas a recomendação recebe apenas um Fit.
  // Quando ambos os slots estão livres, priorizamos Mid; quando Mid já está
  // coberto, Flex passa a preencher uma Side lane disponível.
  const hasMissingMid = canFillMid && teamNeedsMid;
  const hasMissingSide = !hasMissingMid && canFillSide && teamNeedsSide;
  const isOpeningFit = !hasAllyPick;
  /** 1 / 0,72 / 0,48 conforme a prioridade da função no modo; 1 depois do primeiro pick. */
  const openingFitWeight = isOpeningFit ? roleObjectiveFit(context.mapModeId, role) : 1;
  const effectiveMissingMidRate = ruleSettings.missingMid * openingFitWeight;
  const effectiveMissingSideRate = ruleSettings.missingSide * openingFitWeight;
  const fitRateLabel = (rate: number) => Number((rate * 100).toFixed(2));
  const isOpeningPick = (context.pickNumber ?? 0) >= 1 && (context.pickNumber ?? 0) <= 3;
  const hasOpeningLongRangeBonus = isOpeningPick && isOpeningLongRangeEligible(row.brawler);
  const counterBonusRate = getCounterBonusRate(context.pickNumber, ruleSettings);
  const counterBonusPick = getDraftPickNumber(context.pickNumber);
  const synergyBonusRate = getSynergyBonusRate(context.pickNumber, ruleSettings);
  const mapTeamSynergyRate = getMapTeamSynergyRate(context.pickNumber, ruleSettings);
  const synergyBonusPick = getDraftPickNumber(context.pickNumber);
  const banBonusRate = getBannedCounterBonusRate(context.pickNumber, ruleSettings);
  const banBonusPick = getBannedCounterBonusPick(context.pickNumber);
  const hybridPoints = metaSignal;
  /**
   * v168: um confronto só conta a partir de `counterMinimo` (55%), na mesma
   * percentagem que os duelos mostram — 50% + a diferença publicada. A favor,
   * o bónus só com 55% ou mais; contra, o desbónus só quando o adversário tem
   * 55% ou mais (o duelo em 45% ou menos). Entre os dois, não conta.
   */
  const minimoDoCounterPct = ruleSettings.counterMinimo * 100;
  // Cada confronto com a percentagem que o ecrã mostra e se conta — o que a dica do cartão lista.
  const confrontosAvaliados = !isAlreadyChosen
    ? enemyRows.map((enemy) => {
      const { delta, percentagem } = percentagemDoConfronto(row.brawler, enemy.brawler, context.mapModeId);
      return { inimigo: enemy.brawler, delta, percentagem, conta: avaliarConfronto(delta, percentagem, minimoDoCounterPct) };
    })
    : [];
  const enemyDeltaPairs = confrontosAvaliados
    .filter((confronto) => confronto.conta !== "nao")
    .map((confronto) => ({ enemy: confronto.inimigo, delta: confronto.delta }));
  /**
   * A regra opcional "resposta já coberta".
   *
   * Ligada, um inimigo que já tem resposta a sério de um aliado deixa de pagar
   * bónus ao candidato seguinte: a resposta já está no tabuleiro, e pagá-la
   * outra vez é contar duas vezes a mesma solução.
   *
   * A excepção é o que impede a regra de se virar contra quem a liga: um
   * candidato que responde a DOIS ou mais inimigos mantém tudo. Esse não está a
   * repetir a resposta do aliado — está a cobrir uma frente que mais ninguém
   * cobre, e é precisamente a escolha que o Draft devia premiar.
   *
   * Conta-se por inimigos respondidos, não por deltas positivos: o que faz de
   * alguém uma resposta dupla é enfrentar dois inimigos, não somar dois números.
   */
  const suppressionLigada = ruleSettings.coveredCounterSuppression >= 0.5;
  const inimigosRespondidos = enemyDeltaPairs.filter((par) => par.delta > 0).length;
  const respostaMultipla = inimigosRespondidos >= 2;
  const suppressedCounterTargets = suppressionLigada && !respostaMultipla
    ? enemyDeltaPairs.filter((par) => par.delta > 0 && fullyCoveredKeys.has(counterKey(par.enemy))).map((par) => par.enemy)
    : [];
  const suppressedKeys = new Set(suppressedCounterTargets.map(counterKey));
  const brawlScopeEnemyDeltas = enemyDeltaPairs
    .filter((par) => !suppressedKeys.has(counterKey(par.enemy)))
    .map((par) => par.delta);
  // O ajuste configurável multiplica a percentagem publicada do confronto: 1
  // mantém o delta da fonte, 2 duplica, 3 triplica, 0,5 reduz para metade.
  /**
   * O ajuste é lido pelo pick em curso, não por um valor único. Um counter
   * escolhido às cegas no primeiro pick e um counter definitivo no sexto podem
   * agora pesar de forma diferente, se quem configura assim o entender.
   */
  const counterPickMultiplier = getCounterPickMultiplier(counterBonusPick, ruleSettings);
  const counterDeltaRate = brawlScopeEnemyDeltas.reduce((sum, delta) => sum + delta / 100, 0) * counterPickMultiplier;
  const counterPoints = counterDeltaRate ? hybridPoints * counterDeltaRate : 0;
  const missingMidPoints = hasMissingMid ? hybridPoints * effectiveMissingMidRate : 0;
  const missingSidePoints = hasMissingSide ? hybridPoints * effectiveMissingSideRate : 0;
  const banPoints = bannedCounters.length
    ? hybridPoints * banBonusRate * bannedCounters.length
    : 0;
  const openingLongRangePoints = hasOpeningLongRangeBonus ? hybridPoints * ruleSettings.openingLongRange : 0;
  // A fonte publica uma percentagem por par ("Pair with · Shade +11,6"). Quando
  // ela existe, é ela que vale no Score: +11,6 na ficha = +11,6% no Draft, somando
  // os aliados já escolhidos. Sem percentagem publicada, mantém-se a taxa por pick
  // configurada nas regras.
  const publishedSynergyRate = activeSynergyRelations.reduce(
    (sum, relation) => (typeof relation.delta === "number" && Number.isFinite(relation.delta) ? sum + relation.delta / 100 : sum),
    0,
  );
  const hasPublishedSynergyRate = activeSynergyRelations.some(relation => typeof relation.delta === "number" && Number.isFinite(relation.delta));
  /**
   * Em «Só API oficial», a sinergia é a das partidas: quanto o candidato ganha
   * a mais ao lado de cada aliado já escolhido, neste mapa. Pode ser negativa —
   * é a anti-sinergia, e aí tira pontos.
   */
  const sinergiasDaApi = soApi
    ? allyRows.map((ally) => ({ aliado: ally.brawler, delta: sinergiaObservada(row.brawler, ally.brawler) }))
      .filter((par): par is { aliado: string; delta: number } => par.delta !== null && par.delta !== 0)
      // v168: só o par que ganha mais neste mapa do que ele sozinho neste mapa.
      .filter((par) => !sinergiaSoAcima || par.delta > 0)
    : [];
  const taxaDeSinergiaDaApi = sinergiasDaApi.reduce((soma, par) => soma + par.delta / 100, 0);
  // Cada dupla com o valor e se conta — o que a dica do cartão lista.
  const duplasAvaliadas = allyRows.map((ally) => {
    if (soApi) {
      const delta = sinergiaObservada(row.brawler, ally.brawler);
      return { aliado: ally.brawler, delta, fonte: "API" as const, conta: sinergiasDaApi.some((par) => par.aliado === ally.brawler) };
    }
    const relacao = [...brawlScopeSynergyTeammates, ...(brawlPlanetProfile?.bestTeammates ?? [])].find((relation) => counterKey(relation.brawler) === counterKey(ally.brawler));
    return {
      aliado: ally.brawler,
      delta: typeof relacao?.delta === "number" ? relacao.delta : null,
      fonte: relacao?.source ?? null,
      conta: hasSynergy && aliadosDaSinergia.some((nome) => counterKey(nome) === counterKey(ally.brawler)),
    };
  });
  const effectiveSynergyRate = soApi ? taxaDeSinergiaDaApi : hasPublishedSynergyRate ? publishedSynergyRate : synergyBonusRate;
  const synergyPoints = soApi
    ? hybridPoints * taxaDeSinergiaDaApi
    : hasSynergy ? hybridPoints * effectiveSynergyRate : 0;
  const mapTeamSynergyPoints = hasMapTeamSynergy ? hybridPoints * mapTeamSynergyRate : 0;
  const enemyCounterDeltaRate = 0;
  const enemyCounterPenaltyPoints = 0;
  const enemyCounterPenaltyPercent = 0;
  const repeatedEnemyCounterPressurePoints = repeatedEnemyCounterPressures.length && ruleSettings.desbonusPressaoPorAliado >= 0.5
    ? hybridPoints * repeatedEnemyCounterPressures.reduce((sum, pressure) => sum + pressure.rate, 0)
    : 0;
  const repeatedEnemyCounterPressurePercent = Math.round(repeatedEnemyCounterPressures.reduce((sum, pressure) => sum + pressure.rate, 0) * 100);
  // Counter Top continua auditável como risco literal do mapa, mas não altera
  // o Score. Penalizar counters apenas possíveis antes de haver picks inimigos
  // reais reordenava o ranking base em dezenas de pontos. Counter direto e
  // Pressão Inimiga continuam a aplicar-se depois de picks reais.
  const topTwentyCounterPenaltyPoints = 0;
  const topTwentyCounterPenaltyPercent = 0;

  // Desbônus de -5% quando o meu time já escolheu um brawler da mesma classe (aplicado apenas quando há repetição explícita de classe no time aliado)
  const candidateClass = getBrawlerClass(row.brawler);
  const sameClassTriggerAllies = allyRows
    .map((r) => r.brawler)
    .filter((bName) => getBrawlerClass(bName) === candidateClass);
  const sameClassCount = sameClassTriggerAllies.length;
  // Os dois desbónus podem ser desligados nas regras, sem perder a percentagem guardada.
  const sameClassPenaltyPoints = sameClassCount > 0 && ruleSettings.desbonusMesmaClasse >= 0.5 ? hybridPoints * ruleSettings.sameClassPenalty * sameClassCount : 0;
  const worstTeammatePenaltyPoints = activeWorstTeammates.length && ruleSettings.desbonusWorstTeammate >= 0.5
    ? hybridPoints * ruleSettings.worstTeammatePenalty * activeWorstTeammates.length
    : 0;

  const rawContextualBonusPoints = Math.max(0, counterPoints) + missingMidPoints + missingSidePoints + banPoints + openingLongRangePoints + Math.max(0, synergyPoints) + mapTeamSynergyPoints;
  const rawContextualPenaltyPoints = Math.max(0, -counterPoints) + Math.max(0, -synergyPoints) + enemyCounterPenaltyPoints + repeatedEnemyCounterPressurePoints + topTwentyCounterPenaltyPoints + sameClassPenaltyPoints + worstTeammatePenaltyPoints;
	// Sem tecto: o ajuste é a soma dos fatores ativos, tal como o cartão os lista.
	const contextualAdjustment = rawContextualBonusPoints - rawContextualPenaltyPoints;
	const draftScore = hybridPoints + contextualAdjustment;
	const activeBonuses = includePresentation ? [
    ...(counterPoints ? [`Counter ${counterDeltaRate > 0 ? "+" : ""}${Number((counterDeltaRate * 100).toFixed(2))}% (${brawlScopeEnemyDeltas.length} matchup${brawlScopeEnemyDeltas.length === 1 ? "" : "s"} · ${soApi ? "partidas da API oficial neste mapa" : "delta BrawlScope"}${counterPickMultiplier === 1 ? "" : ` × ${counterPickMultiplier}`})`] : []),
    ...(nonTop30CounterBonusTargets.length ? [`Counter fora do Top 30 · 0% (${row.brawler} não recebe bónus de Counter de Pick neste mapa)`] : []),
    ...(suppressedCounterTargets.length
      ? [`Resposta já coberta · bónus retirado (${fullyCoveredTargets.filter((coverage) => suppressedCounterTargets.includes(coverage.enemy)).map((coverage) => `${coverage.enemy} já respondido por ${coverage.allies.join(", ")}`).join(" · ")})`]
      : coveredCounterTargets.length ? [`Resposta já coberta · bónus mantido (${coveredCounterTargets.map((coverage) => `${coverage.enemy} também counterado por ${coverage.allies.join(", ")}`).join(" · ")})`] : []),
    ...(missingMidPoints ? [isOpeningFit ? `Fit de abertura +${fitRateLabel(effectiveMissingMidRate)}%` : role === "flex" ? `Fit Mid/Lane +${ruleSettings.missingMid * 100}%` : `Mid em falta +${ruleSettings.missingMid * 100}%`] : []),
    ...(missingSidePoints ? [isOpeningFit ? `Fit de abertura +${fitRateLabel(effectiveMissingSideRate)}%` : role === "flex" ? `Fit Mid/Lane +${ruleSettings.missingSide * 100}%` : `Lane em falta +${ruleSettings.missingSide * 100}%`] : []),
    ...(banPoints ? [`Counter banido +${banBonusRate * 100 * bannedCounters.length}% (${bannedCounters.length} counter${bannedCounters.length === 1 ? "" : "s"} · Top 10 de counters (BrawlScope / PL Prodigy) + Top 25 do mapa · pick ${banBonusPick}: +${banBonusRate * 100}% por counter)`] : []),
    ...(nonTop30BannedCounters.length ? [`Counter banido fora do Top 30 · 0% (${row.brawler} não recebe bónus de Counter de Ban neste mapa)`] : []),
    ...(nonTop25BannedCounters.length ? [`Counter banido sem bónus · 0% (${nonTop25BannedCounters.join(", ")} está fora do Top 25 do mapa)`] : []),
    ...(openingLongRangePoints ? [`Alcance ≥${openingRangeThreshold} blocos +${ruleSettings.openingLongRange * 100}% (pick ${context.pickNumber})`] : []),
    ...(mapTeamSynergyPoints && mapTeamSynergy ? [`Composição do mapa +${mapTeamSynergyRate * 100}% (pick ${synergyBonusPick} · ${mapTeamSynergy.brawlers.join(" · ")} · ${mapTeamSynergy.winRate.toFixed(1)}% WR)`] : []),
    ...(soApi && synergyPoints ? [`${synergyPoints > 0 ? "Sinergia" : "Anti-sinergia"} ${synergyPoints > 0 ? "+" : ""}${Number((taxaDeSinergiaDaApi * 100).toFixed(2))}% (partidas da API oficial · ${sinergiasDaApi.map((par) => `${par.aliado} ${par.delta > 0 ? "+" : ""}${par.delta}`).join(", ")})`] : []),
    ...(!soApi && synergyPoints ? [`${synergySource === "BrawlScope" ? "Sinergia BrawlScope" : "Best Teammate"} ${effectiveSynergyRate > 0 ? "+" : ""}${Number((effectiveSynergyRate * 100).toFixed(2))}% (${hasPublishedSynergyRate ? "percentagem publicada" : `pick ${synergyBonusPick}`} · ${aliadosDaSinergia.join(", ")})`] : []),
    ...(enemyCounterPenaltyPoints ? [`Desbônus Enemy Counter -${enemyCounterPenaltyPercent}% (${activeEnemyCounters.length} counter${activeEnemyCounters.length === 1 ? "" : "s"})`] : []),
    ...(repeatedEnemyCounterPressurePoints ? [`Pressão Enemy Counter -${repeatedEnemyCounterPressurePercent}% (${repeatedEnemyCounterPressures.map((pressure) => `${pressure.enemy}: ${pressure.counteredAllies.join(", ")}`).join(" · ")})`] : []),
    ...(topTwentyCounterPenaltyPoints ? [`Desbônus Counter no Top ${topCounterWindowSize} -${topTwentyCounterPenaltyPercent}% (${topTwentyCounters.length} counter${topTwentyCounters.length === 1 ? "" : "s"}: ${topTwentyCounters.join(", ")})`] : []),
    ...(sameClassPenaltyPoints ? [`Desbônus Mesma Classe (${candidateClass}) -${ruleSettings.sameClassPenalty * 100 * sameClassCount}% — ativado por ${sameClassTriggerAllies.join(", ")}`] : []),
    ...(worstTeammatePenaltyPoints ? [`Worst Teammate -${ruleSettings.worstTeammatePenalty * 100 * activeWorstTeammates.length}% (${activeWorstTeammates.join(", ")})`] : []),
  ] : [];
  // Mantido como alias transitório para contratos existentes do Draft.
  const coachScore = draftScore;
  const counterMatchups = brawlScopeMatchups.length ? brawlScopeMatchups : directCounters;
  const positionRecommendation = getPositionRecommendation(row.brawler, enemyRows);
  const reasons: string[] = [];
  if (includePresentation) {
  const lowerName = row.brawler.toLowerCase();
  const hasTankPressure = enemyRows.some((enemy) => ["frank", "bull", "rosa", "jacky", "buster", "el primo", "meg", "ash", "hank"].includes(enemy.brawler.toLowerCase()));
  const hasSniperPressure = enemyRows.some((enemy) => ["piper", "belle", "nani", "angelo", "mandy", "byron", "brock"].includes(enemy.brawler.toLowerCase()));
  const idealPositionLabel = positionRecommendation.position === "mid"
    ? "Mid"
    : positionRecommendation.position === "left"
      ? "Lane esquerda"
      : "Lane direita";
  const assignedLane = role === "flex"
    ? `Flex de adaptação — posição ideal: ${idealPositionLabel}`
    : `${idealPositionLabel} (posição ideal)`;
  const matchupAdvice = hasTankPressure
    ? "Posiciona-te para punir tanques e manter distância de segurança."
    : hasSniperPressure
    ? "Usa cobertura lateral para evitar o ângulo de fogo inimigo e forçar troca desfavorável."
    : "Garante o controlo de corredor e pressão constante no objetivo.";

  if (lowerName.includes("griff")) {
    reasons.push(hasTankPressure ? "Counter direto de tanques (como Frank, Bull ou Meg): derrete a vida inimiga de perto." : "Excelente controlo de área e abertura de cobertura com o Super contra snipers e controladores.");
  } else if (lowerName.includes("colt") || lowerName.includes("piper") || lowerName.includes("nani") || lowerName.includes("angelo")) {
    reasons.push(hasSniperPressure ? "Duelo de longo alcance: vence trocas de mira e pune alvos parados no mid." : "Controlo de linha de visão com alto dano explosivo para abates rápidos.");
  } else if (lowerName.includes("mico") || lowerName.includes("edgar") || lowerName.includes("mortis") || lowerName.includes("buzz")) {
    reasons.push("Dive / Assassino: ignora a linha de frente e elimina a retaguarda inimiga (snipers/throwers).");
  } else if (lowerName.includes("shelly") || lowerName.includes("bull") || lowerName.includes("rosa") || lowerName.includes("jacky")) {
    reasons.push("Controlo territorial e pressão de proximidade para dominar o centro do mapa.");
  } else {
    reasons.push(`Perfil ${assignedLane}: ${matchupAdvice}`);
  }

  if (counterPoints) reasons.unshift(`Counter ${counterDeltaRate > 0 ? "+" : ""}${Number((counterDeltaRate * 100).toFixed(2))}%${counterPickMultiplier === 1 ? "" : ` (delta publicado × ${counterPickMultiplier})`}: ${brawlScopeMatchups.map(matchup => `${row.brawler} vs ${matchup.defender}: ${matchup.note}`).join("; ")}.`);
  if (nonTop30CounterBonusTargets.length) {
    reasons.push(`Counter sem bónus: ${row.brawler} está fora do Top 30 por Score Híbrido base deste mapa; os matchups contra ${nonTop30CounterBonusTargets.join(", ")} continuam visíveis, mas não recebem bónus de Counter de Pick.`);
  }
  if (bannedCounters.length) {
    reasons.push(`Bónus Counter banido +${banBonusRate * 100 * bannedCounters.length}% (${bannedCounters.length} counter${bannedCounters.length === 1 ? "" : "s"} · Top 10 de counters (BrawlScope / PL Prodigy) + Top 25 do mapa · pick ${banBonusPick}: +${banBonusRate * 100}% por counter): ${bannedCounters.join(", ")} ${bannedCounters.length === 1 ? "é um counter direto banido que cumpre" : "são counters diretos banidos que cumprem"} as duas condições.`);
  }
  if (nonTop30BannedCounters.length) {
    reasons.push(`Counter banido sem bónus: ${row.brawler} está fora do Top 30 por Score Híbrido base deste mapa; ${nonTop30BannedCounters.join(", ")} está no Top 25, mas não ativa bónus de Counter de Ban.`);
  }
  if (nonTop25BannedCounters.length) {
    reasons.push(`Counter banido sem bónus: ${nonTop25BannedCounters.join(", ")} ${nonTop25BannedCounters.length === 1 ? "é counter literal" : "são counters literais"} de ${row.brawler}, mas ${nonTop25BannedCounters.length === 1 ? "está" : "estão"} fora do Top 25 de Score Híbrido base do mapa.`);
  }
  if (missingMidPoints) reasons.push(isOpeningFit
    ? `Bónus Fit de abertura +${fitRateLabel(effectiveMissingMidRate)}%: primeiro pick da equipa, toda a estrutura está por preencher. A taxa base de ${ruleSettings.missingMid * 100}% é escalada pela prioridade de ${role.toUpperCase()} neste modo (${Math.round(openingFitWeight * 100)}%).`
    : role === "flex"
    ? `Bónus Fit Mid/Lane +${ruleSettings.missingMid * 100}%: este Flex cobre o Mid em falta; recebe somente um Fit, sem duplicar a Lane.`
    : `Bónus Mid em falta +${ruleSettings.missingMid * 100}%: a equipa ainda não tem um Mid e esta recomendação preenche essa função.`);
  if (missingSidePoints) reasons.push(isOpeningFit
    ? `Bónus Fit de abertura +${fitRateLabel(effectiveMissingSideRate)}%: primeiro pick da equipa, toda a estrutura está por preencher. A taxa base de ${ruleSettings.missingSide * 100}% é escalada pela prioridade de ${role.toUpperCase()} neste modo (${Math.round(openingFitWeight * 100)}%).`
    : role === "flex"
    ? `Bónus Fit Mid/Lane +${ruleSettings.missingSide * 100}%: este Flex cobre uma Lane disponível (${sideLaneCount}/2); recebe somente um Fit.`
    : `Bónus Lane em falta +${ruleSettings.missingSide * 100}%: a equipa tem ${sideLaneCount}/2 Lanes e esta recomendação preenche uma lane disponível.`);
  if (openingLongRangePoints) reasons.push(`Bónus de abertura +${ruleSettings.openingLongRange * 100}%: ataque principal de ${openingRangeThreshold} blocos ou mais no pick ${context.pickNumber}. Lançadores não recebem este bónus.`);
  if (mapTeamSynergyPoints && mapTeamSynergy) reasons.push(`Bónus Composição do mapa +${mapTeamSynergyRate * 100}% (pick ${synergyBonusPick}): ${mapTeamSynergy.brawlers.join(" · ")} é uma equipa literal do Brawl Planet para ${mapTeamSynergy.map}, com ${mapTeamSynergy.winRate.toFixed(1)}% de Win Rate. Fonte: ${mapTeamSynergy.sourceUrl}`);
  if (synergyPoints) {
    const synergyDetail = activeSynergyRelations
      .map((relation) => `${relation.brawler}${typeof relation.delta === "number" ? ` ${relation.delta > 0 ? "+" : ""}${relation.delta}%` : ""}`)
      .join(", ") || aliadosDaSinergia.join(", ");
    const rateLabel = `${effectiveSynergyRate > 0 ? "+" : ""}${Number((effectiveSynergyRate * 100).toFixed(2))}%`;
    reasons.push(synergySource === "BrawlScope"
      ? `Bónus Sinergia BrawlScope ${rateLabel} (${hasPublishedSynergyRate ? "percentagem publicada na ficha" : `taxa do pick ${synergyBonusPick}`}): ${synergyDetail} consta no Top ${brawlScopeSynergyTeammates.length} literal de aliados ("Pair with") publicado pelo BrawlScope para ${row.brawler}.${synergySourceUrl ? ` Fonte: ${synergySourceUrl}` : ""}`
      : `Bónus Best Teammate ${rateLabel} (${hasPublishedSynergyRate ? "percentagem publicada na ficha" : `taxa do pick ${synergyBonusPick}`}): ${synergyDetail} consta na lista literal de melhores aliados do Brawl Planet para ${row.brawler}.`);
  }
  if (enemyCounterPenaltyPoints) {
    reasons.push(`Desbônus Inimigo Counter -${enemyCounterPenaltyPercent}% (${activeEnemyCounters.length} counter${activeEnemyCounters.length === 1 ? "" : "s"}): ${activeEnemyCounters.join(", ")} ${activeEnemyCounters.length === 1 ? "é" : "são"} counters ativos na equipa adversária.`);
  }
  if (repeatedEnemyCounterPressurePoints) {
    reasons.push(`Pressão Enemy Counter -${repeatedEnemyCounterPressurePercent}%: ${repeatedEnemyCounterPressures.map((pressure) => `${pressure.enemy} também countera ${pressure.counteredAllies.join(", ")} no teu time (+${pressure.rate * 100}% de pressão)`).join(" · ")}.`);
  }
  if (topTwentyCounterPenaltyPoints) {
    reasons.push(`Desbônus Counter no Top ${topCounterWindowSize} -${topTwentyCounterPenaltyPercent}%: ${topTwentyCounters.join(", ")} ${topTwentyCounters.length === 1 ? "é" : "são"} counter${topTwentyCounters.length === 1 ? "" : "s"} literal${topTwentyCounters.length === 1 ? "" : "is"} de ${row.brawler} e ${topTwentyCounters.length === 1 ? "está" : "estão"} entre as ${topCounterWindowSize} recomendações contextuais deste pick.`);
  }
  if (sameClassPenaltyPoints) {
    reasons.push(`Desbônus Mesma Classe (${candidateClass}) -${ruleSettings.sameClassPenalty * 100 * sameClassCount}%: ativado por ${sameClassTriggerAllies.join(", ")} no teu time. Bans não entram neste cálculo.`);
  }
  if (worstTeammatePenaltyPoints) {
    reasons.push(`Desbônus Worst Teammate -${ruleSettings.worstTeammatePenalty * 100 * activeWorstTeammates.length}%: ${activeWorstTeammates.join(", ")} ${activeWorstTeammates.length === 1 ? "é aliado identificado" : "são aliados identificados"} pelo Brawl Planet como combinação negativa para ${row.brawler}.`);
  }
  reasons.push(`Base híbrida: ${hybridPoints.toFixed(2)} pts. Bónus ativos: ${activeBonuses.length ? activeBonuses.join(" · ") : "nenhum"}. Total: ${draftScore.toFixed(2)} pts.`);
  if (coverage < 0.5) {
    reasons.push("Nota: confiança ajustada por amostragem parcial nas fontes web.");
  }
  }

  const confidence = Math.round(clamp(coverage * 64 + (enemyRows.length ? 20 : 12) + (allyRows.length ? 16 : 0)));
  let decisionType: "Seguro" | "Resposta" | "Win Condition" | "Flex" = "Seguro";
  if (directCounters.length) decisionType = "Resposta";
  else if (fit >= 78 && winRate >= 56) decisionType = "Win Condition";
  else if (role === "flex") decisionType = "Flex";

  return {
    score: coachScore,
    role,
    roleFit,
    coverage,
    synergy,
    winRate,
    fit,
    usageRate,
    counter: effectiveCounter,
    metaSignal,
    banRate,
    draftScore,
	  scoreBreakdown: {
	    hybridScore: metaSignal,
	    hybridPoints,
	    counterPoints,
      counterBonusRate,
      counterBonusPick,
      counterPickMultiplier,
      isTop30CounterBonusEligible,
      missingMidPoints,
      missingSidePoints,
      banPoints,
      banBonusRate,
      banBonusPick,
      openingLongRangePoints,
      synergyPoints,
      synergyBonusRate: effectiveSynergyRate,
      configuredSynergyBonusRate: synergyBonusRate,
      hasPublishedSynergyRate,
      synergyBonusPick,
	      mapTeamSynergyPoints,
	      enemyCounterPenaltyPoints,
	      enemyCounterPenaltyPercent,
	      repeatedEnemyCounterPressurePoints,
      topTwentyCounterPenaltyPoints,
	      topCounterWindowSize,
	      sameClassPenaltyPoints,
	      worstTeammatePenaltyPoints,
	      rawContextualBonusPoints,
	      rawContextualPenaltyPoints,
	      contextualAdjustment,
      activeBonuses,
    },
    coachScore,
    confidence,
    reasons,
    decisionType,
    position: positionRecommendation.position,
    positionAdvice: positionRecommendation.advice,
    counterMatchups,
	  bannedCounterCount: bannedCounters.length,
	  bonusSources: {
	    counterTargets: directCounters.filter(matchup => matchup.counterDelta > 0).map((matchup) => matchup.defender),
      counterBonusTargets: bonusCounterMatchups.map((matchup) => matchup.defender),
      nonTop30CounterBonusTargets,
      nonTop30BannedCounters,
      coveredCounterTargets,
      fullyCoveredTargets,
      suppressedCounterTargets,
      nonTop25BannedCounters,
      bannedCounters,
      registeredBans,
      bannedNonCounters,
      synergyAllies: aliadosDaSinergia,
      synergySource: synergySource ?? undefined,
      synergySourceUrl: synergySource ? synergySourceUrl : undefined,
      brawlScopeSynergyTop: brawlScopeSynergyTeammates.map((relation) => relation.brawler),
      brawlScopeSynergyAllies: activeBrawlScopeSynergyAllies,
      synergyDetails: synergySource
        ? activeSynergyRelations.map((relation) => ({ brawler: relation.brawler, delta: relation.delta, source: synergySource }))
        : [],
      mapTeamSynergy: mapTeamSynergy ?? undefined,
      mapTeamBoard: mapTeamBoard.length ? mapTeamBoard : undefined,
      enemyCounters: activeEnemyCounters,
      repeatedEnemyCounterPressures,
      topTwentyCounters,
      sameClassPenalties: sameClassTriggerAllies,
      confrontosAvaliados,
      duplasAvaliadas,
      minimoDoCounterPct,
      sameClassClass: candidateClass,
      worstTeammatePenalties: activeWorstTeammates,
    },
  };
}

function enemyRowsPressure(enemyWin: number | null, enemyPick: number | null) {
  return ((enemyWin ?? 50) / 100) * 0.5 + ((enemyPick ?? 0) / 100) * 0.5;
}

export type RankedDraftEntry<T extends DraftRow = DraftRow> = {
  row: T;
  /** Score contextual interno. Mantém a ordenação e a resolução de counters recíprocos. */
  draftScore: number;
  /** Base normalizada: o melhor Score Híbrido disponível no mapa é 100. */
  basePoints: number;
  /** Base normalizada depois de todos os bónus e desbónus percentuais ativos. */
  finalPoints: number;
  signal: DraftSignal;
  rank: number;
  /** Com o motor PL Prodigy ou MetaPick: de onde vieram os pontos finais. */
  motor?: { nome: MotorDoDraft; partes: Array<{ nome: string; valor: number }>; contexto?: ContextoDoMotor };
};

function rankEntriesWithCounterWindow<T extends DraftRow>(
  eligibleRows: T[],
  context: DraftRankingContext<T>,
  topRecommendationNames: string[],
  counterPenaltyEligibleNames: string[] = topRecommendationNames,
  includePresentation = true,
) {
  const eligibleKeys = new Set(eligibleRows.map((row) => counterKey(row.brawler)));
  // Em produção, picks inimigos estão bloqueados e não aparecem em eligibleRows.
  // Ignoramos sobreposições artificiais de fixtures para preservar o contrato de
  // que um candidato é sempre calculado pela perspetiva do seu próprio time.
  const enemyKeys = new Set((context.enemyRows ?? [])
    .map((row) => counterKey(row.brawler))
    .filter((key) => !eligibleKeys.has(key)));
  const allRowsByKey = new Map<string, T>();
  [...eligibleRows, ...(context.allyRows ?? []), ...(context.enemyRows ?? [])]
    .forEach((row) => allRowsByKey.set(counterKey(row.brawler), row));
  const scoreRows = Array.from(allRowsByKey.values());
  const enemyPerspective = {
    ...context,
    allyRows: context.enemyRows,
    enemyRows: context.allyRows,
  } as DraftRankingContext<T>;
  const calculatePass = (reciprocalCounterScores?: ReadonlyMap<string, number>) => {
    const byKey = new Map(scoreRows.map((row) => {
      const perspective = enemyKeys.has(counterKey(row.brawler)) ? enemyPerspective : context;
      const signal = calculateDraftSignal(row, {
        ...perspective,
        topRecommendationNames,
        counterPenaltyEligibleNames,
        reciprocalCounterScores,
      }, includePresentation);
      return [counterKey(row.brawler), { row, draftScore: signal.draftScore, signal }] as const;
    }));
    const eligibleEntries = eligibleRows
      .map((row) => byKey.get(counterKey(row.brawler)))
      .filter((entry): entry is { row: T; draftScore: number; signal: DraftSignal } => Boolean(entry))
      .sort((a, b) => b.draftScore - a.draftScore || (b.row.score ?? -1) - (a.row.score ?? -1));
    return { eligibleEntries, allEntries: Array.from(byKey.values()) };
  };

  const scoresFor = (entries: Array<{ row: T; draftScore: number }>) => new Map(
    entries.map((entry) => [counterKey(entry.row.brawler), entry.draftScore]),
  );
  const signatureFor = (entries: Array<{ row: T; draftScore: number }>) => entries
    .map((entry) => `${counterKey(entry.row.brawler)}:${Math.round(entry.draftScore * 10)}`)
    .sort()
    .join("|");

  // A passagem zero ignora reciprocidades. Nas passagens seguintes, a direção
  // A→B ou B→A é decidida pelo Score de Draft recém-calculado. Se o vector de
  // scores voltar a repetir, a relação é neutra nesta resolução — nunca há
  // oscilação visual entre dois brawlers a cada render ou a cada pick.
  const neutralPass = calculatePass();
  const neutralEntries = neutralPass.eligibleEntries;
  let passResult = neutralPass;
  let entries = passResult.eligibleEntries;
  const seen = new Set<string>([signatureFor(passResult.allEntries)]);
  for (let pass = 0; pass < 4; pass += 1) {
    const nextResult = calculatePass(scoresFor(passResult.allEntries));
    const nextEntries = nextResult.eligibleEntries;
    const signature = signatureFor(nextResult.allEntries);
    if (signature === signatureFor(passResult.allEntries)) return nextEntries;
    if (seen.has(signature)) return neutralEntries;
    seen.add(signature);
    passResult = nextResult;
    entries = nextEntries;
  }
  return entries;
}

/**
 * Produz a única janela contextual do Draft. O tamanho depende só dos picks
 * concluídos: 20 → 16 → 12 → 8 → 4 → 0. A referência é calculada com todos
 * os outros sinais do Draft e, depois, é usada integralmente pelo Counter Top.
 * Não existe uma segunda lista capaz de ocultar um counter que aparece aqui.
 */

export type DraftCounterWindow = {
  topRecommendationNames: string[];
  counterPenaltyEligibleNames: string[];
};

function resolveActiveCounterWindow<T extends DraftRow>(eligibleRows: T[], context: DraftRankingContext<T>): DraftCounterWindow {
  const topCounterWindowSize = getTopCounterWindowSize(context.pickNumber, context.completedPickCount);
  if (topCounterWindowSize <= 0 || eligibleRows.length === 0) {
    return { topRecommendationNames: [], counterPenaltyEligibleNames: [] };
  }

  // Esta referência é calculada sem Counter Top e fica congelada até mudar um
  // pick, ban ou outro sinal externo do Draft. Por isso, Counter Top nunca
  // muda o próprio Top que o alimenta: não há ciclos em que uma penalização
  // expulsa um nome, inclui outro e recalcula indefinidamente.
  const baselineContext = { ...context, topRecommendationNames: undefined, counterPenaltyEligibleNames: undefined } as DraftRankingContext<T>;
  const topRecommendationNames = rankEntriesWithCounterWindow(eligibleRows, baselineContext, [], [], false)
    .slice(0, topCounterWindowSize)
    .map((entry) => entry.row.brawler);
  return {
    topRecommendationNames,
    counterPenaltyEligibleNames: topRecommendationNames,
  };
}

export function getDraftCounterWindow<T extends DraftRow>(rows: T[], lockedNames: Set<string>, query = "", context: DraftRankingContext<T> = {}) {
  // Pesquisa e filtro de função são somente visuais. A janela Counter Top
  // nunca pode ser recalculada a partir de uma lista filtrada (por exemplo,
  // pesquisar "glo" não pode transformar Glowy em Top 20).
  void query;
  const eligibleRows = [...rows]
    .filter((row) => !lockedNames.has(row.brawler));
  return resolveActiveCounterWindow(eligibleRows, { ...context, popularityRows: context.popularityRows ?? rows });
}

export function getDraftTopRecommendationNames<T extends DraftRow>(rows: T[], lockedNames: Set<string>, query = "", context: DraftRankingContext<T> = {}) {
  return getDraftCounterWindow(rows, lockedNames, query, context).topRecommendationNames;
}

export function rankDraftEntries<T extends DraftRow>(rows: T[], lockedNames: Set<string>, query = "", _tier: DraftTier = "Todos", context: DraftRankingContext<T> = {}): RankedDraftEntry<T>[] {
  // Todas as leituras de confronto desta ordenação usam a mesma regra das fichas.
  // Só quando a regra vem dita: a interface passa sempre as regras completas, e
  // uma chamada sem ela não pode desfazer o que o painel escolheu.
  if (typeof context.ruleSettings?.lerAsDuasFichas === "number") {
    definirLeituraDasDuasFichas(context.ruleSettings.lerAsDuasFichas >= 0.5);
  }
  const normalizedQuery = query.trim().toLowerCase();
  const globalEligibleRows = [...rows]
    .filter((row) => !lockedNames.has(row.brawler));
  const eligibleRows = globalEligibleRows
    .filter((row) => !normalizedQuery || row.brawler.toLowerCase().includes(normalizedQuery))
    .filter((row) => !context.role || context.role === "Todas" || inferDraftRole(row.brawler) === context.role || inferDraftRole(row.brawler) === "flex");
  // A UI fornece a mesma resolução para todas as superfícies. Chamadas sem
  // contexto recebem a janela global completa, nunca a lista filtrada por pesquisa.
  const rankingContext = { ...context, popularityRows: context.popularityRows ?? rows } as DraftRankingContext<T>;
  const resolvedWindow = rankingContext.topRecommendationNames
    ? {
      topRecommendationNames: Array.from(rankingContext.topRecommendationNames),
      counterPenaltyEligibleNames: Array.from(rankingContext.counterPenaltyEligibleNames ?? rankingContext.topRecommendationNames),
    }
    : resolveActiveCounterWindow(globalEligibleRows, rankingContext);
  // Pontos Base são uma referência imutável do mapa. Bans e picks removem
  // candidatos da recomendação, mas nunca podem tornar automaticamente o
  // novo líder disponível em 100 pontos.
  const maxHybridScore = getDraftMaximumHybridScore(rows, context.experimentalWeights);
  const doHibrido: RankedDraftEntry<T>[] = rankEntriesWithCounterWindow(eligibleRows, rankingContext, resolvedWindow.topRecommendationNames, resolvedWindow.counterPenaltyEligibleNames)
    .map((entry, index) => ({
      ...entry,
      ...calculateNormalizedDraftPoints(entry.signal.scoreBreakdown.hybridScore, entry.draftScore, maxHybridScore),
      rank: index + 1,
    }));
  if (!context.motor || context.motor.motor === "hibrido") return doHibrido;
  return reordenarComMotor(doHibrido, context, lockedNames, context.motor);
}

/**
 * Modelos locais PL/Meta: os confrontos, sinergias, bans e riscos vêm da
 * fonte ativa. As restrições de bónus do Híbrido não se aplicam a estes modelos.
 */
function reordenarComMotor<T extends DraftRow>(entries: RankedDraftEntry<T>[], context: DraftRankingContext<T>, lockedNames: Set<string>, config: ConfigDoMotor): RankedDraftEntry<T>[] {
  const inimigos = (context.enemyRows ?? []).map((row) => row.brawler);
  const aliados = (context.allyRows ?? []).map((row) => row.brawler);
  const contextoComum = {
    inimigos, aliados, bans: Array.from(context.bannedNames ?? []),
    roster: (context.popularityRows ?? entries.map((entry) => entry.row)).map((row) => row.brawler),
    bloqueados: lockedNames, modeId: context.mapModeId,
    incluirRiscos: config.motor === "metapick",
  };
  const contextos = entries.map((entry) => lerContextoDoMotor(entry.row.brawler, contextoComum));
  const componentes: ComponentesDoCandidato[] = entries.map((entry, i) => ({
    brawler: entry.row.brawler,
    base: entry.basePoints,
    vitoria: numeric(entry.row.winRate),
    uso: getDraftUsageRate(entry.row),
    counters: contextos[i].counters.map((relacao) => relacao.pp),
    sinergias: contextos[i].sinergias.map((relacao) => relacao.pp),
    encaixe: entry.signal.fit,
    countersBanidos: contextos[i].countersBanidos.length,
    riscos: contextos[i].riscos.map((relacao) => relacao.pp),
  }));
  // No PL, as partes entram com o draft: no começo só a base (Vitória e Uso).
  const ativasDoPL = partesAtivasDoPL({ inimigos: inimigos.length, aliados: aliados.length, bans: Array.from(context.bannedNames ?? []).length });
  const pontuacoes = pontuarComMotor(componentes, config, ativasDoPL) ?? [];
  return entries
    .map((entry, i) => ({
      ...entry,
      draftScore: pontuacoes[i].pontos,
      finalPoints: pontuacoes[i].pontos,
      motor: { nome: config.motor, partes: pontuacoes[i].partes, contexto: contextos[i] },
    }))
    .sort((a, b) => b.finalPoints - a.finalPoints || b.basePoints - a.basePoints || a.row.brawler.localeCompare(b.row.brawler))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Ordering changes presentation only; contextual signals and counter windows stay intact. */
export function orderDraftEntries<T extends DraftRow>(entries: readonly RankedDraftEntry<T>[], order: "base" | "context") {
  const sorted = [...entries];
  if (order === "base") sorted.sort((a, b) =>
    b.signal.scoreBreakdown.hybridScore - a.signal.scoreBreakdown.hybridScore
    || a.row.brawler.localeCompare(b.row.brawler));
  return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function rankDraftRows<T extends DraftRow>(rows: T[], lockedNames: Set<string>, query = "", tier: DraftTier = "Todos", context: DraftRankingContext<T> = {}) {
  return rankDraftEntries(rows, lockedNames, query, tier, context).map((entry) => entry.row);
}

export type HybridUsageEntry<T extends DraftRow = DraftRow> = {
  row: T;
  usage: number;
  rank: number;
};

/**
 * Ranking descritivo por uso médio híbrido do mapa.
 * Não lê estado do draft, bónus ou bloqueios: serve exclusivamente como apoio à decisão de ban.
 */
export function rankHybridUsageRows<T extends DraftRow>(rows: T[]): HybridUsageEntry<T>[] {
  return [...rows]
    .map((row) => {
      const sources = [numeric(row.topBrawlUseRate), numeric(row.brawlPlanetPickRate)].filter((value): value is number => value !== null);
      const usage = numeric(row.usage) ?? (sources.length ? sources.reduce((sum, value) => sum + value, 0) / sources.length : 0);
      return { row, usage };
    })
    .sort((a, b) => b.usage - a.usage || (b.row.score ?? -1) - (a.row.score ?? -1) || a.row.brawler.localeCompare(b.row.brawler))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function rankCounterRows<T extends CounterDraftRow>(rows: T[], enemyRows: T[], lockedNames: Set<string>, query = "", tier: DraftTier = "Todos", context: Omit<DraftRankingContext<T>, "enemyRows"> = {}) {
  const nextContext = { ...context, enemyRows } as DraftRankingContext<T>;
  return rankDraftRows(rows, lockedNames, query, tier, nextContext);
}

export function estimateRoleWinRate(row: DraftRow, role: DraftRole) {
  const baseWin = numeric(row.brawlPlanetWinRate) ?? numeric(row.topBrawlWinRate) ?? numeric(row.winRate) ?? 50;
  const modifier = role === "mid" ? 1.02 : role === "side" ? 0.99 : 1.0;
  return clamp(baseWin * modifier);
}

export type BrawlerBuild = {
  gadget: string;
  starPower: string;
  gears: string[];
};

export function getBrawlerBuild(brawlerName: string, modeId?: string): BrawlerBuild {
  const name = brawlerName.toLowerCase();
  let gadget = "Utilidade Geral";
  let starPower = "Poder Principal";
  let gears = ["Dano (Damage)", "Escudo (Shield)"];

  if (modeId === "heist") {
    if (name.includes("colt") || name.includes("jessie") || name.includes("edgar") || name.includes("griff")) {
      gears = ["Dano (Damage)", "Velocidade (Speed) ou Recarga"];
    }
  } else if (modeId === "brawl-ball") {
    gears = ["Dano (Damage)", "Saúde (Health) ou Velocidade (Speed)"];
  } else if (modeId === "bounty" || modeId === "knockout") {
    gears = ["Dano (Damage)", "Escudo (Shield) ou Visão (Vision)"];
  }

  if (name.includes("griff")) {
    gadget = "Cofrinho (Piggy Bank)";
    starPower = "Manutenção (Keep the Change)";
    gears = ["Dano (Damage)", "Escudo (Shield)"];
  } else if (name.includes("shelly")) {
    gadget = "Passo Rápido (Fast Forward)";
    starPower = "Band-Aid";
    gears = ["Dano (Damage)", "Velocidade (Speed)"];
  } else if (name.includes("colt")) {
    gadget = "Recarga Perfeita (Speedloader)";
    starPower = "Boas Ideias (Magnum Special)";
    gears = ["Dano (Damage)", "Velocidade (Speed)"];
  } else if (name.includes("piper")) {
    gadget = "Auto-Ajuste (Auto-Aimer)";
    starPower = "Snappy Sniping";
    gears = ["Dano (Damage)", "Escudo (Shield)"];
  } else if (name.includes("mico")) {
    gadget = "Banana Peel";
    starPower = "Amplified";
    gears = ["Dano (Damage)", "Recarga (Gadget Charge)"];
  } else if (name.includes("spike")) {
    gadget = "Almofada de Espinhos (Popping Pincushion)";
    starPower = "Curva Frutífera (Curveball)";
    gears = ["Dano (Damage)", "Escudo (Shield)"];
  }

  return { gadget, starPower, gears };
}

export type TacticalPlan = {
  mission: string;
  action: string;
  position: string;
  pressure: string;
};

export function getTacticalPlan(brawlerRow: { brawler: string; modeId?: string }, modeId?: string): TacticalPlan {
  const name = brawlerRow.brawler.toLowerCase();
  const m = modeId || brawlerRow.modeId || "gem-grab";
  
  let mission = "Controlar a lane principal, manter a mira ativa e apoiar o objetivo.";
  let action = "Equilibrar ataque e recuo estratégico.";
  let position = "Manter cobertura lateral e evitar exposição a snipers.";
  let pressure = "Focar o adversário com menor vida e negar área.";

  if (m === "heist") {
    mission = "Causar dano massivo ao cofre inimigo ou defender o próprio cofre de assssinos.";
    action = "Aproveitar janelas de super para avançar diretamente ao cofre.";
    position = "Utilizar os flancos para evitar o fogo cruzado do centro.";
    pressure = "Eliminar o brawler defensor chave antes de aplicar dano direto ao cofre.";
  } else if (m === "brawl-ball") {
    mission = "Criar espaço para carregar a bola e abrir caminho com o Super.";
    action = "Destruir paredes cruciais para facilitar o golo ou avançar em passe.";
    position = "Cobrir a zona central e apoiar o portador da bola.";
    pressure = "Neutralizar o tank adversário para impedir a defesa da baliza.";
  } else if (m === "bounty" || m === "knockout") {
    mission = "Garantir eliminações seguras e evitar mortes desnecessárias (evitar dar vantagem de estrelas/rondas).";
    action = "Manter distância e punir erros de posicionamento inimigo.";
    position = "Posicionamento defensivo de longo alcance com visão de mapa.";
    pressure = "Focar o carry inimigo e recuar em vantagem numérica.";
  }

  if (name.includes("griff")) {
    mission = "Derreter tanques e aplicar pressão contínua no objetivo.";
    action = "Usar o super para abrir linhas de tiro e destruir cobertura.";
    position = "Segunda linha defensiva, protegendo o mid.";
    pressure = "Impedir que assassinos se aproximem do cofre ou da zona.";
  } else if (name.includes("colt") || name.includes("piper")) {
    mission = "Sniper de longo alcance / controle de linha.";
    action = "Eliminar alvos frágeis e quebrar paredes que protegem o inimigo.";
    position = "Backline estrito, aproveitando o alcance máximo.";
    pressure = "Punir qualquer avanço inimigo descoberto.";
  }

  return { mission, action, position, pressure };
}

export type DraftCounterProbabilityImpact = {
  team: "blue" | "red";
  attacker: string;
  defender: string;
  matchupScore: number;
  impactPoints: number;
};

export type DraftWinProbabilityEstimate = {
  blueWinProbability: number;
  redWinProbability: number;
  advantageLabel: string;
  counterImpacts: DraftCounterProbabilityImpact[];
  blueCounterImpact: number;
  redCounterImpact: number;
  netBlueCounterImpact: number;
};

export function estimateDraftWinProbability(blueRows: DraftRow[], redRows: DraftRow[]): DraftWinProbabilityEstimate {
  const normalizeHybridScore = (score: number | null | undefined) => {
    const value = numeric(score) ?? 65;
    return value <= 13 ? (value / 13) * 100 : clamp(value);
  };
  const counterImpactsFor = (team: "blue" | "red", attackers: DraftRow[], defenders: DraftRow[]) => attackers.flatMap((attacker) => defenders
    .map((defender) => getCounterMatchup(attacker.brawler, defender.brawler, undefined, attacker.modeId ?? defender.modeId))
    .filter((matchup): matchup is CounterMatchup => matchup !== null)
    .map((matchup) => ({
      team,
      attacker: matchup.attacker,
      defender: matchup.defender,
      matchupScore: matchup.counterScore,
      // Cada score literal acima de 50 converte-se em impacto de probabilidade;
      // o mesmo cálculo é aplicado aos dois lados, permitindo que counters cruzados se anulem.
      impactPoints: Math.round(Math.max(0, matchup.counterScore - 50) * 0.5 * 10) / 10,
    })));
  const teamBaseStrength = (rows: DraftRow[]) => {
    if (!rows.length) return 50;
    const avgHybrid = average(rows.map((row) => normalizeHybridScore(row.score))) ?? 65;
    const avgWin = average(rows.map((row) => row.brawlPlanetWinRate ?? row.topBrawlWinRate ?? row.winRate ?? 50)) ?? 50;
    const roles = new Set(rows.map((row) => inferDraftRole(row.brawler)));
    const roleCoverage = (roles.size / 3) * 100;
    return clamp((avgHybrid * 0.45) + (avgWin * 0.35) + (roleCoverage * 0.20));
  };
  const counterImpacts = [...counterImpactsFor("blue", blueRows, redRows), ...counterImpactsFor("red", redRows, blueRows)];
  const blueCounterImpact = counterImpacts.filter((impact) => impact.team === "blue").reduce((sum, impact) => sum + impact.impactPoints, 0);
  const redCounterImpact = counterImpacts.filter((impact) => impact.team === "red").reduce((sum, impact) => sum + impact.impactPoints, 0);
  const blueStrength = teamBaseStrength(blueRows) + blueCounterImpact;
  const redStrength = teamBaseStrength(redRows) + redCounterImpact;
  const total = blueStrength + redStrength;
  const blueProb = total === 0 ? 50 : Math.round(clamp((blueStrength / total) * 100));
  const redProb = 100 - blueProb;
  let advantageLabel = "Equilíbrio absoluto no draft";
  const diff = Math.abs(blueProb - redProb);
  if (diff >= 12) {
    advantageLabel = blueProb > redProb ? "Vantagem clara para a Equipa Azul" : "Vantagem clara para a Equipa Vermelha";
  } else if (diff >= 5) {
    advantageLabel = blueProb > redProb ? "Ligeira vantagem tática da Equipa Azul" : "Ligeira vantagem tática da Equipa Vermelha";
  }
  return { blueWinProbability: blueProb, redWinProbability: redProb, advantageLabel, counterImpacts, blueCounterImpact, redCounterImpact, netBlueCounterImpact: blueCounterImpact - redCounterImpact };
}
