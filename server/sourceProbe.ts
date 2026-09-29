/**
 * Sonda de diagnóstico das fontes públicas.
 *
 * POR QUE ISTO EXISTE
 *
 * Quando a resposta a "não está a atualizar" é "não sei porquê", já se perdeu.
 * Cada camada desta recolha pode falhar em silêncio, e três já falharam assim:
 *
 *  - o índice deixou de publicar os endereços das fichas (a recolha ficava com
 *    zero páginas e dizia apenas "índice incompleto");
 *  - um slug do catálogo dava 404 (uma ficha em 106, invisível);
 *  - e o pior caso de todos, que nenhum erro apanha: a página é descarregada
 *    com sucesso, o parser não reconhece nada lá dentro, e a recolha conclui —
 *    "completa" — sem trazer um único número novo.
 *
 * Esta sonda descarrega UMA página de cada fonte e diz, passo a passo, o que o
 * servidor realmente recebeu e o que o parser realmente extraiu. Não altera
 * dados nem toca na snapshot: é um instrumento de leitura.
 *
 * Foi escrita porque quem desenvolve não tem acesso à rede destas fontes; a
 * única forma honesta de saber o que se passa é perguntar ao servidor que tem.
 */

import { fetchText, parseBrawlScopeModePage } from "./counterSync";
import { brawlScopeIndexUrl, brawlScopeProfileUrl, DEFAULT_BRAWLSCOPE_RANK } from "../shared/brawlScopeViews";
import { findBrawlScopeSlugsInIndex, knownBrawlScopeSlugs } from "../shared/brawlScopeSlugs";
import { parseRankedRotationIndex } from "../shared/rankedRotationSource";
import { parsePLProdigyGuide, plProdigyGuideUrl } from "../shared/plProdigyParser";
import { probeOfficialApi, urlDaApi } from "./brawlStarsApi";

export type ProbeStep = {
  label: string;
  /** `ok` passou, `warn` funciona mas não como devia, `fail` é o que trava a recolha. */
  level: "ok" | "warn" | "fail";
  detail: string;
};

export type SourceProbeResult = {
  source: string;
  url: string;
  ok: boolean;
  bytes: number;
  error?: string;
  steps: ProbeStep[];
  /**
   * Pedaço do HTML à volta do sítio onde o parser devia ter encontrado alguma
   * coisa. Só aparece quando um passo falha.
   *
   * É a peça que faltava: quem corrige o parser não tem acesso à rede destas
   * fontes, e sem ver a marcação real só pode adivinhar. Foi a adivinhar que
   * se corrigiu a camada errada três vezes seguidas.
   */
  excerpt?: { label: string; html: string };
};

/** Recorta o HTML à volta da primeira ocorrência de um padrão, para inspeção. */
function excerpt(html: string, pattern: RegExp, antes = 260, depois = 900) {
  const match = pattern.exec(html);
  if (!match || match.index === undefined) {
    return html.slice(0, antes + depois);
  }
  return html.slice(Math.max(0, match.index - antes), match.index + depois);
}

const marca = (label: string, level: ProbeStep["level"], detail: string): ProbeStep => ({ label, level, detail });

/**
 * BrawlScope: a fonte com mais camadas, e por isso a que mais vezes falhou.
 * Testa o índice, testa uma ficha, e corre o parser real sobre ela.
 */
async function probeBrawlScope(brawler = "Shelly"): Promise<SourceProbeResult[]> {
  const resultados: SourceProbeResult[] = [];

  const indexUrl = brawlScopeIndexUrl({ rankId: DEFAULT_BRAWLSCOPE_RANK });
  const indexSteps: ProbeStep[] = [];
  let indexBytes = 0;
  let indexErro: string | undefined;
  try {
    const html = await fetchText(indexUrl, 0, { ignoreBlock: true });
    indexBytes = html.length;
    const links = findBrawlScopeSlugsInIndex(html);
    indexSteps.push(marca("Página recebida", "ok", `${html.length} caracteres`));
    indexSteps.push(links.length >= 80
      ? marca("Endereços no índice", "ok", `${links.length} fichas listadas`)
      : marca("Endereços no índice", "warn", `${links.length} fichas — o índice não publica a lista (é montada no navegador). A recolha usa o roster conhecido: ${knownBrawlScopeSlugs().length} fichas.`));
  } catch (error) {
    indexErro = error instanceof Error ? error.message : String(error);
    indexSteps.push(marca("Página recebida", "warn", `${indexErro} — não impede a recolha, que usa o roster conhecido.`));
  }
  resultados.push({ source: "BrawlScope · índice", url: indexUrl, ok: !indexErro, bytes: indexBytes, error: indexErro, steps: indexSteps });

  const fichaUrl = brawlScopeProfileUrl(brawler.toLowerCase(), { rankId: DEFAULT_BRAWLSCOPE_RANK });
  const fichaSteps: ProbeStep[] = [];
  let fichaBytes = 0;
  let fichaErro: string | undefined;
  let fichaExcerto: SourceProbeResult["excerpt"];
  try {
    const html = await fetchText(fichaUrl, 0, { ignoreBlock: true });
    fichaBytes = html.length;
    fichaSteps.push(marca("Página recebida", "ok", `${html.length} caracteres`));

    const parsed = parseBrawlScopeModePage(html, null, fichaUrl, []);
    if (!parsed) {
      // É isto que faz a vista inteira falhar: sem nome, a ficha é descartada.
      fichaSteps.push(marca("Nome do brawler", "fail", "O parser não encontrou o título da ficha. A marcação da página mudou; sem isto nenhuma ficha é aceite e nada atualiza."));
      fichaExcerto = { label: "HTML à volta do primeiro <h1>", html: excerpt(html, /<h1\b/i) };
    } else {
      fichaSteps.push(marca("Nome do brawler", "ok", parsed.brawler));

      const pares = Object.keys(parsed.everyMatchup?.deltas ?? {}).length;
      fichaSteps.push(pares >= 80
        ? marca("Tabela \"Every matchup\"", "ok", `${pares} confrontos lidos`)
        : marca("Tabela \"Every matchup\"", "fail", `${pares} confrontos — a página desceu ou a marcação mudou. É daqui que vêm os counters por modo; a zero, a recolha conclui sem trazer nada.`));

      const counters = parsed.counteredBy?.length ?? 0;
      const alvos = parsed.targets?.length ?? 0;
      fichaSteps.push(counters || alvos
        ? marca("Listas de counters", "ok", `${counters} em "Counter with", ${alvos} em "Punishes"`)
        : marca("Listas de counters", "fail", "Nenhuma das duas listas foi reconhecida. O parser procura <p>Counter with</p> e <p>Punishes</p>."));

      const sinergias = parsed.synergies?.length ?? 0;
      fichaSteps.push(sinergias
        ? marca("Lista \"Pair with\"", "ok", `${sinergias} aliados`)
        : marca("Lista \"Pair with\"", "fail", "Não reconhecida. É esta lista que alimenta o bónus de sinergia."));

      // Um excerto por cada modo de falha, e só quando falha.
      if (!pares) fichaExcerto = { label: "HTML à volta de \"Every matchup\"", html: excerpt(html, /Every\s*matchup/i) };
      else if (!counters && !alvos) fichaExcerto = { label: "HTML à volta de \"Counter with\"", html: excerpt(html, /Counter\s*with/i) };
      else if (!sinergias) fichaExcerto = { label: "HTML à volta de \"Pair with\"", html: excerpt(html, /Pair\s*with/i) };
    }
  } catch (error) {
    fichaErro = error instanceof Error ? error.message : String(error);
    fichaSteps.push(marca("Página recebida", "fail", fichaErro));
  }
  resultados.push({
    source: "BrawlScope · ficha",
    url: fichaUrl,
    ok: !fichaErro,
    bytes: fichaBytes,
    error: fichaErro,
    steps: fichaSteps,
    excerpt: fichaExcerto,
  });

  return resultados;
}

/** TopBrawl: o índice da rotação Ranked. */
async function probeTopBrawl(): Promise<SourceProbeResult> {
  const url = "https://topbrawl.com/rankeds";
  const steps: ProbeStep[] = [];
  let bytes = 0;
  try {
    const html = await fetchText(url, 0, { ignoreBlock: true });
    bytes = html.length;
    steps.push(marca("Página recebida", "ok", `${html.length} caracteres`));
    const rotacao = parseRankedRotationIndex(html);
    const mapas = rotacao?.maps?.length ?? 0;
    steps.push(mapas >= 12
      ? marca("Mapas da rotação", "ok", `${mapas} mapas reconhecidos`)
      : marca("Mapas da rotação", "fail", `${mapas} mapas — abaixo do mínimo plausível. A rotação fica na do projeto.`));
    return {
      source: "TopBrawl",
      url,
      ok: true,
      bytes,
      steps,
      // Sem ver a marcação à volta de /rankeds/<id>, corrigir o parser é adivinhar.
      excerpt: mapas >= 12 ? undefined : { label: "HTML à volta da primeira ligação /rankeds/", html: excerpt(html, /\/rankeds\/\d+/) },
    };
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    steps.push(marca("Página recebida", "fail", detalhe));
    return { source: "TopBrawl", url, ok: false, bytes, error: detalhe, steps };
  }
}

/** Brawl Planet: o índice de brawlers. */
async function probeBrawlPlanet(): Promise<SourceProbeResult> {
  const url = "https://www.brawlplanet.com/brawlers";
  const steps: ProbeStep[] = [];
  let bytes = 0;
  try {
    const html = await fetchText(url, 0, { ignoreBlock: true });
    bytes = html.length;
    steps.push(marca("Página recebida", "ok", `${html.length} caracteres`));
    const links = Array.from(new Set(Array.from(html.matchAll(/href=["']\/brawlers\/([^"'?#]+)["']/gi)).map((m) => m[1])));
    steps.push(links.length >= 80
      ? marca("Fichas no índice", "ok", `${links.length} brawlers listados`)
      : marca("Fichas no índice", "fail", `${links.length} brawlers — o índice deixou de publicar a lista.`));
    return { source: "Brawl Planet", url, ok: true, bytes, steps };
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    steps.push(marca("Página recebida", "fail", detalhe));
    return { source: "Brawl Planet", url, ok: false, bytes, error: detalhe, steps };
  }
}

/** PL Prodigy: uma guia. */
async function probePLProdigy(brawler = "Shelly"): Promise<SourceProbeResult> {
  const url = plProdigyGuideUrl(brawler);
  const steps: ProbeStep[] = [];
  let bytes = 0;
  try {
    const html = await fetchText(url, 0, { ignoreBlock: true });
    bytes = html.length;
    steps.push(marca("Página recebida", "ok", `${html.length} caracteres`));
    const guia = parsePLProdigyGuide(html, brawler, knownBrawlScopeSlugs().map((slug) => slug.replace(/-/g, " ")));
    steps.push(guia
      ? marca("Guia reconhecida", "ok", `${guia.targets.length} alvos, ${guia.counteredBy.length} counters`)
      : marca("Guia reconhecida", "fail", "Os dois títulos de matchup não foram encontrados na página."));
    return { source: "PL Prodigy", url, ok: true, bytes, steps };
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    steps.push(marca("Página recebida", "fail", detalhe));
    return { source: "PL Prodigy", url, ok: false, bytes, error: detalhe, steps };
  }
}

/**
 * IP de saída do servidor.
 *
 * A chave da API oficial do Brawl Stars fica PRESA ao IP que se declara ao
 * criá-la. Quem aloja o site normalmente não faz ideia de qual é esse IP, e sem
 * ele a chave é recusada com 403 — o mesmo sintoma de um bloqueio de fonte, mas
 * com outra causa e outra solução. Descobrir isto à mão é um beco; mostrá-lo
 * aqui transforma-o num copiar-colar.
 */
async function probeEgressIp(): Promise<SourceProbeResult> {
  const url = "https://api.ipify.org";
  const steps: ProbeStep[] = [];
  try {
    const ip = (await fetchText(url, 0, { ignoreBlock: true })).trim();
    const parece = /^[0-9a-f.:]{7,45}$/i.test(ip);
    steps.push(parece
      ? marca("IP de saída", "ok", `${ip} — é este que tens de declarar ao criar a chave da API oficial do Brawl Stars.`)
      : marca("IP de saída", "warn", `Resposta inesperada: ${ip.slice(0, 60)}`));
    return { source: "Servidor · IP de saída", url, ok: true, bytes: ip.length, steps };
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    steps.push(marca("IP de saída", "warn", `Não foi possível descobrir: ${detalhe}`));
    return { source: "Servidor · IP de saída", url, ok: false, bytes: 0, error: detalhe, steps };
  }
}

/**
 * API oficial do Brawl Stars.
 *
 * É a fonte que passou a construir a matriz de confrontos do site, depois de o
 * BrawlScope ter fechado a porta. Fica logo a seguir ao IP de saída de propósito:
 * as duas linhas lêem-se juntas, porque a falha mais comum aqui é precisamente
 * o IP declarado na chave não ser o deste servidor.
 */
async function probeOfficial(): Promise<SourceProbeResult> {
  const url = `${urlDaApi()}/brawlers`;
  const resultado = await probeOfficialApi();
  const nivel: ProbeStep["level"] = resultado.ok ? "ok" : resultado.configured ? "fail" : "warn";
  return {
    source: "API oficial · Brawl Stars",
    url,
    ok: resultado.ok,
    bytes: 0,
    error: resultado.ok ? undefined : resultado.reason,
    steps: [
      marca(resultado.configured ? `Resposta ${resultado.status ?? "—"}` : "Chave", nivel, resultado.reason),
      // Repetido em linha própria para ser fácil de copiar para o portal.
      ...(resultado.seenIp ? [marca("IP a acrescentar à chave", "warn", resultado.seenIp)] : []),
    ],
  };
}

/**
 * Corre a sonda em todas as fontes. Uma página por fonte — é diagnóstico, não
 * recolha. Nenhuma falha aqui pode rebentar: cada sonda devolve o seu resultado.
 */
export async function probeAllSources(): Promise<{ ranAt: string; results: SourceProbeResult[] }> {
  const [brawlScope, topBrawl, planet, prodigy, egresso, oficial] = await Promise.all([
    probeBrawlScope().catch((error) => [{ source: "BrawlScope", url: "", ok: false, bytes: 0, error: String(error), steps: [] }] as SourceProbeResult[]),
    probeTopBrawl(),
    probeBrawlPlanet(),
    probePLProdigy(),
    probeEgressIp(),
    probeOfficial(),
  ]);
  return { ranAt: new Date().toISOString(), results: [egresso, oficial, ...brawlScope, topBrawl, planet, prodigy] };
}
