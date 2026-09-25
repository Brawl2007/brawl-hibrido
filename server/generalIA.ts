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
 * pergunta-se à própria API que modelos a chave tem e escolhe-se o "flash"
 * estável mais recente — é o que o plano gratuito deixa usar com mais folga.
 * `GEMINI_MODEL` no ambiente passa por cima disto.
 */
import { ESQUEMA_DO_PLANO, NOME_DO_MODO, lerPlanoDaIA, textoDoPedido, type Atualidade, type FonteConsultada, type PedidoDePlano, type PlanoDoGeneral } from "@shared/quadroDoGeneral";
import { TIPOS_DE_CASA, type TerrenoDoMapa } from "@shared/terrenoDoMapa";
import { getSetting, setSetting } from "./appSettings";
import { guardarRotulosDaIA, imagemDaBrawlify, obterTerreno } from "./terrenoDoMapa";

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
  modeloEscolhido.clear();
  await setSetting(GEMINI_API_KEY_SETTING, chave?.trim() || null);
}

/** Um erro com uma frase que o dono percebe e sabe o que fazer. */
export class ErroDoGeneral extends Error {}

function erroDaGoogle(status: number, corpo: string) {
  if (status === 429) return new ErroDoGeneral("Chegaste ao limite gratuito da Google (por minuto ou por dia). Espera um pouco e tenta de novo.");
  if (status === 400 && /api key not valid|API_KEY_INVALID/i.test(corpo)) return new ErroDoGeneral("A Google não aceitou a chave. Confirma que copiaste a chave inteira do AI Studio.");
  if (status === 401 || status === 403) return new ErroDoGeneral("A Google recusou a chave (sem permissão). Cria uma nova em aistudio.google.com/apikey.");
  if (status >= 500) return new ErroDoGeneral("A Google está com problemas neste momento. Tenta daqui a pouco.");
  return new ErroDoGeneral(`A Google respondeu ${status}. ${corpo.slice(0, 160)}`);
}

type ModeloDaLista = { name?: string; supportedGenerationMethods?: string[] };

/**
 * Escolhe o modelo a partir da lista da API: o "gemini-X-flash" estável mais
 * recente; se não houver, o flash mais recente que não seja lite/imagem/voz;
 * se nem isso, o primeiro que gere texto.
 */
export function escolherModelo(lista: readonly ModeloDaLista[]) {
  const nomes = lista
    .filter((modelo) => modelo.supportedGenerationMethods?.includes("generateContent") && typeof modelo.name === "string")
    .map((modelo) => modelo.name!.replace(/^models\//, ""));
  const versao = (nome: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(nome)?.[1] ?? 0);
  const maisRecente = (a: string, b: string) => versao(b) - versao(a);
  const estavel = nomes.filter((nome) => /^gemini-\d+(\.\d+)?-flash$/.test(nome)).sort(maisRecente);
  if (estavel[0]) return estavel[0];
  const flash = nomes.filter((nome) => /^gemini-.*flash/.test(nome) && !/lite|image|tts|audio|live|thinking|embedding/.test(nome)).sort(maisRecente);
  if (flash[0]) return flash[0];
  return nomes.find((nome) => nome.startsWith("gemini-")) ?? null;
}

const modeloEscolhido = new Map<string, string>();

async function modeloPara(chave: string, buscar: Buscar) {
  const fixo = (process.env.GEMINI_MODEL ?? "").trim();
  if (fixo) return fixo;
  const guardado = modeloEscolhido.get(chave);
  if (guardado) return guardado;
  const resposta = await buscar(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": chave }, signal: AbortSignal.timeout(15_000) });
  const corpo = await resposta.text();
  if (!resposta.ok) throw erroDaGoogle(resposta.status, corpo);
  const modelo = escolherModelo((JSON.parse(corpo) as { models?: ModeloDaLista[] }).models ?? []);
  if (!modelo) throw new ErroDoGeneral("A chave funciona, mas a Google não lhe dá nenhum modelo Gemini que escreva texto.");
  modeloEscolhido.set(chave, modelo);
  return modelo;
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

/** Um pedido à Gemini com resposta em JSON, já lido. */
async function gerarJson(chave: string, modelo: string, partes: ParteDoPedido[], esquema: unknown, buscar: Buscar, temperatura: number) {
  const resposta = await buscar(`${API}/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      contents: [{ role: "user", parts: partes }],
      generationConfig: { responseMimeType: "application/json", responseSchema: esquema, temperature: temperatura },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const corpo = await resposta.text();
  if (!resposta.ok) {
    // O modelo guardado pode ter sido desligado: a próxima tentativa volta a escolher.
    if (resposta.status === 404) modeloEscolhido.delete(chave);
    throw erroDaGoogle(resposta.status, corpo);
  }
  const dados = JSON.parse(corpo) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }> };
  const texto = (dados.candidates?.[0]?.content?.parts ?? []).filter((parte) => !parte.thought).map((parte) => parte.text ?? "").join("").trim();
  if (!texto) throw new ErroDoGeneral(`A IA não respondeu (${dados.candidates?.[0]?.finishReason ?? "sem motivo"}). Tenta de novo.`);
  try {
    return JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, "")) as unknown;
  } catch {
    throw new ErroDoGeneral("A IA respondeu num formato que não consegui ler. Tenta de novo.");
  }
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
  const linhas = terreno.grupos.map((grupo) => {
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
    "- mato: arbustos/relva alta onde os brawlers se escondem",
    "- agua: água ou buraco, não se pode andar",
    "- objetivo: desenhado no chão e não bloqueia (círculos de partida, zonas, balizas, cofre, mina de gemas)",
    "- chao: afinal é chão (sombras, decoração no chão)",
    "",
    ...linhas,
  ].join("\n");
}

/** Pede os tipos à IA e guarda-os. Se falhar, fica a regra aproximada. */
export async function rotularTerrenoComIA(terreno: TerrenoDoMapa, buscar: Buscar = fetch) {
  const { key } = await lerChaveDaGemini();
  if (!key) throw new ErroDoGeneral("Ainda não há chave da Gemini.");
  const imagem = await imagemParaAIA(terreno.mapaId, buscar);
  if (!imagem) throw new ErroDoGeneral("Não consegui ir buscar a imagem deste mapa.");
  const modelo = await modeloPara(key, buscar);
  const json = await gerarJson(key, modelo, [{ text: textoDosRotulos(terreno) }, { inline_data: imagem }], ESQUEMA_DOS_ROTULOS, buscar, 0);
  return guardarRotulosDaIA(terreno, (json as { rotulos?: unknown })?.rotulos);
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
export async function pesquisarAtualidade(chave: string, modelo: string, pedido: PedidoDePlano, buscar: Buscar = fetch, hoje = new Date()): Promise<Atualidade | null> {
  const nomes = [...pedido.nossos, ...pedido.deles].map((item) => item.brawler);
  const pergunta = [
    `Hoje é ${hoje.toISOString().slice(0, 10)}. Pesquisa na web informação ATUAL (da atualização mais recente de Brawl Stars) sobre estes brawlers: ${nomes.join(", ")}.`,
    `Contexto: partida de Ranked no mapa ${pedido.mapa}, modo ${NOME_DO_MODO[pedido.modoId] ?? pedido.modoId}.`,
    "Para cada brawler, em 2 a 4 linhas curtas: o que o ataque e o super fazem hoje (alcance, tipo), se parte paredes, se atravessa água ou salta paredes, mudanças de equilíbrio recentes, e a build mais usada agora (gadget, poder estelar, engrenagens).",
    "Responde em português de Portugal. Se não encontrares algo, diz que não encontraste — não inventes.",
  ].join("\n");
  try {
    const resposta = await buscar(`${API}/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: pergunta }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resposta.ok) {
      console.warn(`[General] Pesquisa de atualidade recusada (${resposta.status}); o plano segue sem ela.`);
      return null;
    }
    const dados = await resposta.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
        groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
      }>;
    };
    const candidato = dados.candidates?.[0];
    const texto = (candidato?.content?.parts ?? []).filter((parte) => !parte.thought).map((parte) => parte.text ?? "").join("").trim().slice(0, 6000);
    if (!texto) return null;
    const fontes: FonteConsultada[] = [];
    for (const pedaco of candidato?.groundingMetadata?.groundingChunks ?? []) {
      const url = pedaco.web?.uri;
      if (!url || !/^https:\/\//.test(url) || fontes.some((f) => f.url === url)) continue;
      fontes.push({ titulo: (pedaco.web?.title ?? url).slice(0, 120), url: url.slice(0, 500) });
      if (fontes.length >= 8) break;
    }
    return { texto, fontes };
  } catch (erro) {
    console.warn("[General] Pesquisa de atualidade falhou; o plano segue sem ela:", erro instanceof Error ? erro.message : erro);
    return null;
  }
}

let pedidoEmCurso = false;

/**
 * Pede o plano. Um de cada vez: um segundo clique enquanto o primeiro corre
 * gastaria um pedido do limite gratuito para nada.
 */
export async function pedirPlanoAoGeneral(pedido: PedidoDePlano, buscar: Buscar = fetch): Promise<{ plano: PlanoDoGeneral; modelo: string; comImagem: boolean; comPesquisa: boolean; terreno: TerrenoDoMapa | null }> {
  const { key } = await lerChaveDaGemini();
  if (!key) throw new ErroDoGeneral("Ainda não há chave da Gemini. Cola-a no quadro do general (é gratuita em aistudio.google.com/apikey).");
  if (pedidoEmCurso) throw new ErroDoGeneral("Já há um plano a ser pensado. Espera que termine.");
  pedidoEmCurso = true;
  try {
    const modelo = await modeloPara(key, buscar);
    let terreno = pedido.mapaId ? await obterTerreno(pedido.mapaId, buscar) : null;
    // Na primeira vez em cada mapa, a IA diz o que é cada cor; fica guardado para sempre.
    if (terreno && terreno.rotulado === "regra") {
      try {
        terreno = await rotularTerrenoComIA(terreno, buscar);
      } catch (erro) {
        console.warn("[General] Rótulos do terreno por IA falharam; fica a regra:", erro instanceof Error ? erro.message : erro);
      }
    }
    const atualidade = await pesquisarAtualidade(key, modelo, pedido, buscar);
    const imagem = await imagemParaAIA(pedido.mapaId, buscar);
    const partes: ParteDoPedido[] = [{ text: textoDoPedido(pedido, Boolean(imagem), terreno, atualidade) }];
    if (imagem) partes.push({ inline_data: imagem });
    const json = await gerarJson(key, modelo, partes, ESQUEMA_DO_PLANO, buscar, 0.4);
    const plano = lerPlanoDaIA(json, pedido.nossos.map((item) => item.brawler), pedido.deles.map((item) => item.brawler), new Date(), terreno);
    if (atualidade?.fontes.length) plano.fontes = atualidade.fontes;
    return { plano, modelo, comImagem: Boolean(imagem), comPesquisa: Boolean(atualidade), terreno };
  } finally {
    pedidoEmCurso = false;
  }
}
