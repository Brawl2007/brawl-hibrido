/**
 * A estratégia tática do fim do draft, pedida ao Jev — com cache, prazo curto
 * e caminho de recurso.
 *
 * O FLUXO
 *
 *   draft fechado → estado com dados reais → Jev (2 rondas de perguntas
 *   pequenas) → respostas validadas → EstrategiaTatica → navegador
 *
 * O SITE NUNCA PÁRA POR CAUSA DO JEV
 *
 * Sem TYPESAFE_API_KEY, sem créditos, em baixo, a demorar ou com uma resposta
 * que não se valida: devolve-se `motor: "indisponivel"` com o motivo, e o
 * quadro continua com o General de sempre (a IA padrão). Vai também a
 * estratégia base das regras do site, para a simulação — marcada como não
 * sendo do Jev.
 *
 * NÃO GASTAR PEDIDOS
 *
 * Uma estratégia válida fica em cache por mapa, modo, equipas, bans, elo e
 * data dos dados. O mesmo draft, pedido outra vez, não volta ao Jev. Uma conta
 * sem créditos ou com a chave recusada também fica lembrada uns minutos: não
 * vale a pena bater à porta em cada draft.
 *
 * QUEM PODE PEDIR
 *
 * Hoje só o dono (ver `podePedirAoJev`, chamado pelo router). A decisão fica
 * aqui, num sítio só: abrir a mais gente com um limite de pedidos por pessoa é
 * mudar esta função — sem mexer no resto.
 */
import { createHash } from "node:crypto";
import { conferirContraODraft, type EstrategiaTatica } from "@shared/estrategiaTatica";
import type { TerrenoDoMapa } from "@shared/terrenoDoMapa";
import {
  decisoesDaPrimeiraRonda,
  draftCompleto,
  estadoParaOJev,
  estrategiaDasRespostas,
  estrategiaPorRegras,
  perguntasDaPrimeiraRonda,
  perguntasDaSegundaRonda,
  type PedidoTatico,
} from "./decisoesTaticas";
import { ErroDoJev, configDoJev, perguntarAoJev, type TipoDeFalhaDoJev } from "./jevCliente";

export const AVISO_SEM_JEV = "Motor tático Jev indisponível — usando estratégia da IA padrão.";

export type ResultadoTatico =
  | { motor: "jev"; estrategia: EstrategiaTatica; modelo: string; segundos: number; emCache: boolean }
  | { motor: "indisponivel"; motivo: TipoDeFalhaDoJev | "draft-incompleto"; aviso: string; detalhe: string; estrategiaBase: EstrategiaTatica | null };

/** Quem pode pedir ao Jev. Hoje: só o dono (o router já o confirmou antes de chegar aqui). */
export function podePedirAoJev(utilizador: { role: string } | null | undefined) {
  return utilizador?.role === "admin";
}

/** O prazo inteiro (as duas rondas). A partida começa ~15 s depois do draft. */
export const PRAZO_DO_JEV_MS = 6_000;
/** O prazo de cada ronda: o Jev costuma responder em menos de um segundo. */
const PRAZO_DE_UMA_RONDA_MS = 4_000;

/* ---- Cache ---- */
const VALIDADE_DA_CACHE_MS = 6 * 60 * 60_000;
const MAXIMO_NA_CACHE = 300;
const cache = new Map<string, { estrategia: EstrategiaTatica; modelo: string; guardadaEm: number }>();
/** Conta sem créditos ou chave recusada: lembra-se uns minutos. */
const ESPERA_DEPOIS_DE_FALHA_DA_CONTA_MS = 5 * 60_000;
let falhaDaConta: { tipo: TipoDeFalhaDoJev; ate: number; detalhe: string } | null = null;

/** Esquece a cache e a falha da conta (para os testes, e quando a chave muda). */
export function esquecerCacheDoJev() {
  cache.clear();
  falhaDaConta = null;
}

/**
 * A chave da cache: o que muda a decisão. As equipas por ordem alfabética (a
 * ordem de escolha não muda o draft), a data dos dados (outro dia, outros
 * números) e o modelo. A chave da API NUNCA entra aqui.
 */
export function chaveDaCache(pedido: PedidoTatico, modelo: string) {
  const ordenar = (lista: readonly string[]) => [...lista].sort((a, b) => a.localeCompare(b));
  const partes = {
    mapa: pedido.mapa.toLowerCase(),
    modo: pedido.modoId,
    nossos: ordenar(pedido.nossos.map((n) => n.brawler)),
    deles: ordenar(pedido.deles.map((n) => n.brawler)),
    bans: ordenar(pedido.bans ?? []),
    elo: pedido.elo ?? null,
    dados: pedido.dadosDe?.slice(0, 10) ?? null,
    modelo,
  };
  return createHash("sha256").update(JSON.stringify(partes)).digest("hex");
}

const indisponivel = (motivo: Exclude<ResultadoTatico, { motor: "jev" }>["motivo"], detalhe: string, pedido: PedidoTatico): ResultadoTatico => ({
  motor: "indisponivel",
  motivo,
  aviso: AVISO_SEM_JEV,
  detalhe,
  estrategiaBase: estrategiaPorRegras(pedido),
});

export async function pedirEstrategiaTatica(
  pedido: PedidoTatico,
  dependencias: { terreno?: TerrenoDoMapa | null; buscar?: typeof fetch; env?: NodeJS.ProcessEnv; agora?: () => number; prazoMs?: number } = {},
): Promise<ResultadoTatico> {
  const agora = dependencias.agora ?? Date.now;
  const comecou = agora();
  if (!draftCompleto(pedido)) return indisponivel("draft-incompleto", "O Jev decide com três brawlers de cada lado.", pedido);
  const { chave, modelo: modeloPedido } = configDoJev(dependencias.env);
  if (!chave) return indisponivel("sem-chave", "Falta a variável TYPESAFE_API_KEY no servidor.", pedido);
  if (falhaDaConta && falhaDaConta.ate > agora()) return indisponivel(falhaDaConta.tipo, falhaDaConta.detalhe, pedido);

  const chaveDaEstrategia = chaveDaCache(pedido, modeloPedido);
  const guardada = cache.get(chaveDaEstrategia);
  if (guardada && agora() - guardada.guardadaEm < VALIDADE_DA_CACHE_MS) {
    return { motor: "jev", estrategia: guardada.estrategia, modelo: guardada.modelo, segundos: 0, emCache: true };
  }

  const prazo = dependencias.prazoMs ?? PRAZO_DO_JEV_MS;
  const falta = () => prazo - (agora() - comecou);
  try {
    const estado = estadoParaOJev(pedido, dependencias.terreno ?? null);
    const primeira = perguntasDaPrimeiraRonda(pedido);
    const r1 = await perguntarAoJev({ state: estado, questions: primeira.perguntas }, { limiteMs: Math.min(PRAZO_DE_UMA_RONDA_MS, falta()), buscar: dependencias.buscar, env: dependencias.env });
    const decisoes = decisoesDaPrimeiraRonda(r1.respostas, primeira.mapas);
    if (falta() <= 200) throw new ErroDoJev("timeout", "O Jev não decidiu a tempo.");
    const segunda = perguntasDaSegundaRonda(decisoes);
    const estadoComDecisoes = { ...estado, decisoesJaTomadas: { lanes: decisoes.lanes, confrontos: decisoes.confrontos, alvoPrioritario: decisoes.alvoPrioritario, maiorAmeaca: decisoes.maiorAmeaca, estilo: decisoes.estilo, abertura: decisoes.abertura, plano: decisoes.plano, prioridade: decisoes.prioridade } };
    const r2 = await perguntarAoJev({ state: estadoComDecisoes, questions: segunda.perguntas }, { limiteMs: Math.min(PRAZO_DE_UMA_RONDA_MS, falta()), buscar: dependencias.buscar, env: dependencias.env });
    const estrategia = estrategiaDasRespostas(pedido, { respostas: r1.respostas, decisoes }, { respostas: r2.respostas, mapas: segunda.mapas }, r1.modelo);
    if (cache.size >= MAXIMO_NA_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(chaveDaEstrategia, { estrategia, modelo: r1.modelo, guardadaEm: agora() });
    return { motor: "jev", estrategia, modelo: r1.modelo, segundos: Math.round((agora() - comecou) / 100) / 10, emCache: false };
  } catch (erro) {
    const falha = erro instanceof ErroDoJev ? erro : new ErroDoJev("indisponivel", "O Jev falhou.");
    // Só o tipo e o estado HTTP: nem a chave nem o pedido vão para os registos.
    console.warn(`[Jev] indisponível (${falha.tipo}${falha.status ? ` ${falha.status}` : ""}); o General segue com a IA padrão.`);
    if (falha.tipo === "sem-creditos" || falha.tipo === "chave-recusada") falhaDaConta = { tipo: falha.tipo, ate: agora() + ESPERA_DEPOIS_DE_FALHA_DA_CONTA_MS, detalhe: falha.message };
    return indisponivel(falha.tipo, falha.message, pedido);
  }
}

/** Uma estratégia que volta do navegador (para explicar): conferida de novo contra o draft. */
export function estrategiaRecebida(bruto: unknown, pedido: PedidoTatico) {
  return conferirContraODraft(bruto, { nossos: pedido.nossos.map((n) => n.brawler), deles: pedido.deles.map((n) => n.brawler) });
}
