/**
 * A IA de texto (Gemini, Groq, OpenAI…) a EXPLICAR a estratégia do Jev.
 *
 * Ela recebe as decisões já tomadas e a ordem de não mudar nenhuma. Mesmo
 * assim, não se confia: da resposta só se aproveita texto (resumo, uma
 * instrução por brawler, uma dica por fase, porquê) — qualquer campo com
 * lanes, alvos ou planos é ignorado, e a estratégia nem sequer passa por aqui
 * para ser devolvida: o navegador fica com a do Jev, congelada.
 *
 * Uma instrução que contradiga a lane decidida (ex.: "a Piper joga no mid"
 * quando o Jev a pôs na esquerda) é trocada pela instrução escrita a partir
 * das próprias decisões, e fica marcada como corrigida.
 */
import { ABERTURAS, ACOES_NO_CONFRONTO, ESTILOS, FASES_EXPLICADAS, MUDAR_DE_PLANO, NOME_DA_LANE, OBJETIVO_DO_MODO, PLANOS, PRIORIDADES, RESPOSTAS_AO_RECUO, RESPOSTAS_A_VANTAGEM, ROTACOES, laneDe, nomeDe, type EstrategiaTatica, type ExplicacaoTatica, type FaseExplicada, type Lane } from "@shared/estrategiaTatica";
import { NOME_DO_MODO } from "@shared/quadroDoGeneral";
import { ErroDoGeneral, gerarJson, lerChaveDaGemini, normalizarEscolha, type EscolhaDaIA } from "./generalIA";
import { gerarJsonNaReserva, lerChavesDeReserva, type ChaveDeReserva } from "./iaDeReserva";
import type { PedidoTatico } from "./decisoesTaticas";

export const INSTRUCAO_DE_EXPLICACAO = "Estas decisões foram definidas pelo motor tático. Não altere nenhuma decisão. Apenas explique ao jogador como executar este plano.";


/** As decisões em palavras (nomes das opções, não ids): é isto que a IA explica. */
export function decisoesEmTexto(e: EstrategiaTatica) {
  return {
    lanes: { esquerda: e.lanes.esquerda, mid: e.lanes.mid, direita: e.lanes.direita },
    confrontos: e.confrontos.map((c) => `${c.nosso} (${NOME_DA_LANE[c.lane]}) contra ${c.deles}: ${nomeDe(ACOES_NO_CONFRONTO, c.acao)}`),
    estilo: nomeDe(ESTILOS, e.estilo),
    abertura: nomeDe(ABERTURAS, e.abertura),
    rotacao: nomeDe(ROTACOES, e.rotacao),
    prioridade: nomeDe(PRIORIDADES, e.prioridade),
    alvoPrioritario: e.alvoPrioritario,
    maiorAmeaca: e.maiorAmeaca,
    plano: `${e.plano} — ${nomeDe(PLANOS, e.plano)}`,
    planoDeRecurso: `${e.planoDeRecurso} — ${nomeDe(PLANOS, e.planoDeRecurso)} (${nomeDe(MUDAR_DE_PLANO, e.mudarDePlano).toLowerCase()})`,
    condicoes: [
      `Se ${e.maiorAmeaca} avançar: ${e.condicoes.ameacaAvanca} ajuda.`,
      `Se perdermos a lane esquerda: ${e.condicoes.perdeEsquerda === "recuar" ? "a equipa recua" : `${e.condicoes.perdeEsquerda} roda para lá`}.`,
      `Se ganharmos vantagem: ${nomeDe(RESPOSTAS_A_VANTAGEM, e.condicoes.ganhaVantagem).toLowerCase()}.`,
      `Se o adversário recuar: ${nomeDe(RESPOSTAS_AO_RECUO, e.condicoes.inimigoRecua).toLowerCase()}.`,
    ],
    condicaoDeVitoria: e.condicaoDeVitoria,
  };
}

export function textoDaExplicacao(e: EstrategiaTatica, pedido: PedidoTatico) {
  const modo = NOME_DO_MODO[pedido.modoId] ?? pedido.modoId;
  return [
    INSTRUCAO_DE_EXPLICACAO,
    "",
    `Mapa: ${pedido.mapa}. Modo: ${modo}.${OBJETIVO_DO_MODO[pedido.modoId] ? ` Objetivo do modo: ${OBJETIVO_DO_MODO[pedido.modoId]}` : ""}`,
    `Duelos 1v1 do site (% de vantagem para nós): ${pedido.duelos.map((d) => `${d.nosso} contra ${d.deles} ${Math.round(d.vantagem)}%`).join("; ") || "—"}`,
    "",
    "DECISÕES DO MOTOR TÁTICO (fixas — não mudes nenhuma, não sugiras outras):",
    JSON.stringify(decisoesEmTexto(e), null, 1),
    "",
    "Escreve em português de Portugal, curto e direto, para um jogador ler em 20 segundos:",
    "- resumo: 1 frase, no máximo 20 palavras.",
    "- porBrawler: uma instrução por brawler da NOSSA equipa (os três), no máximo 20 palavras cada, a dizer como executar a lane, o confronto e as condições que lhe tocam.",
    `- porFase: uma dica por fase (${FASES_EXPLICADAS.join(", ")}), no máximo 15 palavras cada.`,
    "- justificativa: porquê este plano funciona com estes brawlers, no máximo 30 palavras.",
    "Não inventes habilidades nem números. Não mudes lanes, confrontos, alvo, estilo, rotação, prioridade, condições nem o plano.",
  ].join("\n");
}

export const ESQUEMA_DA_EXPLICACAO = {
  type: "OBJECT",
  properties: {
    resumo: { type: "STRING" },
    porBrawler: { type: "ARRAY", items: { type: "OBJECT", properties: { brawler: { type: "STRING" }, instrucao: { type: "STRING" } }, required: ["brawler", "instrucao"] } },
    porFase: { type: "ARRAY", items: { type: "OBJECT", properties: { fase: { type: "STRING", enum: [...FASES_EXPLICADAS] }, dica: { type: "STRING" } }, required: ["fase", "dica"] } },
    justificativa: { type: "STRING" },
  },
  required: ["resumo", "porBrawler", "porFase", "justificativa"],
} as const;

export const FORMATO_DA_EXPLICACAO = [
  "Responde só com um objeto JSON, sem texto antes nem depois:",
  '{"resumo":"...","porBrawler":[{"brawler":"Nome","instrucao":"..."}],"porFase":[{"fase":"abertura","dica":"..."}],"justificativa":"..."}',
  `fase: ${FASES_EXPLICADAS.join(", ")}.`,
].join("\n");

const texto = (valor: unknown, maximo: number) => (typeof valor === "string" ? valor.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximo) : "");
const normalizar = (nome: string) => nome.toLowerCase().replace(/[^a-z0-9]/g, "");

const PALAVRA_DA_LANE: Array<[RegExp, Lane]> = [[/^(mid|meio|centro)$/i, "mid"], [/^esquerd[ao]$/i, "esquerda"], [/^direit[ao]$/i, "direita"]];
/**
 * A instrução diz que o brawler JOGA noutra lane? ("joga no mid", "fica na
 * lane direita", "começa pela esquerda"). Rodar para o centro não conta: a
 * rotação decidida pode mandá-lo lá.
 */
export function contradizALane(instrucao: string, lane: Lane) {
  const padrao = /\b(joga|jogar|jogue|fica|ficar|fique|começa|começar|comece|coloca-te|posiciona-te)\b[^.;:]{0,20}?\b(?:no|na|pelo|pela|em)\s+(?:lane\s+)?(mid|meio|centro|esquerd[ao]|direit[ao])\b/giu;
  for (const [, , palavra] of instrucao.matchAll(padrao)) {
    const dita = PALAVRA_DA_LANE.find(([re]) => re.test(palavra))?.[1];
    if (dita && dita !== lane) return true;
  }
  return false;
}

/** A instrução escrita a partir das decisões (quando a da IA falta ou as contradiz). */
function instrucaoDasDecisoes(e: EstrategiaTatica, brawler: string) {
  const confronto = e.confrontos.find((c) => c.nosso === brawler)!;
  return `${NOME_DA_LANE[confronto.lane]} contra ${confronto.deles}: ${nomeDe(ACOES_NO_CONFRONTO, confronto.acao).toLowerCase()}.`;
}

/** Só texto sai daqui; a estratégia não é tocada. */
export function lerExplicacao(bruto: unknown, e: EstrategiaTatica): ExplicacaoTatica {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) throw new ErroDoGeneral("A IA não devolveu uma explicação.");
  const r = bruto as Record<string, unknown>;
  const nossos = [e.lanes.esquerda, e.lanes.mid, e.lanes.direita];
  const porNome = new Map(nossos.map((n) => [normalizar(n), n]));
  const porBrawler: ExplicacaoTatica["porBrawler"] = [];
  for (const item of Array.isArray(r.porBrawler) ? r.porBrawler.slice(0, 10) : []) {
    const brawler = porNome.get(normalizar(texto((item as Record<string, unknown>)?.brawler, 40)));
    const instrucao = texto((item as Record<string, unknown>)?.instrucao, 160);
    if (!brawler || !instrucao || porBrawler.some((p) => p.brawler === brawler)) continue;
    const lane = laneDe(e, brawler)!;
    porBrawler.push(contradizALane(instrucao, lane) ? { brawler, instrucao: instrucaoDasDecisoes(e, brawler), corrigida: true } : { brawler, instrucao });
  }
  // Quem ficou sem instrução recebe a das decisões.
  for (const brawler of nossos) if (!porBrawler.some((p) => p.brawler === brawler)) porBrawler.push({ brawler, instrucao: instrucaoDasDecisoes(e, brawler), corrigida: true });
  porBrawler.sort((a, b) => nossos.indexOf(a.brawler) - nossos.indexOf(b.brawler));
  const porFase: ExplicacaoTatica["porFase"] = [];
  for (const item of Array.isArray(r.porFase) ? r.porFase.slice(0, 12) : []) {
    const fase = texto((item as Record<string, unknown>)?.fase, 20) as FaseExplicada;
    const dica = texto((item as Record<string, unknown>)?.dica, 140);
    if (FASES_EXPLICADAS.includes(fase) && dica && !porFase.some((p) => p.fase === fase)) porFase.push({ fase, dica });
  }
  const resumo = texto(r.resumo, 200);
  const justificativa = texto(r.justificativa, 300);
  if (!resumo && !justificativa && porBrawler.every((p) => p.corrigida)) throw new ErroDoGeneral("A IA respondeu sem explicação utilizável.");
  return { resumo, porBrawler, porFase, justificativa };
}

/**
 * Pede a explicação à IA escolhida pelo dono (a mesma escolha do plano): a
 * principal primeiro, as outras se ela falhar. Prazo curto: a explicação vem
 * depois da estratégia e não a atrasa.
 */
export async function explicarEstrategia(e: EstrategiaTatica, pedido: PedidoTatico, escolhaRecebida: EscolhaDaIA = {}, buscar: typeof fetch = fetch): Promise<{ explicacao: ExplicacaoTatica; modelo: string }> {
  const escolha = normalizarEscolha(escolhaRecebida);
  const todasAsReservas = await lerChavesDeReserva();
  const principal = escolha.principal === "reserva" ? todasAsReservas[0]?.fornecedor.id ?? "reserva" : escolha.principal;
  const soReservas = escolha.soEssa && principal !== "gemini";
  const gemini = soReservas ? "" : (await lerChaveDaGemini()).key;
  const reservas = escolha.soEssa ? todasAsReservas.filter((r) => r.fornecedor.id === principal) : todasAsReservas;
  if (!gemini && !reservas.length) throw new ErroDoGeneral("Não há IA de texto com chave para explicar a estratégia (a estratégia do Jev continua válida).");
  const pedidoEmTexto = textoDaExplicacao(e, pedido);
  const limiteMs = 25_000;
  const pelaGemini = async () => gerarJson(gemini, [{ text: pedidoEmTexto }], ESQUEMA_DA_EXPLICACAO, buscar, 0.3, FORMATO_DA_EXPLICACAO, "explicar a estratégia", 1200, escolha.modelos.gemini, limiteMs);
  const pelaReserva = (reserva: ChaveDeReserva) => async () => {
    const r = await gerarJsonNaReserva(reserva, `${pedidoEmTexto}\n\n${FORMATO_DA_EXPLICACAO}`, null, buscar, 0.3, escolha.modelos[reserva.fornecedor.id] ?? escolha.modeloReserva, limiteMs);
    return { json: r.json, modelo: r.modelo };
  };
  const todas = [
    ...(gemini ? [{ id: "gemini", fazer: pelaGemini }] : []),
    ...reservas.map((r) => ({ id: r.fornecedor.id as string, fazer: pelaReserva(r) })),
  ];
  const tentativas = [...todas.filter((t) => t.id === principal), ...todas.filter((t) => t.id !== principal)];
  const falhas: string[] = [];
  for (const tentativa of tentativas) {
    try {
      const { json, modelo } = await tentativa.fazer();
      return { explicacao: lerExplicacao(json, e), modelo };
    } catch (erro) {
      falhas.push(erro instanceof Error ? erro.message : String(erro));
    }
  }
  throw new ErroDoGeneral(`A IA não conseguiu explicar (${falhas.join(" · ").slice(0, 300)}). A estratégia do Jev continua válida.`);
}
