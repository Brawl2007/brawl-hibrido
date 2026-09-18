import { mapLimited } from "./concurrency";
import { allBrawlerCatalogRows, allMapSummaries, allRankedRows, currentRankedMapNameSet, normalizeRankedMap, normalizeRankedRows, type MapSummary, type RankedRow } from "../client/src/data/rankedData";
import {
  createRankedSyncRun,
  getRankedSyncSnapshot,
  updateRankedSyncConfig,
  updateRankedSyncRun,
  upsertRankedSyncSnapshot,
  countRankedMapCaptures,
  listRankedMapCaptures,
} from "./db";
import { fetchOfficialBrawlers } from "./brawlStarsApi";
import { fetchText as lerPagina } from "./counterSync";
import type { LeituraPorFonte } from "../shared/idadeDosDados";
import { ROTACAO_GUARDADA_SETTING, lerRotacaoGuardada } from "@shared/rotacaoGuardada";
import { getSetting } from "./appSettings";
import { lerPaginaTopBrawl, type TopBrawlRow } from "../shared/topBrawlParser";
import { RANKED_MAP_SOURCES } from "../shared/rankedMaps";
export { RANKED_MAP_SOURCES };

/**
 * Recalcula os cartões de mapa a partir da snapshot efetivamente sincronizada.
 *
 * `idsPorMapa` traz o identificador oficial de cada mapa, vindo da rotação que
 * acabou de ser lida. Existe porque as linhas não o carregam — só o nome do
 * mapa — e sem ele o cliente ficava dependente de uma tabela nome→id escrita à
 * mão para encontrar a imagem. Um mapa que entrou na rotação não está nessa
 * tabela, e aparecia sem imagem nenhuma até alguém a editar.
 *
 * É opcional: quando falta, o campo fica por preencher, que é o que "não se
 * sabe" deve parecer.
 */
export function deriveMapSummaries(rows: RankedRow[], idsPorMapa?: ReadonlyMap<string, string>): MapSummary[] {
  const grouped = new Map<string, RankedRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.map) ?? [];
    current.push(row);
    grouped.set(row.map, current);
  }

  return Array.from(grouped, ([name, entries]) => {
    const base = { name, id: idsPorMapa?.get(name), mode: entries[0].mode, modeId: entries[0].modeId, brawlerCount: 0, topScore: 0 };
    const mapRows = grouped.get(base.name) ?? [];
    const scores = mapRows.flatMap((row) => typeof row.score === "number" ? [row.score] : []);
    const tiers: MapSummary["tiers"] = { S: 0, A: 0, B: 0 };
    for (const row of mapRows) {
      if (row.tier && row.tier in tiers) tiers[row.tier] += 1;
    }
    return {
      ...base,
      brawlerCount: mapRows.length || base.brawlerCount,
      topScore: scores.length ? Math.max(...scores) : base.topScore,
      tiers,
    };
  });
}

import type { BrawlPlanetMapTeam } from "@shared/brawlPlanetMapTeams";
import type { OfficialBrawlerSnapshot, RankedSnapshotEvent } from "../shared/rankedSyncSnapshot";
import { broadcastRankedSnapshot } from "./realtime";
import {
  mergeRotationSources,
  parseRankedRotationIndex,
  type DiscoveredRankedMap,
  type RankedRotationReading,
} from "@shared/rankedRotationSource";
import {
  evaluateRoster,
  type RosterChange,
  type RosterEvidence,
  type RosterState,
} from "@shared/rosterDiscovery";
import { brawlerClassCatalog } from "@shared/draft";
import { mainAttackRanges } from "@shared/brawlerAttackRanges";

const ONE_HOUR_MS = 60 * 60 * 1000;
/**
 * Quanto se espera por UM pedido antes de desistir.
 *
 * Eram 25 segundos, e isso é demais quando a fonte não responde de todo. São
 * 134 mapas com dois pedidos em paralelo: a 25 segundos cada, uma origem
 * silenciosa levava mais de vinte e cinco minutos a desistir de todos. A
 * recolha nunca chegava ao fim, a função era cortada a meio, e o trabalho
 * ficava marcado como "a correr" sem nunca terminar — nem bem nem mal, e sem
 * uma linha nos registos a dizer porquê.
 *
 * Dez segundos são de sobra para uma página que responde, e fazem uma origem
 * morta falhar depressa e ser REPORTADA, que é o que interessa.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.RANKED_REQUEST_TIMEOUT_MS ?? 10_000);

type SyncRow = Record<string, unknown> & {
  map: string;
  mode: string;
  modeId: string;
  brawler: string;
  brawlerId?: number | null;
  score?: number | null;
  tier?: string | null;
  usage?: number | null;
  winRate?: number | null;
  topBrawlWinRate?: number | null;
  topBrawlUseRate?: number | null;
  topBrawlScore?: number | null;
  brawlPlanetWinRate?: number | null;
  brawlPlanetPickRate?: number | null;
  brawlPlanetStarPlayer?: number | null;
  dataStatus?: string;
};

export type SourceResult = {
  status: "success" | "partial" | "failed";
  rows: Map<string, Partial<SyncRow>>;
  /** Linhas lidas por mapa nesta recolha, para medir a cobertura de cada um. */
  rowsByMap?: Map<string, number>;
  mapTeams?: BrawlPlanetMapTeam[];
  note?: string;
  /**
   * Quando os dados MAIS ANTIGOS desta fonte foram mesmo lidos na origem.
   *
   * Não é a hora da sincronização: uma sincronização que só republica capturas
   * de ontem acontece hoje, mas os números que publica são de ontem. É essa
   * diferença que este campo existe para não deixar desaparecer.
   *
   * Usa-se o mais antigo, e não o mais recente, porque a pergunta que interessa
   * é "há quanto tempo é que alguma coisa do que estou a ver deixou de ser
   * verificada" — e um mapa fresco no meio de vinte e cinco velhos não torna o
   * conjunto fresco.
   */
  lidoEm?: string | null;
};

export type SnapshotPayload = {
  rows: RankedRow[];
  maps: MapSummary[];
  /** Composições literais da tabela Teams do Brawl Planet por mapa. */
  mapTeams: BrawlPlanetMapTeam[];
  officialBrawlers?: OfficialBrawlerSnapshot[];
  /**
   * Estado da deteção automática de mapas e brawlers. Opcional porque as
   * snapshots gravadas antes desta funcionalidade não o têm — e a ausência
   * significa "ainda não avaliado", nunca "está vazio".
   */
  roster?: RosterState;
  rosterChanges?: RosterChange[];
  updatedAt: string;
  sourceStatus: { topBrawl: string; brawlPlanet: string };
  /**
   * Quando cada fonte foi mesmo lida na origem — distinto de `updatedAt`, que é
   * a hora a que esta sincronização correu. Ver `shared/idadeDosDados.ts`.
   * Opcional: as snapshots gravadas antes disto não o têm, e a ausência
   * significa "não se sabe", nunca "foi agora".
   */
  sourceReadAt?: LeituraPorFonte;
};

/** Aplica a fonte única de modos também a snapshots antigas já persistidas. */
export function normalizeSnapshotPayload(payload: SnapshotPayload): SnapshotPayload {
  const allowed = payload.roster
    ? new Set(payload.roster.maps.filter(map => map.status !== "quarantine").map(map => map.name))
    : new Set([...currentRankedMapNameSet, ...payload.maps.map(map => map.name)]);
  const merged = new Map((payload.roster ? [] : allRankedRows.filter(row => allowed.has(row.map))).map(row => [`${row.map}::${row.brawler}`, row]));
  for (const row of payload.rows) if (allowed.has(row.map)) merged.set(`${row.map}::${row.brawler}`, row);
  const rows = normalizeRankedRows(Array.from(merged.values()));
  /**
   * Os ids que a snapshot guardada já traz não se perdem ao normalizar. Sem
   * isto, reler uma snapshot apagava o id de cada mapa e as imagens voltavam a
   * depender da tabela escrita à mão.
   */
  const idsGuardados = new Map(payload.maps.flatMap((mapa) => mapa.id ? [[mapa.name, mapa.id] as const] : []));
  return { ...payload, rows, maps: deriveMapSummaries(rows, idsGuardados),
    mapTeams: (payload.mapTeams ?? []).filter(team => allowed.has(team.map)),
    officialBrawlers: payload.officialBrawlers ?? [] };
}



function asNumber(value: string | null | undefined) {
  if (!value || value === "null") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A leitura de páginas passa a ser a mesma que as outras fontes já usavam.
 *
 * Esta tinha um pedido próprio, mais cru: anunciava-se como
 * `Brawl-Hibrido-Sync/1.0` e não enviava nenhum dos cabeçalhos que um
 * navegador envia sempre. O TopBrawl respondia-lhe 403 Forbidden — as mesmas
 * páginas abrem sem problema num browser.
 *
 * O projeto já tinha resolvido isto para o BrawlScope, com cuidados que esta
 * cópia não tinha: espaçamento entre pedidos ao mesmo site com variação
 * aleatória, e recuo automático quando uma origem responde 403 em vez de
 * insistir contra quem recusa. Ter duas maneiras de pedir uma página era o que
 * mantinha esses cuidados de fora daqui.
 *
 * Não há garantia de que passe a funcionar: quem recusa pode voltar a recusar,
 * e nesse caso o caminho é o mesmo do BrawlScope — ler as páginas no navegador
 * de quem usa o site, com a extensão.
 */
async function fetchText(url: string) {
  return lerPagina(url);
}

/**
 * As linhas de uma página de mapa, no formato que a sincronização usa.
 *
 * O trabalho de interpretar a página mudou-se para `shared/topBrawlParser.ts`,
 * porque deixou de ser só o servidor a lê-la: o `topbrawl.com` responde 403 a
 * pedidos vindos do alojamento, e a recolha passou a correr fora, onde a porta
 * está aberta. Aqui fica só a tradução para o formato interno.
 */
export function parseTopBrawl(html: string, mapName: string): Map<string, Partial<SyncRow>> {
  return linhasParaSyncRows(lerPaginaTopBrawl(html), mapName);
}

/** A mesma tradução, a partir de linhas já lidas noutro sítio. */
export function linhasParaSyncRows(linhas: readonly TopBrawlRow[], mapName: string): Map<string, Partial<SyncRow>> {
  const rows = new Map<string, Partial<SyncRow>>();
  for (const linha of linhas) {
    rows.set(linha.brawler, {
      map: mapName,
      brawlerId: linha.brawlerId,
      topBrawlWinRate: linha.topBrawlWinRate,
      topBrawlUseRate: linha.topBrawlUseRate,
      topBrawlScore: linha.topBrawlScore,
    });
  }
  return rows;
}

function decodeJsonString(fragment: string) {
  try {
    return JSON.parse(`"${fragment}"`) as string;
  } catch {
    return fragment.replace(/\\u([0-9a-f]{4})/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
  }
}

function decodeHtmlText(fragment: string) {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function percentFromCell(text: string) {
  const match = text.replace(",", ".").match(/[-+]?\d+(?:\.\d+)?/);
  return asNumber(match?.[0]);
}

function canonicalBrawlerName(mapName: string, sourceName: string) {
  const normalizedSource = sourceName.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  const known = (allBrawlerCatalogRows as readonly SyncRow[]).find((row) =>
    row.brawler.toLocaleLowerCase().replace(/[^a-z0-9]/g, "") === normalizedSource,
  );
  return known?.brawler ?? sourceName;
}

export function parseBrawlPlanet(html: string, mapName: string): Map<string, Partial<SyncRow>> {
  const rows = new Map<string, Partial<SyncRow>>();
  const normalized = html.replaceAll('\\"', '"');

  // Brawl Planet server-renders both Trophy Ladder and Ranked tables. The
  // Ranked table is the last table with all three source headers; parsing the
  // cells keeps the extractor independent from private React payload names.
  const tableCandidates = Array.from(normalized.matchAll(/<table\b[\s\S]*?<\/table>/gi))
    .map((match) => match[0])
    .filter((table) => {
      const header = decodeHtmlText(table.slice(0, 2500)).toLowerCase();
      return header.includes("brawler") && header.includes("pick") && header.includes("star");
    });

  const rankedTable = tableCandidates.at(-1);
  if (rankedTable) {
    for (const rowMatch of Array.from(rankedTable.matchAll(/<tr\b[\s\S]*?<\/tr>/gi))) {
      const cells = Array.from(rowMatch[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => decodeHtmlText(match[1]));
      if (cells.length < 5) continue;
      const rawBrawler = cells[1];
      if (!rawBrawler) continue;
      const brawler = canonicalBrawlerName(mapName, rawBrawler);
      const winRate = percentFromCell(cells[2]);
      const pickRate = percentFromCell(cells[3]);
      const starPlayer = percentFromCell(cells[4]);
      if (winRate === null && pickRate === null && starPlayer === null) continue;
      rows.set(brawler, {
        map: mapName,
        brawlPlanetWinRate: winRate,
        brawlPlanetPickRate: pickRate,
        brawlPlanetStarPlayer: starPlayer,
      });
    }
  }

  // Keep compatibility with older serialized responses when the table is not
  // server-rendered, while accepting the field aliases used by Brawl Planet.
  if (rows.size === 0) {
    const pattern = /"(?:brawlerName|name)":"([^"\\]+)"[\s\S]{0,320}?"winRate":(null|[-+0-9.eE]+)[\s\S]{0,220}?"(?:pickRate|useRate)":(null|[-+0-9.eE]+)(?:[\s\S]{0,180}?"(?:starPlayer|starPlayerRate|starRate)":(null|[-+0-9.eE]+))?/g;
    for (const match of Array.from(normalized.matchAll(pattern))) {
      const rawBrawler = match[1];
      if (!rawBrawler) continue;
      const brawler = canonicalBrawlerName(mapName, rawBrawler);
      rows.set(brawler, {
        map: mapName,
        brawlPlanetWinRate: asNumber(match[2]),
        brawlPlanetPickRate: asNumber(match[3]),
        brawlPlanetStarPlayer: asNumber(match[4]),
      });
    }
  }

  return rows;
}

/** Extrai as dez primeiras composições literais publicadas na tabela Teams de cada mapa. */
export function parseBrawlPlanetTeams(html: string, mapName: string, sourceUrl: string): BrawlPlanetMapTeam[] {
  const normalized = html.replaceAll('\\"', '"');
  // Algumas páginas expõem mais do que uma tabela Teams. A última tabela
  // publicada é a lista visível atual do mapa (por exemplo, Brock–Pearl–Bolt
  // em Flaring Phoenix), por isso é a única usada pelo Draft.
  const teamTables = Array.from(normalized.matchAll(/<table\b[\s\S]*?<\/table>/gi))
    .map((match) => match[0])
    .filter((table) => {
      const header = decodeHtmlText(table.slice(0, 2200)).toLocaleLowerCase();
      return header.includes("team") && header.includes("win");
    });
  const teamTable = teamTables.at(-1);
  if (!teamTable) return [];

  const teams: BrawlPlanetMapTeam[] = [];
  for (const rowMatch of Array.from(teamTable.matchAll(/<tr\b[\s\S]*?<\/tr>/gi))) {
    const cells = Array.from(rowMatch[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => decodeHtmlText(match[1]));
    if (cells.length < 3) continue;
    const brawlers = cells[1]
      .split(/[·•]/)
      .map((member) => canonicalBrawlerName(mapName, member.trim()))
      .filter(Boolean);
    const winRate = percentFromCell(cells[2]);
    if (brawlers.length !== 3 || winRate === null) continue;
    teams.push({ map: mapName, brawlers, winRate, sourceUrl });
  }
  return teams.slice(0, 10);
}

/**
 * Descobre a rotação Ranked publicada. Falhar aqui não é grave: a junção com a
 * lista do projeto trata disso e assinala a leitura como incompleta, o que
 * impede que a ausência de resposta seja lida como "saíram mapas".
 */
/**
 * A rotação lida no navegador, quando o índice recusar o pedido daqui.
 *
 * O `topbrawl.com` responde 403 a esta rede de forma permanente, e é do índice
 * que vem a lista de mapas de agora. Sem esta via, uma rotação nova só entrava
 * quando alguém editasse a lista do projeto à mão — e foi assim que o site
 * ficou a recolher mapas que já tinham saído.
 */
async function rotacaoDoNavegador(): Promise<RankedRotationReading | null> {
  const guardada = lerRotacaoGuardada(await getSetting(ROTACAO_GUARDADA_SETTING));
  if (!guardada) return null;
  console.log(`[RankedSync] Rotação vinda da extensão: ${guardada.maps.length} mapas, lida em ${guardada.capturedAt}.`);
  return { maps: guardada.maps, complete: true, note: `Rotação lida no navegador em ${guardada.capturedAt}.` };
}

async function collectRankedRotation(): Promise<RankedRotationReading> {
  try {
    const html = await fetchText("https://topbrawl.com/rankeds");
    const lido = parseRankedRotationIndex(html);
    console.log(`[RankedSync] Índice do TopBrawl lido: ${lido.maps.length} mapas, ${lido.complete ? "completo" : "incompleto"}.`);
    // Um índice ilegível daqui não apaga a leitura boa feita no navegador.
    if (!lido.complete) return (await rotacaoDoNavegador()) ?? lido;
    return lido;
  } catch (error) {
    /**
     * Esta falha ficava só numa nota dentro da snapshot.
     *
     * É a primeira coisa que a recolha faz e a que decide tudo o resto. Quando
     * o TopBrawl não responde, era aqui que se percebia — mas só quem fosse ler
     * a nota no painel. Nos registos não havia nada, e a procura pela razão de
     * os números não mudarem começava sempre pelo sítio errado.
     */
    const detalhe = error instanceof Error ? error.message : "erro";
    console.warn(`[RankedSync] Índice do TopBrawl inacessível: ${detalhe}`);
    const doNavegador = await rotacaoDoNavegador();
    if (doNavegador) return doNavegador;
    return {
      maps: [],
      complete: false,
      note: `Índice de rankeds inacessível: ${detalhe}`,
    };
  }
}

async function collectTopBrawl(rotation: readonly DiscoveredRankedMap[]): Promise<SourceResult> {
  const rows = new Map<string, Partial<SyncRow>>();

  /**
   * O que foi recolhido fora vem primeiro, e não se volta a pedir.
   *
   * O `topbrawl.com` responde 403 a pedidos vindos daqui — o mesmo pedido
   * funcionava na plataforma anterior, por isso o que incomoda não é o pedido,
   * é a origem da rede. A recolha passou a correr onde a porta está aberta e a
   * enviar o resultado para cá.
   *
   * Pedir na mesma o que já se tem seria insistir contra quem recusa, sem nada
   * a ganhar. Um mapa só é pedido em direto quando não houver recolha dele — e
   * se essa porta estiver fechada, falha depressa e a recolha de fora cobre o
   * que importa.
   */
  const guardadas = await listRankedMapCaptures();
  const porMapa = new Map(guardadas.map((linha) => [linha.mapId, linha]));
  const emFalta: DiscoveredRankedMap[] = [];
  /** A hora a que cada mapa aproveitado foi mesmo lido no TopBrawl. */
  const leituras: number[] = [];
  for (const mapa of rotation) {
    const guardada = porMapa.get(mapa.id);
    if (!guardada) { emFalta.push(mapa); continue; }
    try {
      const linhas = JSON.parse(guardada.payload) as TopBrawlRow[];
      for (const [brawler, linha] of linhasParaSyncRows(linhas, mapa.name)) rows.set(`${mapa.name}::${brawler}`, linha);
      const lido = guardada.capturedAt ? new Date(guardada.capturedAt).getTime() : NaN;
      if (Number.isFinite(lido)) leituras.push(lido);
    } catch {
      emFalta.push(mapa);
    }
  }
  if (guardadas.length) console.log(`[RankedSync] TopBrawl: ${guardadas.length} mapas vindos de recolha externa, ${emFalta.length} por pedir em direto.`);

  const results = await mapLimited(emFalta, 2, async ({ name: mapName, id: mapId }) => {
      try {
        const html = await fetchText(`https://topbrawl.com/rankeds/${mapId}?rows=106`);
        return { mapName, parsed: parseTopBrawl(html, mapName), error: null };
      } catch (error) {
        return { mapName, parsed: new Map<string, Partial<SyncRow>>(), error: `${mapName}: ${error instanceof Error ? error.message : "erro"}` };
      }
    }
  );
  const errors = results.filter(result => result.error).map(result => result.error as string);
  for (const result of results) {
    for (const [brawler, row] of Array.from(result.parsed.entries())) rows.set(`${result.mapName}::${brawler}`, row);
  }
  // Um mapa recolhido fora conta como lido: se não contasse, uma recolha
  // completa por essa via aparecia como falha total e a snapshot era recusada.
  const successful = results.filter(result => result.parsed.size > 0).length + (rotation.length - emFalta.length);
  // Um mapa pedido agora e respondido agora foi lido agora; a recolha guardada
  // foi lida quando o navegador a fez. O mais antigo dos dois manda.
  if (results.some((result) => result.parsed.size > 0)) leituras.push(Date.now());
  return {
    status: successful === rotation.length ? "success" : successful > 0 ? "partial" : "failed",
    lidoEm: leituras.length ? new Date(Math.min(...leituras)).toISOString() : null,
    rows,
    /**
     * Quantas linhas cada mapa trouxe — é a prova que tira um mapa novo da
     * quarentena. Um mapa vindo de recolha externa tem de contar aqui: se não
     * contasse, ficaria com zero linhas e seria tratado como mapa sem leitura,
     * que é o oposto do que aconteceu.
     */
    rowsByMap: new Map([
      ...rotation
        .filter((mapa) => !emFalta.some((falta) => falta.id === mapa.id))
        .map((mapa): [string, number] => [
          mapa.name,
          Array.from(rows.keys()).filter((chave) => chave.startsWith(`${mapa.name}::`)).length,
        ]),
      ...results.map((result): [string, number] => [result.mapName, result.parsed.size]),
    ]),
    note: errors.length
      ? errors.slice(0, 3).join(" | ")
      : successful === 0
        ? "As respostas foram recebidas, mas o parser não encontrou linhas numéricas publicadas."
        : undefined,
  };
}

async function collectBrawlPlanet(rotation: readonly DiscoveredRankedMap[]): Promise<SourceResult> {
  const rows = new Map<string, Partial<SyncRow>>();
  const results = await mapLimited(rotation, 2, async ({ name: mapName, planetSlug }) => {
      const slug = planetSlug ?? "";
      try {
        const sourceUrl = `https://www.brawlplanet.com/maps/${slug}`;
        const html = await fetchText(sourceUrl);
        return { mapName, parsed: parseBrawlPlanet(html, mapName), teams: parseBrawlPlanetTeams(html, mapName, sourceUrl), error: null };
      } catch (error) {
        return { mapName, parsed: new Map<string, Partial<SyncRow>>(), teams: [], error: `${mapName}: ${error instanceof Error ? error.message : "erro"}` };
      }
    }
  );
  const errors = results.filter(result => result.error).map(result => result.error as string);
  for (const result of results) {
    for (const [brawler, row] of Array.from(result.parsed.entries())) rows.set(`${result.mapName}::${brawler}`, row);
  }
  const successful = results.filter(result => result.parsed.size > 0).length;
  return {
    status: successful === rotation.length ? "success" : successful > 0 ? "partial" : "failed",
    // O Brawl Planet responde a partir daqui, por isso o que vier foi lido
    // nesta execução. Sem nada lido não há data nenhuma a declarar.
    lidoEm: successful > 0 ? new Date().toISOString() : null,
    rows,
    rowsByMap: new Map(results.map((result) => [result.mapName, result.parsed.size])),
    mapTeams: results.flatMap((result) => result.teams),
    note: errors.length
      ? errors.slice(0, 3).join(" | ")
      : successful === 0
        ? "As respostas foram recebidas, mas o parser não encontrou linhas numéricas publicadas."
        : undefined,
  };
}

/**
 * O que falta a um brawler novo antes de poder participar no Draft a sério.
 *
 * Um brawler recém-lançado aparece na API oficial no dia do lançamento, mas o
 * projeto ainda não sabe a classe dele (usada no desbónus de classe repetida)
 * nem o alcance do ataque (usado no bónus de abertura), e nenhuma fonte publicou
 * ainda estatísticas por mapa. Enumerar o que falta é o que permite à interface
 * dizer porquê, em vez de o esconder sem explicação.
 */
export function describeMissingBrawlerData(name: string, rows: number): string[] {
  const missing: string[] = [];
  const key = name.trim().toLowerCase();
  const hasClass = Object.keys(brawlerClassCatalog).some((entry) => entry.toLowerCase() === key);
  const hasRange = Object.entries(mainAttackRanges as Record<string, number | null>)
    .some(([entry, value]) => entry.toLowerCase() === key && typeof value === "number");

  if (!hasClass) missing.push("classe oficial");
  if (!hasRange) missing.push("alcance de ataque");
  if (rows < 1) missing.push("dados por mapa");
  return missing;
}

/**
 * Cobertura de cada mapa nesta recolha: o melhor número de linhas entre as duas
 * fontes. Serve de prova para tirar um mapa novo da quarentena — e usa o melhor,
 * não a soma, porque as duas fontes publicam os mesmos brawlers.
 */
function buildMapEvidence(
  rotation: readonly DiscoveredRankedMap[],
  topBrawl: SourceResult,
  brawlPlanet: SourceResult,
): RosterEvidence[] {
  return rotation.map(({ name }) => ({
    name,
    rows: Math.max(topBrawl.rowsByMap?.get(name) ?? 0, brawlPlanet.rowsByMap?.get(name) ?? 0),
  }));
}

/** Em quantos mapas cada brawler tem linha publicada nesta recolha. */
function buildBrawlerEvidence(rows: readonly RankedRow[], names: readonly string[]): RosterEvidence[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.score === null && row.winRate === null) continue;
    const key = row.brawler.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return names.map((name) => {
    const total = counts.get(name.trim().toLowerCase()) ?? 0;
    return { name, rows: total, missing: describeMissingBrawlerData(name, total) };
  });
}

export function mergeRows(topBrawl: SourceResult, brawlPlanet: SourceResult, rotation?: readonly DiscoveredRankedMap[]): RankedRow[] {
  const baseRows = new Map((allRankedRows as readonly SyncRow[]).map((row) => [`${row.map}::${row.brawler}`, row]));
  const sourceKeys = new Set([
    ...Array.from(baseRows.keys()),
    ...Array.from(topBrawl.rows.keys()),
    ...Array.from(brawlPlanet.rows.keys()),
  ]);
  const mergedRows = Array.from(sourceKeys).map(key => {
    const separator = key.indexOf("::");
    const map = separator >= 0 ? key.slice(0, separator) : key;
    const brawler = separator >= 0 ? key.slice(separator + 2) : key;
    const mapTemplate = rotation?.find(entry => entry.name === map) ?? allMapSummaries.find((summary) => summary.name === map)
      ?? (allRankedRows as readonly SyncRow[]).find((row) => row.map === map);
    const base = baseRows.get(key) ?? {
      map,
      mode: mapTemplate?.mode ?? "Ranked",
      modeId: mapTemplate?.modeId ?? "ranked",
      brawler,
      score: null,
      tier: null,
      dataStatus: "partial",
      rankedStatus: "active",
    };
    const top = topBrawl.rows.get(key) ?? {};
    const planet = brawlPlanet.rows.get(key) ?? {};
    const merged = { ...base, ...top, ...planet } as SyncRow;
    const winRate = merged.brawlPlanetWinRate ?? merged.topBrawlWinRate ?? merged.winRate ?? null;
    const planetPick = merged.brawlPlanetPickRate ?? null;
    const topUse = merged.topBrawlUseRate ?? null;
    const usageValues = [topUse, planetPick].filter((value): value is number => typeof value === "number");
    return {
      ...merged,
      winRate,
      usage: usageValues.length ? usageValues.reduce((sum, value) => sum + value, 0) / usageValues.length : merged.usage ?? null,
      dataStatus: winRate !== null && usageValues.length ? "complete" : "partial",
    };
  }) as RankedRow[];
  const naRotacao = rotation ? mergedRows.filter(row => rotation.some(map => map.name === row.map)) : mergedRows;
  return normalizeRankedRows(marcarQuemNaoEstaNoRanked(naRotacao));
}

/**
 * Um brawler sobre o qual NENHUMA fonte publicou nada não está no Ranked.
 *
 * POR QUE ISTO EXISTE
 *
 * O site marcava como `active` — elegível no Ranked — todos os brawlers, e
 * tinha a prova do contrário à frente. O Cosmo e o Vince apareciam nos 26
 * mapas, marcados elegíveis, com `score`, `tier` e as taxas das duas fontes
 * todos a `null`. Não são elegíveis: ainda não foram libertados para Ranked, e
 * é por isso mesmo que nem o TopBrawl nem o Brawl Planet têm uma linha sobre
 * eles.
 *
 * As linhas nasciam assim porque o `base` de uma combinação mapa/brawler que
 * ainda não existia escrevia `rankedStatus: "active"` à cabeça — uma suposição
 * escrita uma vez, para uma pergunta a que os dados já respondem.
 *
 * Derivado, e não uma lista escrita à mão: no dia em que o Cosmo entrar no
 * Ranked, as fontes começam a publicá-lo e ele passa a elegível sozinho. Uma
 * lista teria de ser editada, e não seria — é o mesmo erro da tabela de imagens
 * e da etiqueta da extensão.
 *
 * A GUARDA QUE IMPEDE O DESASTRE
 *
 * Se as duas fontes falharem, ninguém tem números, e a regra ingénua concluiria
 * que o Ranked ficou sem brawlers. Uma leitura em falta nunca pode passar por
 * ausência: abaixo de metade do plantel com números, não se reclassifica nada.
 * É a mesma regra que protege a rotação em `MIN_PLAUSIBLE_MAPS`.
 */
export function marcarQuemNaoEstaNoRanked(rows: readonly RankedRow[]): RankedRow[] {
  const temNumeros = new Set<string>();
  const todos = new Set<string>();
  for (const row of rows) {
    todos.add(row.brawler);
    if (row.topBrawlWinRate != null || row.brawlPlanetWinRate != null
      || row.topBrawlUseRate != null || row.brawlPlanetPickRate != null) temNumeros.add(row.brawler);
  }
  // Recolha falhada, e não plantel encolhido: fica tudo como estava.
  if (temNumeros.size * 2 < todos.size) return rows as RankedRow[];

  const semNada = new Set([...todos].filter((brawler) => !temNumeros.has(brawler)));
  if (!semNada.size) return rows as RankedRow[];
  console.log(`[RankedSync] ${semNada.size} brawler(es) sem uma única linha das duas fontes: marcados como à espera do Ranked — ${[...semNada].join(", ")}.`);
  return rows.map((row) => semNada.has(row.brawler) ? { ...row, rankedStatus: "unavailable" as const } : row);
}

export function buildFallbackPayload(): SnapshotPayload {
  return {
      rows: allRankedRows,
      maps: deriveMapSummaries(allRankedRows, new Map(RANKED_MAP_SOURCES.map(([nome, id]) => [nome, id]))),
      mapTeams: [],
      officialBrawlers: [],
      updatedAt: new Date(0).toISOString(),
    sourceStatus: { topBrawl: "bundled", brawlPlanet: "bundled" },
  };
}

/**
 * Estado do roster guardado na última snapshot.
 *
 * Vive dentro do payload JSON, e não numa tabela nova, de propósito: assim não
 * há migração de base de dados para correr na publicação — e uma migração
 * falhada num deploy é exatamente o tipo de problema que este projeto não pode
 * dar-se ao luxo de ter. Se não houver estado anterior, devolve null e a
 * primeira avaliação trata toda a rotação como descoberta inicial.
 */
async function getPreviousRosterState(): Promise<RosterState | null> {
  try {
    const snapshot = await getRankedSyncSnapshot();
    if (!snapshot?.payload) return null;
    const payload = JSON.parse(snapshot.payload) as SnapshotPayload;
    const roster = payload.roster;
    if (!roster || !Array.isArray(roster.maps) || !Array.isArray(roster.brawlers)) return null;
    return roster;
  } catch {
    return null;
  }
}

export async function getPublicRankedSnapshot() {
  const snapshot = await getRankedSyncSnapshot();
  if (!snapshot) {
    return {
      version: "bundled-static",
      capturedAt: null,
      rowCount: allRankedRows.length,
      sourceStatus: { topBrawl: "bundled", brawlPlanet: "bundled" },
      // Catálogo do repositório: nunca foi lido de uma fonte nesta instalação,
      // por isso não há data de leitura a declarar. Nula é a resposta honesta.
      sourceReadAt: { topBrawl: null, brawlPlanet: null },
      sourceNotes: "Ainda não foi executada uma sincronização live; a interface usa a base incluída no projeto.",
      payload: buildFallbackPayload(),
    };
  }
  let payload: SnapshotPayload;
  try {
    payload = JSON.parse(snapshot.payload) as SnapshotPayload;
  } catch {
    payload = buildFallbackPayload();
  }
  const normalizedPayload = normalizeSnapshotPayload(payload);
  return {
    version: snapshot.version,
    capturedAt: snapshot.capturedAt,
    rowCount: normalizedPayload.rows.length,
    sourceStatus: { topBrawl: snapshot.topBrawlStatus, brawlPlanet: snapshot.brawlPlanetStatus },
    /**
     * Snapshots gravadas antes de isto existir não trazem o campo. Nesse caso
     * não se devolve a hora da sincronização no lugar dele: dizer "não se sabe"
     * é correto, dizer "foi agora" seria exatamente a mentira que isto veio
     * corrigir.
     */
    sourceReadAt: normalizedPayload.sourceReadAt ?? { topBrawl: null, brawlPlanet: null },
    sourceNotes: snapshot.sourceNotes,
    payload: normalizedPayload,
  };
}

export async function syncRankedData(trigger: "scheduled" | "manual" | "bootstrap") {
  const runId = await createRankedSyncRun(trigger);
  const startedAt = new Date();
  await updateRankedSyncConfig({ lastStatus: "running", lastStartedAt: startedAt, lastError: null });
  try {
    /**
     * A rotação é lida antes de tudo o resto: é ela que decide QUE mapas vão ser
     * recolhidos. Um mapa que entrou na rotação passa a ser recolhido na mesma
     * sincronização em que é descoberto, sem ninguém editar código.
     */
    const discovered = await collectRankedRotation();
    const prior = await getRankedSyncSnapshot();
    const priorPayload = prior?.payload ? JSON.parse(prior.payload) as SnapshotPayload : undefined;
    /**
     * Um índice ilegível só é motivo para desistir se não houver mais nada.
     *
     * A guarda existe para que a ausência de resposta não seja lida como
     * "saíram mapas da rotação", e isso continua a valer. Mas ela desistia
     * ANTES de olhar para o que já estava guardado — e o `topbrawl.com`
     * responde 403 ao índice a partir daqui de forma permanente, por ser um
     * alojamento na nuvem. Resultado: com os 26 mapas recolhidos no navegador
     * e gravados na base, a sincronização morria na primeira linha e os
     * valores no ecrã nunca mudavam, sem nada nos registos a seguir ao aviso
     * do 403.
     *
     * A rotação não se perde por seguir em frente: `mergeRotationSources` cai
     * na lista do projeto e marca a leitura como incompleta, que é
     * exatamente o que essa marca existe para dizer.
     */
    const mapasGuardados = await countRankedMapCaptures();
    if (!discovered.complete && !mapasGuardados && priorPayload?.rows.length) throw new Error("Índice da rotação incompleto e sem recolha externa; última rotação e dados preservados.");
    if (!discovered.complete && mapasGuardados) console.log(`[RankedSync] Índice indisponível, mas há ${mapasGuardados} mapas recolhidos no navegador: a sincronização segue com a rotação do projeto.`);
    const rotation = mergeRotationSources(RANKED_MAP_SOURCES, discovered);
    if (rotation.note) console.log(`[RankedSync] Rotação: ${rotation.note}`);

    const [topBrawl, brawlPlanet] = await Promise.all([
      collectTopBrawl(rotation.maps),
      collectBrawlPlanet(rotation.maps),
    ]);
    console.log(`[RankedSync] TopBrawl: ${topBrawl.status} · Brawl Planet: ${brawlPlanet.status} · ${rotation.maps.length} mapas pedidos.`);
    const rows = mergeRows(topBrawl, brawlPlanet, rotation.maps);
    const hasLiveSource = topBrawl.status !== "failed" || brawlPlanet.status !== "failed";
    if (!hasLiveSource) throw new Error("As duas fontes falharam; a última snapshot válida foi preservada.");

    const capturedAt = new Date();
    let officialBrawlers: OfficialBrawlerSnapshot[] = [];
  try {
    officialBrawlers = (await fetchOfficialBrawlers())
      .flatMap((brawler): OfficialBrawlerSnapshot[] => {
        const id = Number(brawler?.id);
        const name = typeof brawler?.name === "string" ? brawler.name.trim() : "";
        return Number.isInteger(id) && id > 0 && name ? [{ id, name }] : [];
      });
    if (officialBrawlers.length > 0) {
      console.log(`[RankedSync] Sincronização integrada com a API oficial do Brawl Stars (${officialBrawlers.length} brawlers descarregados).`);
    } else {
      console.log(`[RankedSync] API oficial do Brawl Stars sem resposta ativa ou chave pendente de permissão/IP. A usar fontes web por fallback.`);
    }
  } catch (apiErr) {
    console.warn(`[RankedSync] Aviso ao consultar API oficial (fallback web ativo):`, apiErr);
  }
    /**
     * Avaliação do roster. Duas regras importam mais do que todo o resto:
     *
     * - A leitura de mapas só é "completa" quando o índice foi lido com um
     *   resultado plausível E as duas fontes por mapa não falharam. Sem isso,
     *   uma falha de rede seria interpretada como saída de mapas.
     * - A leitura de brawlers só existe quando a API oficial respondeu. Sem
     *   chave configurada não há leitura nenhuma — e não ter leitura é muito
     *   diferente de ler uma lista vazia.
     */
    const previousRoster = await getPreviousRosterState();
    const collectionHealthy = topBrawl.status !== "failed" && brawlPlanet.status !== "failed";
    const officialNames = officialBrawlers.map((brawler) => brawler.name);
    const evaluation = evaluateRoster(previousRoster, {
      maps: { present: rotation.maps.map((map) => map.name), complete: rotation.complete && collectionHealthy },
      mapEvidence: buildMapEvidence(rotation.maps, topBrawl, brawlPlanet),
      ...(officialNames.length
        ? {
          brawlers: { present: officialNames, complete: true },
          brawlerEvidence: buildBrawlerEvidence(rows, officialNames),
        }
        : {}),
      now: capturedAt.toISOString(),
    });
    for (const change of evaluation.changes) {
      console.log(`[RankedSync] Roster · ${change.kind === "map" ? "mapa" : "brawler"} "${change.name}": ${change.change}${change.detail ? ` (${change.detail})` : ""}`);
    }

    const version = `live-${capturedAt.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
    /**
     * Os ids da rotação acabada de ler acompanham os cartões de mapa. É o que
     * permite a um mapa que entrou na rotação ter imagem sem ninguém editar uma
     * tabela — o id é o mesmo que a Brawlify usa para a publicar.
     */
    const idsDaRotacao = new Map(rotation.maps.flatMap((mapa) => mapa.id ? [[mapa.name, mapa.id] as const] : []));
    const payload: SnapshotPayload = {
      rows,
      maps: deriveMapSummaries(rows, idsDaRotacao),
      mapTeams: brawlPlanet.mapTeams ?? [],
      officialBrawlers,
      roster: evaluation.state,
      rosterChanges: evaluation.changes,
      updatedAt: capturedAt.toISOString(),
      sourceStatus: { topBrawl: topBrawl.status, brawlPlanet: brawlPlanet.status },
      /**
       * A hora desta sincronização fica em `updatedAt`; aqui fica quando cada
       * fonte foi MESMO lida. Quando o TopBrawl entra por capturas do
       * navegador, esta sincronização acontece hoje mas os números são do dia
       * da captura — e é essa a data que o ecrã tem de mostrar.
       */
      sourceReadAt: { topBrawl: topBrawl.lidoEm ?? null, brawlPlanet: brawlPlanet.lidoEm ?? null },
    };
    const sourceNotes = [topBrawl.note, brawlPlanet.note, rotation.note].filter(Boolean).join(" | ") || null;
    const savedSnapshot = await upsertRankedSyncSnapshot({
      id: 1,
      version,
      capturedAt,
      rowCount: rows.length,
      topBrawlStatus: topBrawl.status,
      brawlPlanetStatus: brawlPlanet.status,
      sourceNotes,
      payload: JSON.stringify(payload),
    });
    if (!savedSnapshot?.payload) throw new Error("A base não confirmou a gravação da ranqueada.");
    const rankedEvent: RankedSnapshotEvent = {
      version,
      capturedAt: capturedAt.toISOString(),
      syncState: topBrawl.status === "success" && brawlPlanet.status === "success" ? "success" : "partial",
      nextRefreshAt: getNextRefreshAt(capturedAt)?.toISOString() ?? null,
      sourceStatus: payload.sourceStatus,
      sourceNotes,
      sourceReadAt: payload.sourceReadAt,
      rowCount: rows.length,
      payload: normalizeSnapshotPayload(payload),
    };
    broadcastRankedSnapshot(rankedEvent);
    await updateRankedSyncRun(runId ?? 0, {
      status: "success",
      rowCount: rows.length,
      completedAt: capturedAt,
      topBrawlStatus: topBrawl.status,
      brawlPlanetStatus: brawlPlanet.status,
      error: null,
    });
    await updateRankedSyncConfig({
      lastStatus: "success",
      lastCompletedAt: capturedAt,
      lastError: null,
    });
    return { ok: true, version, rowCount: rows.length, topBrawl, brawlPlanet };
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    await updateRankedSyncRun(runId ?? 0, { status: "failed", completedAt, error: message });
    await updateRankedSyncConfig({ lastStatus: "failed", lastCompletedAt: completedAt, lastError: message });
    return { ok: false, error: message };
  }
}

export function getNextRefreshAt(capturedAt: Date | null) {
  if (!capturedAt) return null;
  return new Date(capturedAt.getTime() + ONE_HOUR_MS);
}
