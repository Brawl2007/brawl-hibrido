import { brawlScopeSynergyData } from "./brawlScopeSynergyData";
import { montarDadosDoMotorApi, type DadosApiParaMotor, type DadosDoMotorApi } from "./observedMatchupMatrix";
import { calcularDeltaCounterPuro, calcularDeltaSinergiaPura, calcularProbabilidadeParBayesiana, logit, sigmoid, type ApoioDoMotorApi } from "./motorApiPerfeito";
import { calcularWinRateBayesiano } from "./amostraPequena";
import { avancarVersaoDoMotor } from "./versaoDoMotor";
import { brawlScopeMatchupDeltas } from './brawlScopeMatchupDeltas.generated';
import { brawlScopeMatchupsByMode } from './brawlScopeMatchupsByMode.generated';
import { brawlScopeModeForId, normalizeBrawlScopeModeId } from './brawlScopeModes';
import { DEFAULT_BRAWLSCOPE_READING, normalizeBrawlScopeReading, type BrawlScopeReadingId } from './brawlScopeReading';
import { getBrawlScopeSynergyTeammates, getCounterSourceProfiles, isExcludedCounterDirection, type CounterSourceProfile } from './counterSourceRelations';
import { normalizeCounterBrawlerName as key } from './counterSyncSnapshot';

export type MatchupValue = {
  base: number | null;
  prodigy: number;
  planet: number;
  total: number;
  /**
   * De que tabela veio o valor: o id do modo quando a leitura por modo o
   * encontrou, `"overall"` quando caiu para a tabela geral.
   *
   * Existe para a interface poder dizê-lo. Sem isto, alternar entre "Geral" e
   * "Por modo" parecia não fazer nada em quase todos os pares — e a explicação
   * verdadeira (a fonte ainda não publicou aquele modo para aquele brawler)
   * ficava invisível.
   */
  scope?: string;
  /** O valor veio de uma recolha em direto, e não do catálogo do repositório. */
  live?: boolean;
};
const catalog = new Map(Object.entries(brawlScopeMatchupDeltas).map(([name, profile]) =>
  [key(name), new Map(Object.entries(profile.deltas).map(([foe, delta]) => [key(foe), delta]))]));

/** Mesma estrutura do catálogo geral, uma por modo. */
const modeCatalogs = new Map(Object.entries(brawlScopeMatchupsByMode).map(([mode, profiles]) => [
  mode,
  new Map(Object.entries(profiles).map(([name, profile]) =>
    [key(name), new Map(Object.entries(profile.deltas).map(([foe, delta]) => [key(foe), delta]))])),
]));

/**
 * Leitura ativa. A interface escreve aqui a escolha do utilizador entre a tabela
 * geral e as tabelas por modo; o motor não guarda preferências por si.
 */
let activeReading: BrawlScopeReadingId = DEFAULT_BRAWLSCOPE_READING;

export function setBrawlScopeReading(reading: unknown) {
  const seguinte = normalizeBrawlScopeReading(reading);
  // Só avança quando muda: é chamado ao montar e a cada evento de
  // preferência, e avançar sem mudança deitava fora a cache sem motivo.
  if (seguinte !== activeReading) avancarVersaoDoMotor();
  activeReading = seguinte;
}

/**
 * Matrizes vindas da sincronização em tempo real. Substituem o catálogo do
 * repositório para a vista recebida; uma vista sem dados live continua a usar o
 * que está no projeto, por isso o Draft nunca fica sem leitura.
 */
const liveMatrices = new Map<string, Map<string, Map<string, number>>>();
/**
 * Os nomes como a fonte os escreve.
 *
 * As matrizes são indexadas por chave normalizada ("mrp", "8bit"), que é o que
 * permite comparar nomes escritos de maneiras diferentes. Mas para MOSTRAR um
 * adversário é preciso o nome como ele se escreve, e esse perdia-se na
 * indexação.
 */
const nomesVivos = new Map<string, string>();

export function setBrawlScopeLiveMatchups(view: string, matrix: Record<string, Record<string, number>> | null | undefined) {
  // A leitura procura pela grafia canónica ("gemGrab"). Guardar por "gem-grab"
  // deixava a matriz em memória e invisível — guardada e nunca encontrada.
  const chave = view === "overall" ? "overall" : normalizeBrawlScopeModeId(view) ?? view;
  avancarVersaoDoMotor();
  if (!matrix || !Object.keys(matrix).length) {
    liveMatrices.delete(chave);
    return 0;
  }
  const indexado = new Map(Object.entries(matrix).map(([owner, deltas]) => {
    nomesVivos.set(key(owner), owner);
    return [key(owner), new Map(Object.entries(deltas).map(([foe, delta]) => {
      nomesVivos.set(key(foe), foe);
      return [key(foe), delta];
    }))] as const;
  }));
  liveMatrices.set(chave, indexado);
  return Object.values(matrix).reduce((total, deltas) => total + Object.keys(deltas).length, 0);
}

export function getBrawlScopeLiveViews() {
  return Array.from(liveMatrices.keys());
}

export function getBrawlScopeReading() {
  return activeReading;
}

/**
 * Delta publicado para o par. Com a leitura por modo e um modo conhecido, a
 * tabela desse modo tem prioridade; se ela não publicar o par, cai para a geral,
 * que é sempre o recurso — nunca se inventa um valor de modo.
 */
function publishedDelta(owner: string, foe: string, modeId?: string, reading = activeReading) {
  const normalizedMode = normalizeBrawlScopeModeId(modeId);
  const ownerKey = key(owner);
  const foeKey = key(foe);

  if (reading === "byMode" && normalizedMode) {
    const live = liveMatrices.get(normalizedMode)?.get(ownerKey)?.get(foeKey);
    if (typeof live === "number") return { value: live, scope: normalizedMode, live: true };
    const scoped = modeCatalogs.get(normalizedMode)?.get(ownerKey)?.get(foeKey);
    if (typeof scoped === "number") return { value: scoped, scope: normalizedMode, live: false };
  }

  const liveGlobal = liveMatrices.get("overall")?.get(ownerKey)?.get(foeKey);
  if (typeof liveGlobal === "number") return { value: liveGlobal, scope: "overall" as const, live: true };
  const global = catalog.get(ownerKey)?.get(foeKey);
  return typeof global === "number" ? { value: global, scope: "overall" as const, live: false } : null;
}

function evidence(owner: string, foe: string, source: string, own: CounterSourceProfile[], other: CounterSourceProfile[]) {
  const a = own.find(p => p.source === source);
  const b = other.find(p => p.source === source);
  const has = (p: CounterSourceProfile | undefined, direction: 'targets' | 'counteredBy', name: string) =>
    p?.[direction].some(r => key(r.brawler) === key(name)) ?? false;
  const positive = has(a, 'targets', foe) || has(b, 'counteredBy', owner);
  const negative = has(a, 'counteredBy', foe) || has(b, 'targets', owner);
  return positive === negative ? 0 : positive ? 1 : -1;
}

/** Percentages from the chosen brawler's perspective. Each confirming source counts once. */
export function calculateMatchupValue(
  base: number | null,
  prodigyDirection: number,
  planetDirection: number,
  origin?: { scope?: string; live?: boolean },
): MatchupValue {
  if (base === null || !Number.isFinite(base)) return { base: null, prodigy: 0, planet: 0, total: 0 };
  const sign = Math.sign(base);
  const prodigy = sign && prodigyDirection === sign ? sign * 2 : 0;
  const planet = sign && planetDirection === sign ? sign * 2 : 0;
  return {
    base,
    prodigy,
    planet,
    total: Math.round((base + prodigy + planet) * 10000) / 10000,
    ...(origin?.scope ? { scope: origin.scope } : {}),
    ...(origin?.live ? { live: true } : {}),
  };
}

/**
 * O BrawlScope publica cada delta na perspetiva do ADVERSÁRIO: é a variação da
 * taxa de vitória desse adversário quando enfrenta o titular do perfil. Por isso,
 * na página, quem countera o titular aparece com valor positivo (ex.: "Counters
 * Nori · Doug +9,6") e quem o titular pune aparece negativo (ex.: "Nori punishes ·
 * Mico −9,8").
 *
 * O Draft e o perfil leem sempre na perspetiva do brawler escolhido: positivo
 * significa que ELE countera o adversário. A conversão é a inversão do sinal
 * publicado — sem ela, o motor premiava escolher um brawler counterado.
 */
export function toOwnerPerspective(publishedDelta: number) {
  return -publishedDelta;
}

/**
 * A fonte ponderada usa a posterior comum do motor, com apoio das matrizes
 * para pares escassos. Contagens legadas sem metadados ponderados conservam
 * a suavização histórica abaixo para compatibilidade de leitura.
 */
export const JOGOS_DE_PRIOR = 10;

type ContagemObservada = { jogos: number; vitorias: number };
export type FonteObservada = {
  modelo?: DadosDoMotorApi;
  /** Taxa de vitória de cada brawler no mapa, de 0 a 1. */
  vitoriaNoMapa: ReadonlyMap<string, number>;
  /** `a␀b` → a contra b. */
  confrontos: ReadonlyMap<string, ContagemObservada>;
  /** `a␀b` com a < b → a e b na mesma equipa. */
  sinergias: ReadonlyMap<string, ContagemObservada>;
};

let fonteObservada: FonteObservada | null = null;

export function definirFonteObservada(fonte: FonteObservada | null) {
  fonteObservada = fonte;
  avancarVersaoDoMotor();
}

export function fonteObservadaAtiva() {
  return fonteObservada !== null;
}

/** Monta a fonte a partir das contagens da página «Partidas» de um mapa. */
export function montarFonteObservada(dados: Omit<DadosApiParaMotor, "partidas"> & { partidas?: number; modeId?: string }): FonteObservada {
  const nomes = [...new Set([...dados.brawlers.map((r) => key(r.brawler)), ...Object.keys(dados.referenciasMapa ?? {}).map(key)])];
  const modelo = dados.partidasPonderadas !== undefined ? montarDadosDoMotorApi(nomes, { ...dados, partidas: dados.partidas ?? 0 }, fontesDeApoioDaApi(dados.modeId)) : undefined;
  return {
    modelo,
    vitoriaNoMapa: modelo ? new Map(Object.entries(modelo.estatisticasMapa).map(([nome,s]) => [nome, calcularWinRateBayesiano(s)])) : new Map(dados.brawlers.map(l => [key(l.brawler), l.jogos ? l.vitorias / l.jogos : .43])),
    confrontos: new Map(dados.confrontos.map((linha) => [`${key(linha.a)}\u0000${key(linha.b)}`, { jogos: linha.jogos, vitorias: linha.vitorias }])),
    sinergias: new Map(dados.sinergias.map((linha) => {
      const [a, b] = [key(linha.a), key(linha.b)].sort();
      return [`${a}\u0000${b}`, { jogos: linha.jogos, vitorias: linha.vitorias }];
    })),
  };
}

function parDoModelo(a: string, b: string, sinergia: boolean): ParObservado | null {
  const modelo = fonteObservada?.modelo;
  if (!modelo) return null;
  const beta = (nome: string) => logit(fonteObservada?.vitoriaNoMapa.get(key(nome)) ?? .43);
  const ba = beta(a), bb = beta(b);
  const par = sinergia ? modelo.obterSinergia(a, b) : modelo.obterConfronto(a, b);
  const reserva = (sinergia ? modelo.obterSinergiaDeReserva?.(a, b) : modelo.obterCounterDeReserva?.(a, b)) ?? 0;
  const delta = sinergia ? calcularDeltaSinergiaPura(ba, bb, par, reserva) : calcularDeltaCounterPuro(ba, bb, par, reserva);
  const { amostraEfetiva } = calcularProbabilidadeParBayesiana(par, sigmoid((sinergia ? ba + bb : ba - bb) + reserva));
  return { delta: (sigmoid(delta) - .5) * 100, jogos: amostraEfetiva, vitoria: sigmoid((sinergia ? ba + bb : ba - bb) + delta) * 100 };
}

function diferencaEncolhida(contagem: ContagemObservada | undefined, habitual: number) {
  if (!contagem || contagem.jogos <= 0) return null;
  const encolhida = (contagem.vitorias + JOGOS_DE_PRIOR * habitual) / (contagem.jogos + JOGOS_DE_PRIOR);
  return Math.round((encolhida - habitual) * 10000) / 100;
}

/** A vitória de um brawler neste mapa, nas partidas da API (0–100); null sem API ligada ou sem jogos dele. */
export function vitoriaObservadaNoMapa(brawler: string) {
  if (!fonteObservada) return null;
  const vitoria = fonteObservada.vitoriaNoMapa.get(key(brawler));
  return typeof vitoria === "number" ? vitoria * 100 : null;
}

/** Pontos percentuais que `owner` ganha a mais contra `foe` neste mapa; null sem jogos. */
export function confrontoObservado(owner: string, foe: string) {
  if (fonteObservada?.modelo) return parDoModelo(owner, foe, false)?.delta ?? null;
  if (!fonteObservada) return null;
  const habitual = fonteObservada.vitoriaNoMapa.get(key(owner)) ?? 0.5;
  return diferencaEncolhida(fonteObservada.confrontos.get(`${key(owner)}\u0000${key(foe)}`), habitual);
}

/** Pontos percentuais que `candidato` ganha a mais ao lado de `aliado`; negativo é anti-sinergia. */
export function sinergiaObservada(candidato: string, aliado: string) {
  if (fonteObservada?.modelo) return parDoModelo(candidato, aliado, true)?.delta ?? null;
  if (!fonteObservada) return null;
  const habitual = fonteObservada.vitoriaNoMapa.get(key(candidato)) ?? 0.5;
  const [a, b] = [key(candidato), key(aliado)].sort();
  return diferencaEncolhida(fonteObservada.sinergias.get(`${a}\u0000${b}`), habitual);
}

/**
 * Um par das partidas com tudo o que o Draft da API precisa para o avaliar:
 * - `vitoria`: a vitória do par (de `owner` contra o inimigo, ou da dupla),
 *   encolhida para a vitória habitual dele com `JOGOS_DE_PRIOR` jogos, em %;
 * - `delta`: essa vitória menos a vitória habitual dele no mapa, em pp;
 * - `jogos`: os jogos reais do par.
 */
export type ParObservado = { delta: number; vitoria: number; jogos: number };

function parEncolhido(contagem: ContagemObservada | undefined, habitual: number): ParObservado | null {
  if (!contagem || contagem.jogos <= 0) return null;
  const encolhida = (contagem.vitorias + JOGOS_DE_PRIOR * habitual) / (contagem.jogos + JOGOS_DE_PRIOR);
  return {
    delta: Math.round((encolhida - habitual) * 10000) / 100,
    vitoria: Math.round(encolhida * 1000) / 10,
    jogos: contagem.jogos,
  };
}

/** O confronto de `owner` contra `foe` neste mapa, com os jogos; null sem API ligada ou sem jogos. */
export function confrontoObservadoComJogos(owner: string, foe: string): ParObservado | null {
  if (fonteObservada?.modelo) return parDoModelo(owner, foe, false);
  if (!fonteObservada) return null;
  const habitual = fonteObservada.vitoriaNoMapa.get(key(owner)) ?? 0.5;
  return parEncolhido(fonteObservada.confrontos.get(`${key(owner)}\u0000${key(foe)}`), habitual);
}

/** A dupla `candidato` + `aliado` neste mapa, com os jogos, na perspetiva do candidato. */
export function sinergiaObservadaComJogos(candidato: string, aliado: string): ParObservado | null {
  if (fonteObservada?.modelo) return parDoModelo(candidato, aliado, true);
  if (!fonteObservada) return null;
  const habitual = fonteObservada.vitoriaNoMapa.get(key(candidato)) ?? 0.5;
  const [a, b] = [key(candidato), key(aliado)].sort();
  return parEncolhido(fonteObservada.sinergias.get(`${a}\u0000${b}`), habitual);
}

/**
 * Ler as duas fichas do confronto, e não só a do candidato.
 *
 * POR QUE EXISTE
 *
 * O BrawlScope publica cada par duas vezes, uma em cada ficha, medido contra a
 * média de cada um — e as duas amostras podem discordar muito. O caso que o
 * mostrou: Lumi contra Surge, Emz e Griff valia −12,7% na ficha da Lumi e
 * −0,2% nas fichas dos três adversários. Lendo só a ficha do candidato, a Lumi
 * caía para 63.º num draft em que o Metapick (partidas Master+) a punha em 1.º.
 *
 * Ligada (por omissão), o valor do par é a média das duas fichas, cada uma na
 * perspetiva do candidato. Quando só uma ficha publica o par, vale essa.
 * Desligada, volta a valer só a ficha de quem está a ser avaliado.
 */
let duasFichas = true;

export function definirLeituraDasDuasFichas(ligada: boolean) {
  if (duasFichas === ligada) return;
  duasFichas = ligada;
  avancarVersaoDoMotor();
}

export function leituraDasDuasFichas() {
  return duasFichas;
}

/** O delta que a ficha de `titular` publica contra `adversario`, como a fonte o escreve. */
function deltaDaFicha(titular: string, adversario: string, perfis: CounterSourceProfile[], modeId: string | undefined, reading: BrawlScopeReadingId) {
  const scope = perfis.find(p => p.source === 'BrawlScope');
  const relation = [...(scope?.targets ?? []), ...(scope?.counteredBy ?? [])].find(r => key(r.brawler) === key(adversario) && typeof r.delta === 'number');
  const fromCatalog = publishedDelta(titular, adversario, modeId, reading);
  const useLiveMatrix = fromCatalog?.live === true;
  const published = useLiveMatrix ? fromCatalog.value : relation?.delta ?? fromCatalog?.value ?? null;
  return { scope, relation, fromCatalog, useLiveMatrix, published };
}

export function getMatchupValue(owner: string, foe: string, modeId?: string, reading = activeReading): MatchupValue {
  if (key(owner) === key(foe)) return calculateMatchupValue(null, 0, 0);
  // Fonte observada: posterior dos jogos oficiais e do prior de apoio, sem recursão na leitura ativa.
  if (fonteObservada) return calculateMatchupValue(confrontoObservado(owner, foe), 0, 0, { scope: "api-oficial" });
  return getMatchupDasFontes(owner, foe, modeId, reading);
}

/** Leitura explícita das matrizes de apoio, sem alterar o interruptor global da API. */
export function getMatchupDasFontes(owner: string, foe: string, modeId?: string, reading: BrawlScopeReadingId = modeId ? "byMode" : "overall"): MatchupValue {
  if (key(owner) === key(foe)) return calculateMatchupValue(null, 0, 0);
  /**
   * Direções rejeitadas manualmente não valem em lado nenhum — nem na lista, nem
   * no Score. A exclusão é bidirecional na leitura: se a direção A→B foi
   * rejeitada, o par deixa de pontuar dos dois lados, senão B ganhava pontos por
   * um confronto que o projeto decidiu não reconhecer.
   */
  if (isExcludedCounterDirection(owner, foe) || isExcludedCounterDirection(foe, owner)) {
    return calculateMatchupValue(null, 0, 0);
  }
  const effectiveMode = reading === "byMode" ? modeId : undefined;
  const own = getCounterSourceProfiles(owner, effectiveMode);
  const other = getCounterSourceProfiles(foe, effectiveMode);
  // Prefer a contextual published percentage; the complete catalog preserves every pair.
  const { scope, relation, fromCatalog, useLiveMatrix, published } = deltaDaFicha(owner, foe, own, modeId, reading);
  /**
   * A ficha do próprio brawler é a evidência primária do confronto. Duas fichas
   * podem contradizer-se — a fonte mede cada par contra a média do adversário, por
   * isso dois brawlers dominantes aparecem, cada um na sua página, a punir o outro.
   * Nesse caso vale a página de quem está a ser avaliado: se a ficha da Wendy diz
   * que ninguém leva vantagem sobre ela, escolher a Wendy não pode perder pontos
   * só porque a ficha do adversário afirma o contrário.
   */
  const daFichaDoCandidato = published === null ? null : toOwnerPerspective(published);
  /**
   * Na ficha do adversário o candidato é o adversário: o número já está na
   * perspetiva do candidato (positivo = o candidato leva vantagem), sem inverter.
   */
  const daFichaDoAdversario = duasFichas ? deltaDaFicha(foe, owner, other, modeId, reading).published : null;
  const base = daFichaDoCandidato === null
    ? daFichaDoAdversario
    : daFichaDoAdversario === null
      ? daFichaDoCandidato
      : Math.round(((daFichaDoCandidato + daFichaDoAdversario) / 2) * 100) / 100;
  /**
   * De onde veio mesmo o número. Quando a ficha do próprio brawler traz o delta,
   * a origem é o modo dessa ficha — que é o modo pedido quando o snapshot tem
   * leitura por modo, e a leitura geral caso contrário.
   */
  const origin = relation && !useLiveMatrix
    ? { scope: normalizeBrawlScopeModeId(scope?.modeId) ?? "overall", live: true }
    : { scope: fromCatalog?.scope, live: fromCatalog?.live };
  return calculateMatchupValue(
    base,
    evidence(owner, foe, 'PL Prodigy', own, other),
    evidence(owner, foe, 'Brawl Planet', own, other),
    origin,
  );
}

/** Apoio para pares escassos: catálogos existentes e snapshot do modo ativo. */
export function fontesDeApoioDaApi(modeId?: string): ApoioDoMotorApi {
  const transformar = (pp: number) => logit(.5 + Math.max(-30, Math.min(30, pp)) / 100);
  const sinergias = new Map(Object.values(brawlScopeSynergyData).map(p => [key(p.brawler), p.teammates]));
  return {
    counterDeReservaExcluido: (a, b) => isExcludedCounterDirection(a, b) || isExcludedCounterDirection(b, a),
    obterCounterDeReserva: (a, b) => { const par = getMatchupDasFontes(a, b, modeId); return par.base === null ? undefined : transformar(par.total); },
    obterSinergiaDeReserva: (a, b) => {
      const lista = (dono: string) => {
        const viva = getBrawlScopeSynergyTeammates(dono, modeId, true);
        return viva.length ? viva : sinergias.get(key(dono)) ?? [];
      };
      const valores = [lista(a).find(r => key(r.brawler) === key(b))?.delta, lista(b).find(r => key(r.brawler) === key(a))?.delta].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      return valores.length ? transformar(valores.reduce((x, y) => x + y, 0) / valores.length) : undefined;
    },
  };
}

/**
 * A mesma leitura, mas com os sinais como a fonte os publica na ficha do brawler:
 * positivo quando o adversário leva vantagem sobre o titular, negativo quando o
 * titular pune. É esta a orientação usada no perfil, para o número no site e o
 * número no ecrã serem exatamente o mesmo. O Draft continua a usar a perspetiva
 * do candidato, porque ali o valor vira bónus ou desbónus de Score.
 */
export function toPublishedMatchupValue(value: MatchupValue): MatchupValue {
  return {
    ...value,
    base: value.base === null ? null : -value.base,
    prodigy: -value.prodigy,
    planet: -value.planet,
    total: -value.total,
  };
}

/** Rótulo curto da origem do valor, para a interface. */
export function describeMatchupScope(value: MatchupValue) {
  if (value.base === null) return null;
  const mode = value.scope && value.scope !== "overall" ? brawlScopeModeForId(value.scope)?.label ?? value.scope : null;
  return `${mode ?? "tabela geral"}${value.live ? " · em direto" : ""}`;
}

export function getPublishedMatchupValue(owner: string, foe: string, modeId?: string): MatchupValue {
  return toPublishedMatchupValue(getMatchupValue(owner, foe, modeId, modeId ? "byMode" : "overall"));
}

export type BrawlScopeCoverage = {
  /** A fonte publica a tabela de confrontos deste brawler. */
  published: boolean;
  /** Total de confrontos publicados. */
  total: number;
  /** Quantos adversários têm vantagem sobre ele (counters dele). */
  counters: number;
  /** Quantos adversários ele pune. */
  targets: number;
  /** Os números vieram de uma ficha colada, e não do catálogo do repositório. */
  live?: boolean;
  /** Confronto menos favorável publicado, na perspetiva do titular. */
  hardest?: { brawler: string; value: number };
  /** Confronto mais favorável publicado, na perspetiva do titular. */
  easiest?: { brawler: string; value: number };
};

/**
 * Quantos confrontos a fonte publica para um brawler e como se dividem. Serve
 * para distinguir dois estados que são muito diferentes: a fonte não publicar
 * nada sobre ele, e a fonte publicar a tabela toda sem nenhum adversário com
 * vantagem — é isto que acontece com os brawlers dominantes do momento, que
 * simplesmente não têm counters listados.
 */
/**
 * A tabela de confrontos deste brawler, da fonte que está mesmo a valer.
 *
 * A mesma precedência que o Score usa: a ficha colada primeiro, o catálogo do
 * repositório só quando não há ficha. Sem isto, a cobertura lia sempre o
 * catálogo — e uma ficha acabada de colar não mexia num único número desta
 * leitura, por mais certa que estivesse guardada.
 */
function tabelaDoDono(owner: string, modeId?: string): { deltas: Array<[string, number]>; live: boolean } | null {
  const ownerKey = key(owner);
  const normalizedMode = normalizeBrawlScopeModeId(modeId);
  const daMatriz = (vista: string) => {
    const linha = liveMatrices.get(vista)?.get(ownerKey);
    if (!linha || !linha.size) return null;
    return Array.from(linha.entries()).map(([foeKey, delta]) => [nomesVivos.get(foeKey) ?? foeKey, delta] as [string, number]);
  };

  if (activeReading === "byMode" && normalizedMode) {
    const viva = daMatriz(normalizedMode);
    if (viva) return { deltas: viva, live: true };
    const doCatalogo = modeCatalogs.get(normalizedMode)?.get(ownerKey);
    if (doCatalogo?.size) {
      return { deltas: Array.from(doCatalogo.entries()).map(([foeKey, delta]) => [nomesVivos.get(foeKey) ?? foeKey, delta] as [string, number]), live: false };
    }
  }

  const geralViva = daMatriz("overall");
  if (geralViva) return { deltas: geralViva, live: true };

  const estatico = Object.entries(brawlScopeMatchupDeltas).find(([name]) => key(name) === key(owner))?.[1];
  if (estatico && Object.keys(estatico.deltas).length) {
    return { deltas: Object.entries(estatico.deltas), live: false };
  }
  return null;
}

export function getBrawlScopeCoverage(owner: string, modeId?: string): BrawlScopeCoverage {
  const tabela = tabelaDoDono(owner, modeId);
  if (!tabela) return { published: false, total: 0, counters: 0, targets: 0 };

  const entries = tabela.deltas.map(([foe, published]) => ({ foe, value: toOwnerPerspective(published) }));
  const sorted = entries.slice().sort((left, right) => left.value - right.value);
  const hardest = sorted[0];
  const easiest = sorted[sorted.length - 1];
  return {
    published: true,
    total: entries.length,
    counters: entries.filter((entry) => entry.value < 0).length,
    targets: entries.filter((entry) => entry.value > 0).length,
    hardest: hardest ? { brawler: hardest.foe, value: hardest.value } : undefined,
    easiest: easiest ? { brawler: easiest.foe, value: easiest.value } : undefined,
    live: tabela.live,
  };
}

export function formatMatchupPercent(value: number) {
  return `${value > 0 ? '+' : ''}${value.toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`;
}
export function describeMatchupValue(value: MatchupValue) {
  if (value.base === null) return 'Sem delta BrawlScope disponível';
  /**
   * O rótulo da tabela de origem faz parte da explicação, e não é um detalhe:
   * com a leitura "Por modo" ativa, um par sem dados desse modo usa a tabela
   * geral — e sem o dizer parecia que a opção não estava a fazer nada.
   */
  const scope = describeMatchupScope(value);
  return [
    `BrawlScope ${formatMatchupPercent(value.base)}${scope ? ` (${scope})` : ''}`,
    ...(value.prodigy ? [`PL Prodigy ${formatMatchupPercent(value.prodigy)}`] : []),
    ...(value.planet ? [`Brawl Planet ${formatMatchupPercent(value.planet)}`] : []),
  ].join(' · ');
}
export function getTopPositiveMatchups(owner: string, names: string[], modeId?: string) {
  return Array.from(new Set([...names, ...Object.keys(brawlScopeMatchupDeltas), ...getCounterSourceProfiles(owner, modeId).flatMap(p => [...p.targets, ...p.counteredBy].map(r => r.brawler))]))
    .filter(name => key(name) !== key(owner))
    .map(name => ({ name, value: getMatchupValue(owner, name, modeId).total }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .filter((item, index, items) => items.findIndex(other => key(other.name) === key(item.name)) === index)
    .slice(0, 10).map(item => key(item.name));
}
