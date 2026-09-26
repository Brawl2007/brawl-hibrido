/**
 * O general por IA: pede à Gemini (Google) um plano tático para o draft.
 *
 * PORQUÊ A GEMINI
 *
 * Tem chave gratuita (aistudio.google.com/apikey), com limite por minuto e por
 * dia, e vê imagens — o mapa entra como imagem, para a IA ver paredes, mato e
 * objetivos em vez de adivinhar.
 *
 * A CHAVE
 *
 * Como a da Supercell: pode vir do ambiente (`GEMINI_API_KEY`) ou ser colada no
 * próprio site pelo dono e guardada na base de dados. Nunca volta ao navegador
 * — o ecrã só vê se existe e os últimos quatro caracteres. Vai no cabeçalho
 * `x-goog-api-key`, nunca no endereço, para não ficar escrita em registos.
 *
 * O MODELO
 *
 * Os nomes dos modelos mudam (e os antigos desligam-se). Em vez de fixar um,
 * pergunta-se à própria API que modelos a chave tem e ordenam-se: os "flash"
 * estáveis mais recentes primeiro, depois as versões de antevisão, depois os
 * "lite". `GEMINI_MODEL` no ambiente passa à frente de todos.
 *
 * QUANDO A GOOGLE FALHA
 *
 * No plano gratuito é comum: modelo sobrecarregado (503), limite por minuto
 * (429), erro interno (500) — este último sobretudo com o formato de resposta
 * estrito. Por isso cada pedido tenta o modelo seguinte da lista, e um erro
 * interno repete-se sem o formato estrito (a forma vai descrita no texto e a
 * resposta passa pelo mesmo filtro). Cada falha fica escrita nos registos com
 * o código e a mensagem da Google, e a mensagem final ao dono diz o que cada
 * modelo respondeu.
 */
import { ESQUEMA_DO_PLANO, FORMATO_DO_PLANO_EM_TEXTO, NOME_DO_MODO, lerPlanoDaIA, textoDoPedido, type Atualidade, type FonteConsultada, type OpcoesDeBuild, type PedidoDePlano, type PlanoDoGeneral } from "@shared/quadroDoGeneral";
import { TIPOS_DE_CASA, type TerrenoDoMapa } from "@shared/terrenoDoMapa";
import { getSetting, setSetting } from "./appSettings";
import { guardarRotulosDaIA, imagemDaBrawlify, obterTerreno } from "./terrenoDoMapa";
import { acharNaLista, normalizarNome, obterCatalogo, type CatalogoDeBuilds } from "./catalogoDeBuilds";
import { gerarJsonNaReserva, lerChaveDeReserva } from "./iaDeReserva";

export const GEMINI_API_KEY_SETTING = "geminiApiKey";
// Configurável só para testes locais com uma Gemini falsa; em produção é sempre a da Google.
const API = (process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");

type Buscar = typeof fetch;

export async function lerChaveDaGemini() {
  const doAmbiente = (process.env.GEMINI_API_KEY ?? "").trim();
  if (doAmbiente) return { key: doAmbiente, origin: "ambiente" as const };
  const daBase = (await getSetting(GEMINI_API_KEY_SETTING))?.trim();
  if (daBase) return { key: daBase, origin: "site" as const };
  return { key: "", origin: "nenhuma" as const };
}

export async function guardarChaveDaGemini(chave: string | null) {
  modelosDaChave.clear();
  await setSetting(GEMINI_API_KEY_SETTING, chave?.trim() || null);
}

/** Um erro com uma frase que o dono percebe e sabe o que fazer. */
export class ErroDoGeneral extends Error {}

/** A mensagem que a própria Google pôs no erro, curta. O corpo nunca traz a chave. */
export function mensagemDaGoogle(corpo: string) {
  try {
    const erro = (JSON.parse(corpo) as { error?: { message?: string; status?: string } }).error;
    const texto = [erro?.status, erro?.message].filter(Boolean).join(": ");
    if (texto) return texto.replace(/\s+/g, " ").slice(0, 220);
  } catch {
    // Não era JSON: fica o começo do texto.
  }
  return corpo.replace(/\s+/g, " ").slice(0, 160);
}

function erroDaGoogle(status: number, corpo: string) {
  const detalhe = mensagemDaGoogle(corpo);
  if (status === 429) return new ErroDoGeneral(`Chegaste ao limite gratuito da Google (por minuto ou por dia). Espera um pouco e tenta de novo. (${detalhe})`);
  if (status === 400 && /api key not valid|API_KEY_INVALID/i.test(corpo)) return new ErroDoGeneral("A Google não aceitou a chave. Confirma que copiaste a chave inteira do AI Studio.");
  if (status === 401 || status === 403) return new ErroDoGeneral(`A Google recusou a chave (sem permissão). Cria uma nova em aistudio.google.com/apikey. (${detalhe})`);
  if (status >= 500) return new ErroDoGeneral(`A Google falhou do lado dela (${status}). Tenta daqui a pouco. (${detalhe})`);
  return new ErroDoGeneral(`A Google respondeu ${status}: ${detalhe}`);
}

/** Um erro da Google com o código, para decidir se vale a pena tentar outra vez. */
class FalhaDaGoogle extends Error {
  constructor(readonly status: number, readonly detalhe: string, readonly corpo: string) {
    super(`${status} ${detalhe}`);
  }
}
/** Erros que outro modelo (ou outra tentativa) pode não ter. Chave errada não é um deles. */
const valeTentarOutro = (status: number) => status === 429 || status === 404 || status >= 500;

type ModeloDaLista = { name?: string; supportedGenerationMethods?: string[] };

/**
 * Os modelos a experimentar, pela ordem: "gemini-X-flash" estáveis do mais
 * recente para o mais antigo, depois os flash de antevisão, depois os
 * flash-lite. Nada de imagem, voz, "live" ou embeddings.
 */
export function ordenarModelos(lista: readonly ModeloDaLista[]) {
  const nomes = lista
    .filter((modelo) => modelo.supportedGenerationMethods?.includes("generateContent") && typeof modelo.name === "string")
    .map((modelo) => modelo.name!.replace(/^models\//, ""))
    .filter((nome) => nome.startsWith("gemini-") && !/image|tts|audio|live|embedding|robotics|computer/.test(nome));
  const versao = (nome: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(nome)?.[1] ?? 0);
  const maisRecente = (a: string, b: string) => versao(b) - versao(a) || a.localeCompare(b);
  const estaveis = nomes.filter((nome) => /^gemini-\d+(\.\d+)?-flash$/.test(nome)).sort(maisRecente);
  const antevisao = nomes.filter((nome) => /flash/.test(nome) && !/lite/.test(nome) && !estaveis.includes(nome)).sort(maisRecente);
  const lite = nomes.filter((nome) => /flash-lite/.test(nome)).sort(maisRecente);
  const ordem = [...estaveis, ...antevisao, ...lite];
  return ordem.length ? ordem : nomes.slice(0, 3);
}

/** O primeiro da ordem (o que o ecrã mostra ao guardar a chave). */
export function escolherModelo(lista: readonly ModeloDaLista[]) {
  return ordenarModelos(lista)[0] ?? null;
}

const modelosDaChave = new Map<string, string[]>();
/** Quantos modelos diferentes se tentam por pedido: chega para passar um sobrecarregado sem demorar minutos. */
const MODELOS_POR_PEDIDO = 4;

/**
 * Os modelos de um pedido: "flash" e "flash-lite" alternados. No plano
 * gratuito cada modelo tem o seu limite, e os "lite" têm limites bem maiores:
 * quando os "flash" chegam ao limite (429), um "lite" ainda responde.
 */
export function modelosDoPedido(ordem: readonly string[]) {
  const lite = ordem.filter((m) => /lite/.test(m)), outros = ordem.filter((m) => !/lite/.test(m));
  const mistura: string[] = [];
  for (let i = 0; i < Math.max(lite.length, outros.length); i++) {
    if (outros[i]) mistura.push(outros[i]);
    if (lite[i]) mistura.push(lite[i]);
  }
  return mistura.slice(0, MODELOS_POR_PEDIDO);
}

async function modelosPara(chave: string, buscar: Buscar) {
  const fixo = (process.env.GEMINI_MODEL ?? "").trim();
  const guardados = modelosDaChave.get(chave);
  if (guardados) return fixo ? [fixo, ...guardados.filter((m) => m !== fixo)] : guardados;
  const resposta = await buscar(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": chave }, signal: AbortSignal.timeout(15_000) });
  const corpo = await resposta.text();
  if (!resposta.ok) throw erroDaGoogle(resposta.status, corpo);
  const ordem = ordenarModelos((JSON.parse(corpo) as { models?: ModeloDaLista[] }).models ?? []);
  if (!ordem.length && !fixo) throw new ErroDoGeneral("A chave funciona, mas a Google não lhe dá nenhum modelo Gemini que escreva texto.");
  modelosDaChave.set(chave, ordem);
  return fixo ? [fixo, ...ordem.filter((m) => m !== fixo)] : ordem;
}

async function modeloPara(chave: string, buscar: Buscar) {
  return (await modelosPara(chave, buscar))[0];
}

/** Testa a chave pedindo a lista de modelos. Não gasta pedidos de geração. */
export async function testarChaveDaGemini(buscar: Buscar = fetch) {
  const { key } = await lerChaveDaGemini();
  if (!key) return { ok: false, reason: "Sem chave." };
  try {
    const modelo = await modeloPara(key, buscar);
    return { ok: true, reason: `Aceite. Modelo: ${modelo}.` };
  } catch (erro) {
    return { ok: false, reason: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** A imagem do mapa para a IA, pelo id (nunca por um endereço vindo do navegador). */
async function imagemParaAIA(mapaId: string | null | undefined, buscar: Buscar) {
  if (!mapaId) return null;
  const imagem = await imagemDaBrawlify("mapa", mapaId, buscar);
  return imagem ? { mime_type: imagem.tipo, data: imagem.dados.toString("base64") } : null;
}

type ParteDoPedido = Record<string, unknown>;

type RespostaDaGemini = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  }>;
};

/** Um pedido a um modelo. Um erro da Google volta como `FalhaDaGoogle`, com o código. */
async function gerar(chave: string, modelo: string, corpo: Record<string, unknown>, buscar: Buscar, limiteMs: number) {
  const resposta = await buscar(`${API}/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(limiteMs),
  });
  const texto = await resposta.text();
  if (!resposta.ok) throw new FalhaDaGoogle(resposta.status, mensagemDaGoogle(texto), texto);
  return JSON.parse(texto) as RespostaDaGemini;
}

const textoDaResposta = (dados: RespostaDaGemini) =>
  (dados.candidates?.[0]?.content?.parts ?? []).filter((parte) => !parte.thought).map((parte) => parte.text ?? "").join("").trim();

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Um pedido com resposta em JSON, já lido, a tentar vários modelos.
 *
 * Por modelo: primeiro com o formato estrito; se a Google der erro interno
 * (500), outra vez sem ele, com `formatoEmTexto` no fim do pedido. Um 429, 503
 * ou 404 passa ao modelo seguinte. Chave recusada pára logo: nenhum modelo a
 * vai aceitar.
 */
async function gerarJson(
  chave: string,
  partes: ParteDoPedido[],
  esquema: unknown,
  buscar: Buscar,
  temperatura: number,
  formatoEmTexto: string,
  tarefa: string,
  pausaMs = 1200,
): Promise<{ json: unknown; modelo: string }> {
  const modelos = modelosDoPedido(await modelosPara(chave, buscar));
  const falhas: string[] = [];
  let ultima: FalhaDaGoogle | null = null;
  for (const modelo of modelos) {
    for (const estrito of [true, false]) {
      const config = estrito
        ? { responseMimeType: "application/json", responseSchema: esquema, temperature: temperatura }
        : { responseMimeType: "application/json", temperature: temperatura };
      const conteudo = estrito ? partes : [...partes, { text: formatoEmTexto }];
      try {
        const dados = await gerar(chave, modelo, { contents: [{ role: "user", parts: conteudo }], generationConfig: config }, buscar, 90_000);
        const texto = textoDaResposta(dados);
        if (!texto) {
          falhas.push(`${modelo}: sem resposta (${dados.candidates?.[0]?.finishReason ?? "sem motivo"})`);
          break;
        }
        try {
          return { json: JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, "")), modelo };
        } catch {
          falhas.push(`${modelo}: resposta que não é JSON`);
          if (estrito) break;
          continue;
        }
      } catch (erro) {
        if (!(erro instanceof FalhaDaGoogle)) {
          falhas.push(`${modelo}: ${erro instanceof Error ? erro.message : String(erro)}`);
          break;
        }
        ultima = erro;
        console.warn(`[General] ${tarefa}: ${modelo}${estrito ? "" : " (sem formato estrito)"} respondeu ${erro.status}: ${erro.detalhe}`);
        falhas.push(`${modelo}: ${erro.status}${erro.detalhe ? ` ${erro.detalhe.slice(0, 90)}` : ""}`);
        // Um 400 que não é da chave, com o formato estrito, é o esquema que a Google não aceitou: repete-se sem ele.
        const esquemaRecusado = estrito && erro.status === 400 && !/api key not valid|API_KEY_INVALID/i.test(erro.corpo);
        if (!valeTentarOutro(erro.status) && !esquemaRecusado) throw erroDaGoogle(erro.status, erro.corpo);
        if (erro.status === 404) modelosDaChave.delete(chave);
        // Só um erro interno ou um esquema recusado justificam repetir o MESMO modelo sem o formato estrito.
        if (!(estrito && (erro.status === 500 || esquemaRecusado))) break;
      }
    }
    if (pausaMs) await esperar(pausaMs);
  }
  if (ultima && falhas.every((falha) => / 429/.test(falha))) throw erroDaGoogle(429, ultima.corpo);
  throw new ErroDoGeneral(`A Google não conseguiu responder (${tarefa}). Tentei ${falhas.length} vez(es): ${falhas.join(" · ")}. Tenta daqui a um minuto.`);
}

const ESQUEMA_DOS_ROTULOS = {
  type: "OBJECT",
  properties: {
    rotulos: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { id: { type: "STRING" }, tipo: { type: "STRING", enum: [...TIPOS_DE_CASA] } }, required: ["id", "tipo"] },
    },
  },
  required: ["rotulos"],
} as const;

/**
 * A IA diz o que é cada grupo de cor do terreno (ver `shared/terrenoDoMapa.ts`).
 * Mostra-lhe a imagem e, de cada grupo, a cor e onde estão algumas casas —
 * em casas e em píxeis da imagem, para ela ir ver.
 */
export function textoDosRotulos(terreno: TerrenoDoMapa) {
  // Bases, água e zonas (ids com algarismos) foram lidas pela forma e pela cor fixa: não se perguntam.
  const linhas = terreno.grupos.filter((grupo) => /^[a-z]$/.test(grupo.id)).map((grupo) => {
    const exemplos: string[] = [];
    for (let i = 0; i < terreno.grelha.length && exemplos.length < 4; i++) {
      if (terreno.grelha[i] !== grupo.id) continue;
      const col = i % terreno.colunas, linha = Math.floor(i / terreno.colunas);
      exemplos.push(`casa (${col},${linha}) ≈ píxel (${(col + 1.5) * 30},${(linha + 1.5) * 30})`);
    }
    const hex = `#${grupo.cor.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    return `- grupo "${grupo.id}": cor média ${hex}, ${grupo.casas} casas; por exemplo ${exemplos.join("; ")}`;
  });
  return [
    "A imagem é um mapa de Brawl Stars visto de cima: 690×1050 píxeis, casas de 30 píxeis, com uma casa de margem à volta (a casa (0,0) começa no píxel (30,30)).",
    "Separei as casas que não são chão em grupos pela cor. Diz o que é cada grupo, olhando para esses sítios na imagem:",
    "- parede: bloqueia movimento e tiros (caixas, pedras, barris, cactos, cercas, plantas sólidas)",
    "- destrutivel: jarro ou vaso solto que se parte com ataques normais (barris e caixas NÃO: são parede)",
    "- mato: arbustos/relva alta onde os brawlers se escondem",
    "- agua: água ou buraco, não se pode andar",
    "- objetivo: desenhado no chão e não bloqueia (círculos de partida, zonas, balizas, cofre, mina de gemas)",
    "- chao: afinal é chão (sombras, decoração no chão)",
    "",
    ...linhas,
  ].join("\n");
}

const FORMATO_DOS_ROTULOS = 'Responde só com JSON, sem mais nada, nesta forma: {"rotulos":[{"id":"a","tipo":"parede"}]} — tipo é um de: chao, parede, destrutivel, mato, agua, objetivo.';

/** Pede os tipos à IA e guarda-os. Se falhar, fica a regra aproximada. */
export async function rotularTerrenoComIA(terreno: TerrenoDoMapa, buscar: Buscar = fetch) {
  const { key } = await lerChaveDaGemini();
  if (!key) throw new ErroDoGeneral("Ainda não há chave da Gemini.");
  const imagem = await imagemParaAIA(terreno.mapaId, buscar);
  if (!imagem) throw new ErroDoGeneral("Não consegui ir buscar a imagem deste mapa.");
  const { json } = await gerarJson(key, [{ text: textoDosRotulos(terreno) }, { inline_data: imagem }], ESQUEMA_DOS_ROTULOS, buscar, 0, FORMATO_DOS_ROTULOS, "ler o terreno");
  const rotulos = (json as { rotulos?: unknown })?.rotulos;
  return guardarRotulosDaIA(terreno, Array.isArray(rotulos) ? rotulos.filter((r) => /^[a-z]$/.test(String((r as { id?: unknown })?.id ?? ""))) : []);
}

/**
 * Informação ATUAL sobre os brawlers do draft, pesquisada na web pela própria
 * Gemini (pesquisa Google). O conhecimento do modelo tem data de corte e o
 * jogo muda a cada atualização — kits, números, builds. Isto é o que impede o
 * general de planear com o jogo de há um ano.
 *
 * É um pedido à parte, em texto livre, porque a pesquisa e a resposta em JSON
 * não se juntam em todos os modelos. Se falhar, o plano segue sem ela e o
 * pedido do plano diz à IA para não afirmar o que não sabe se ainda é assim.
 */
export async function pesquisarAtualidade(chave: string, modelos: readonly string[], pedido: PedidoDePlano, buscar: Buscar = fetch, hoje = new Date()): Promise<Atualidade | null> {
  const nomes = [...pedido.nossos, ...pedido.deles].map((item) => item.brawler);
  const pergunta = [
    `Hoje é ${hoje.toISOString().slice(0, 10)}. Pesquisa na web informação ATUAL (da atualização mais recente de Brawl Stars) sobre estes brawlers: ${nomes.join(", ")}.`,
    `Contexto: partida de Ranked no mapa ${pedido.mapa}, modo ${NOME_DO_MODO[pedido.modoId] ?? pedido.modoId}.`,
    "Para cada brawler, em 2 a 4 linhas curtas: o que o ataque e o super fazem hoje (alcance, tipo), se parte paredes, se atravessa água ou salta paredes, mudanças de equilíbrio recentes, e a build mais usada agora (gadget, poder estelar, engrenagens).",
    "Responde em português de Portugal. Se não encontrares algo, diz que não encontraste — não inventes.",
  ].join("\n");
  // A pesquisa tem limites próprios e diferentes por modelo: tenta dois.
  for (const modelo of modelos.slice(0, 2)) {
    try {
      const dados = await gerar(chave, modelo, { contents: [{ role: "user", parts: [{ text: pergunta }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } }, buscar, 60_000);
      const texto = textoDaResposta(dados).slice(0, 6000);
      if (!texto) continue;
      const fontes: FonteConsultada[] = [];
      for (const pedaco of dados.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
        const url = pedaco.web?.uri;
        if (!url || !/^https:\/\//.test(url) || fontes.some((f) => f.url === url)) continue;
        fontes.push({ titulo: (pedaco.web?.title ?? url).slice(0, 120), url: url.slice(0, 500) });
        if (fontes.length >= 8) break;
      }
      return { texto, fontes };
    } catch (erro) {
      const detalhe = erro instanceof FalhaDaGoogle ? `${erro.status}: ${erro.detalhe}` : erro instanceof Error ? erro.message : String(erro);
      console.warn(`[General] Pesquisa de atualidade com ${modelo} falhou (${detalhe}); o plano segue sem ela se nenhum modelo pesquisar.`);
      if (erro instanceof FalhaDaGoogle && !valeTentarOutro(erro.status)) return null;
    }
  }
  return null;
}

/** As builds reais dos nossos brawlers, para ir no pedido. */
export function opcoesDeBuild(catalogo: CatalogoDeBuilds | null, nossos: readonly string[]): OpcoesDeBuild | null {
  if (!catalogo) return null;
  const porBrawler: OpcoesDeBuild["porBrawler"] = {};
  for (const nome of nossos) {
    const b = catalogo.brawlers[normalizarNome(nome)];
    if (b) porBrawler[nome] = { gadgets: b.gadgets.map((g) => g.nome), poderes: b.poderes.map((p) => p.nome) };
  }
  return { porBrawler, engrenagens: catalogo.engrenagens.map((g) => g.nome) };
}

/**
 * Confere a build de cada ordem com a lista real: o nome passa a ser o da
 * lista e ganha o desenho; o que não está na lista sai. Sem lista para um
 * brawler, a build dele sai toda — antes nada do que um nome inventado.
 */
export function conferirBuilds(plano: PlanoDoGeneral, catalogo: CatalogoDeBuilds | null) {
  for (const ordem of plano.ordens) {
    if (!ordem.build) continue;
    const doBrawler = catalogo?.brawlers[normalizarNome(ordem.brawler)];
    if (!doBrawler) {
      delete ordem.build;
      continue;
    }
    const gadget = acharNaLista(ordem.build.gadget, doBrawler.gadgets);
    const poder = acharNaLista(ordem.build.poderEstelar, doBrawler.poderes);
    const engrenagens = catalogo!.engrenagens.length
      ? ordem.build.engrenagens.map((nome) => acharNaLista(nome, catalogo!.engrenagens)).filter((g): g is NonNullable<typeof g> => Boolean(g))
      : [];
    if (!gadget && !poder && !engrenagens.length) {
      delete ordem.build;
      continue;
    }
    ordem.build = {
      gadget: gadget?.nome ?? "",
      poderEstelar: poder?.nome ?? "",
      engrenagens: engrenagens.map((g) => g.nome),
      imagens: { gadget: gadget?.imagem ?? null, poderEstelar: poder?.imagem ?? null, engrenagens: engrenagens.map((g) => g.imagem) },
    };
  }
  return plano;
}

let pedidoEmCurso = false;

/**
 * Pede o plano. Um de cada vez: um segundo clique enquanto o primeiro corre
 * gastaria um pedido do limite gratuito para nada.
 */
export async function pedirPlanoAoGeneral(pedido: PedidoDePlano, buscar: Buscar = fetch): Promise<{ plano: PlanoDoGeneral; modelo: string; comImagem: boolean; comPesquisa: boolean; terreno: TerrenoDoMapa | null }> {
  const { key } = await lerChaveDaGemini();
  const reserva = (await lerChaveDeReserva()).key;
  if (!key && !reserva) throw new ErroDoGeneral("Ainda não há chave da Gemini. Cola-a no quadro do general (é gratuita em aistudio.google.com/apikey).");
  if (pedidoEmCurso) throw new ErroDoGeneral("Já há um plano a ser pensado. Espera que termine.");
  pedidoEmCurso = true;
  try {
    // O terreno já não é rotulado pela IA a cada plano: a leitura pela imagem
    // chega (e o botão "Pedir à IA para ler o terreno" continua lá). Eram três
    // pedidos do limite gratuito gastos antes de o plano começar.
    const terreno = pedido.mapaId ? await obterTerreno(pedido.mapaId, buscar) : null;
    const modelos = key ? await modelosPara(key, buscar).then(modelosDoPedido).catch(() => [] as string[]) : [];
    const atualidade = key && modelos.length ? await pesquisarAtualidade(key, modelos, pedido, buscar) : null;
    const imagem = await imagemParaAIA(pedido.mapaId, buscar);
    const catalogo = await obterCatalogo(buscar).catch(() => null);
    const texto = textoDoPedido(pedido, Boolean(imagem), terreno, atualidade, new Date(), opcoesDeBuild(catalogo, pedido.nossos.map((n) => n.brawler)));
    const partes: ParteDoPedido[] = [{ text: texto }];
    if (imagem) partes.push({ inline_data: imagem });

    let resposta: { json: unknown; modelo: string; comImagem: boolean };
    try {
      if (!key) throw new ErroDoGeneral("Sem chave da Gemini.");
      const { json, modelo } = await gerarJson(key, partes, ESQUEMA_DO_PLANO, buscar, 0.4, FORMATO_DO_PLANO_EM_TEXTO, "fazer o plano");
      resposta = { json, modelo, comImagem: Boolean(imagem) };
    } catch (erroDaGemini) {
      // A Google no limite (ou em baixo): a IA de reserva faz o plano, se houver chave.
      if (!reserva) throw erroDaGemini;
      console.warn("[General] A Gemini não fez o plano; passa à IA de reserva:", erroDaGemini instanceof Error ? erroDaGemini.message : erroDaGemini);
      try {
        resposta = await gerarJsonNaReserva(reserva, `${texto}\n\n${FORMATO_DO_PLANO_EM_TEXTO}`, imagem, buscar);
      } catch (erroDaReserva) {
        const primeira = key && erroDaGemini instanceof Error ? `${erroDaGemini.message} ` : "";
        throw new ErroDoGeneral(`${primeira}${erroDaReserva instanceof Error ? erroDaReserva.message : String(erroDaReserva)}`);
      }
    }
    const plano = conferirBuilds(lerPlanoDaIA(resposta.json, pedido.nossos.map((item) => item.brawler), pedido.deles.map((item) => item.brawler), new Date(), terreno), catalogo);
    if (atualidade?.fontes.length) plano.fontes = atualidade.fontes;
    return { plano, modelo: resposta.modelo, comImagem: resposta.comImagem, comPesquisa: Boolean(atualidade), terreno };
  } finally {
    pedidoEmCurso = false;
  }
}
