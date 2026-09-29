/**
 * As IAs de reserva: outras IAs que fazem o plano quando a Gemini chega ao
 * limite (ou quando o dono prefere outra) — Groq, OpenRouter, GitHub Models,
 * Hugging Face, Requesty, Mistral, Cerebras e a OpenAI (a do ChatGPT).
 *
 * PORQUÊ ESTAS
 *
 * Todas têm uso gratuito e falam a mesma língua (a API "compatível com
 * OpenAI": lista de modelos e /chat/completions), por isso um só cliente serve
 * todas. Cada uma tem a sua chave, guardada à parte: o dono pode ter várias e
 * escolher qual faz o plano. Onde a chave tem forma própria (gsk_, sk-or-,
 * github_pat_, hf_, csk-) reconhece-se sozinha; nas outras (Mistral, Requesty)
 * o dono diz de quem é. Na OpenRouter e na Requesty só se usam os modelos
 * gratuitos, para nunca gastar créditos.
 *
 * A OPENAI É PAGA
 *
 * É a única que não tem uso gratuito: cada plano gasta do saldo da API do dono
 * (platform.openai.com). A assinatura do ChatGPT (Plus) não serve para isto: a
 * API é à parte. Por isso fica em último na ordem das reservas — só faz o plano
 * quando o dono a escolhe como principal, ou quando as gratuitas falharam.
 *
 * A CHAVE
 *
 * Como a da Gemini: do ambiente (`IA_RESERVA_API_KEY`, reconhecida pela forma)
 * ou colada no site pelo dono e guardada na base de dados. Nunca volta ao
 * navegador; vai no cabeçalho Authorization, nunca no endereço.
 *
 * O QUE NÃO FAZ
 *
 * Não pesquisa na web (isso é da Gemini). O pedido leva a grelha do mapa em
 * texto e, quando o modelo vê imagens, também a imagem.
 */
import { getSetting, setSetting } from "./appSettings";

/** A chave antiga (quando só havia uma reserva, Groq ou OpenRouter). Continua a ser lida. */
export const CHAVE_DE_RESERVA_SETTING = "iaReservaApiKey";
const settingDe = (id: IdDaReserva) => `iaReserva.${id}`;

type Buscar = typeof fetch;
export const IDS_DAS_RESERVAS = ["groq", "openrouter", "github", "huggingface", "requesty", "mistral", "cerebras", "openai"] as const;
export type IdDaReserva = (typeof IDS_DAS_RESERVAS)[number];
export type Fornecedor = {
  id: IdDaReserva;
  nome: string;
  base: string;
  caminhoDosModelos: string;
  caminhoDaConversa: string;
  /**
   * Só modelos gratuitos: "sufixo" = só os ":free" (OpenRouter); "preco" = só
   * os de preço zero, quando a lista diz o preço (Requesty); null = todos.
   */
  soGratuitos: "sufixo" | "preco" | null;
  /**
   * Só os modelos com este nome. A lista da OpenAI não diz o que cada modelo
   * faz, e metade não conversa (voz, imagens, Realtime, os "-pro" só da API
   * Responses).
   */
  soModelos?: RegExp;
  /** Sem uso gratuito: cada pedido gasta do saldo do dono. */
  pago?: boolean;
  ondeCriar: string;
  /** A forma da chave, quando a tem. Sem forma, o dono diz de quem é. */
  forma: RegExp | null;
  exemplo: string;
  /** Tamanho máximo da resposta que o plano gratuito aceita. */
  maxTokens: number;
};

const FORNECEDORES: readonly Omit<Fornecedor, "base">[] = [
  { id: "groq", nome: "Groq", caminhoDosModelos: "/models", caminhoDaConversa: "/chat/completions", soGratuitos: null, ondeCriar: "console.groq.com/keys", forma: /^gsk_[\w-]{20,}$/, exemplo: "gsk_…", maxTokens: 8000 },
  { id: "openrouter", nome: "OpenRouter", caminhoDosModelos: "/models", caminhoDaConversa: "/chat/completions", soGratuitos: "sufixo", ondeCriar: "openrouter.ai/keys", forma: /^sk-or-[\w-]{20,}$/, exemplo: "sk-or-…", maxTokens: 8000 },
  // O GitHub Models dá modelos da OpenAI (GPT-4.1…) de graça, com um token do GitHub
  // com a permissão "Models". O plano gratuito aceita até 4000 tokens de resposta.
  { id: "github", nome: "GitHub Models", caminhoDosModelos: "/catalog/models", caminhoDaConversa: "/inference/chat/completions", soGratuitos: null, ondeCriar: "github.com/settings/personal-access-tokens/new", forma: /^(github_pat_|ghp_)\w{20,}$/, exemplo: "github_pat_…", maxTokens: 4000 },
  { id: "huggingface", nome: "Hugging Face", caminhoDosModelos: "/models", caminhoDaConversa: "/chat/completions", soGratuitos: null, ondeCriar: "huggingface.co/settings/tokens", forma: /^hf_\w{20,}$/, exemplo: "hf_…", maxTokens: 8000 },
  { id: "requesty", nome: "Requesty", caminhoDosModelos: "/models", caminhoDaConversa: "/chat/completions", soGratuitos: "preco", ondeCriar: "app.requesty.ai/api-keys", forma: null, exemplo: "a chave da Requesty", maxTokens: 8000 },
  { id: "mistral", nome: "Mistral", caminhoDosModelos: "/models", caminhoDaConversa: "/chat/completions", soGratuitos: null, ondeCriar: "console.mistral.ai/api-keys", forma: null, exemplo: "a chave da Mistral", maxTokens: 8000 },
  { id: "cerebras", nome: "Cerebras", caminhoDosModelos: "/models", caminhoDaConversa: "/chat/completions", soGratuitos: null, ondeCriar: "cloud.cerebras.ai", forma: /^csk-[\w-]{20,}$/, exemplo: "csk-…", maxTokens: 8000 },
  // As chaves de hoje começam por sk-proj- (as antigas, só sk-, escolhem-se na lista).
  // Os modelos de raciocínio (GPT-5, o3, o4-mini) pensam antes de responder: o
  // limite tem folga para o raciocínio e para o plano.
  {
    id: "openai", nome: "OpenAI (ChatGPT)", caminhoDosModelos: "/models", caminhoDaConversa: "/chat/completions", soGratuitos: null,
    soModelos: /^(gpt-(4o|4\.1|[5-9](\.\d+)?)(-mini|-nano)?|o[3-9](-mini)?)$/, pago: true,
    ondeCriar: "platform.openai.com/api-keys", forma: /^sk-(proj|svcacct|admin)-[\w-]{20,}$/, exemplo: "sk-proj-…", maxTokens: 16000,
  },
];
const BASES: Record<IdDaReserva, string> = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  github: "https://models.github.ai",
  huggingface: "https://router.huggingface.co/v1",
  requesty: "https://router.requesty.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  openai: "https://api.openai.com/v1",
};

/** O fornecedor pelo nome curto. `IA_RESERVA_BASE` só existe para testes locais com uma IA falsa. */
export function fornecedorPorId(id: IdDaReserva): Fornecedor {
  const f = FORNECEDORES.find((item) => item.id === id)!;
  return { ...f, base: (process.env.IA_RESERVA_BASE ?? BASES[id]).replace(/\/$/, "") };
}

/** Qual é o fornecedor, pela forma da chave. `null` quando a chave não tem forma conhecida. */
export function fornecedorDaChave(chave: string): Fornecedor | null {
  const f = FORNECEDORES.find((item) => item.forma?.test(chave));
  return f ? fornecedorPorId(f.id) : null;
}

/** Os fornecedores, para o ecrã: nome, onde criar a chave e como ela começa. */
export function listaDeFornecedores() {
  return FORNECEDORES.map(({ id, nome, ondeCriar, exemplo, forma, pago }) => ({ id, nome, ondeCriar, exemplo, reconheceSozinha: Boolean(forma), pago: pago === true }));
}

export type ChaveDeReserva = { fornecedor: Fornecedor; key: string; origin: "ambiente" | "site" };

/** Todas as chaves de reserva que existem, pela ordem dos fornecedores. */
export async function lerChavesDeReserva(): Promise<ChaveDeReserva[]> {
  const chaves = new Map<IdDaReserva, ChaveDeReserva>();
  const doAmbiente = (process.env.IA_RESERVA_API_KEY ?? "").trim();
  const doAmbienteDe = doAmbiente ? fornecedorDaChave(doAmbiente) : null;
  if (doAmbienteDe) chaves.set(doAmbienteDe.id, { fornecedor: doAmbienteDe, key: doAmbiente, origin: "ambiente" });
  for (const { id } of FORNECEDORES) {
    if (chaves.has(id)) continue;
    const daBase = (await getSetting(settingDe(id)))?.trim();
    if (daBase) chaves.set(id, { fornecedor: fornecedorPorId(id), key: daBase, origin: "site" });
  }
  // A chave antiga (Groq ou OpenRouter), de antes de haver uma por fornecedor.
  const antiga = (await getSetting(CHAVE_DE_RESERVA_SETTING))?.trim();
  const antigaDe = antiga ? fornecedorDaChave(antiga) : null;
  if (antiga && antigaDe && !chaves.has(antigaDe.id)) chaves.set(antigaDe.id, { fornecedor: antigaDe, key: antiga, origin: "site" });
  return FORNECEDORES.map(({ id }) => chaves.get(id)).filter((c): c is ChaveDeReserva => Boolean(c));
}

/** A primeira chave de reserva que existe (ou nenhuma). */
export async function lerChaveDeReserva() {
  const [primeira] = await lerChavesDeReserva();
  return primeira ? { key: primeira.key, origin: primeira.origin } : { key: "", origin: "nenhuma" as const };
}

export async function guardarChaveDeReserva(id: IdDaReserva, chave: string | null) {
  modelosDaChave.clear();
  await setSetting(settingDe(id), chave?.trim() || null);
  // A chave antiga deste fornecedor deixa de valer: a nova (ou nenhuma) manda.
  const antiga = (await getSetting(CHAVE_DE_RESERVA_SETTING))?.trim();
  if (antiga && fornecedorDaChave(antiga)?.id === id) await setSetting(CHAVE_DE_RESERVA_SETTING, null);
}

/** Um erro com uma frase que o dono percebe. */
export class ErroDaReserva extends Error {}

/**
 * Os modelos a tentar, pela ordem: os mais fortes que costumam existir de
 * graça. Nada de voz, moderação, imagens geradas ou embeddings.
 */
const PREFERENCIA = [
  /(^|\/)gpt-4\.1$/, /(^|\/)gpt-4o$/,
  /deepseek-(chat-)?v3|deepseek-chat/i, /qwen-?3-235b/i, /mistral-(medium|large)/,
  /llama-4-maverick/i, /llama-4-scout/i, /gpt-oss-120b/, /kimi-k2/i, /llama-3\.3-70b/i, /qwen-?3/i, /gemma-3-27b/, /deepseek/i, /mistral-small/, /llama/i,
];
const SO_TEXTO_NAO = /whisper|tts|guard|embed|moderation|audio|playai|compound|orpheus|ocr|rerank|dall-e|flux|stable-diffusion|image-gen|transcri/i;
const veImagensPeloNome = (modelo: string) => /llama-4|gemma-3|vision|-vl|maverick|scout|pixtral|gpt-4\.1|gpt-4o|gpt-5|(^|\/)(o3$|o[4-9])|mistral-(medium|small)/i.test(modelo);
/**
 * Os modelos de raciocínio da OpenAI (GPT-5, o3, o4-mini): não aceitam outra
 * temperatura nem `max_tokens` (querem `max_completion_tokens`), e pensam
 * pouco quando se lhes pede ("low") — o plano tem de chegar antes da partida.
 */
export const pensaAntes = (modelo: string) => /(^|\/)(gpt-[5-9]|o[3-9])/.test(modelo);

/** Um modelo da lista do fornecedor: o nome e, quando a lista o diz, o que vê, o que escreve e o preço. */
export type ModeloDaLista = { id: string; veImagens: boolean | null; escreveTexto: boolean | null; gratuito: boolean | null };

export function lerModeloDaLista(bruto: unknown): ModeloDaLista | null {
  if (!bruto || typeof bruto !== "object") return null;
  const m = bruto as Record<string, any>;
  if (typeof m.id !== "string") return null;
  const entradas: unknown = m.supported_input_modalities ?? m.architecture?.input_modalities ?? m.input_modalities;
  const saidas: unknown = m.supported_output_modalities ?? m.architecture?.output_modalities ?? m.output_modalities;
  const veImagens = typeof m.capabilities?.vision === "boolean" ? m.capabilities.vision
    : Array.isArray(entradas) ? entradas.includes("image") : null;
  const escreveTexto = m.capabilities?.completion_chat === false ? false : Array.isArray(saidas) ? saidas.includes("text") : null;
  const precos = [m.pricing?.prompt, m.pricing?.completion, m.input_price, m.output_price]
    .filter((p) => p !== undefined && p !== null && p !== "")
    .map(Number);
  const gratuito = precos.length && precos.every((p) => Number.isFinite(p)) ? precos.every((p) => p === 0) : null;
  return { id: m.id, veImagens, escreveTexto, gratuito };
}

function ordenarModelos(lista: readonly (string | ModeloDaLista)[], soGratuitos: Fornecedor["soGratuitos"], soModelos?: RegExp) {
  const modelos = lista.map((m) => (typeof m === "string" ? { id: m, veImagens: null, escreveTexto: null, gratuito: null } : m));
  const dizemOPreco = modelos.some((m) => m.gratuito !== null);
  const uteis = modelos
    .filter((m) => m.escreveTexto !== false && !SO_TEXTO_NAO.test(m.id))
    .filter((m) => !soModelos || soModelos.test(m.id))
    .filter((m) => soGratuitos !== "sufixo" || m.id.endsWith(":free"))
    .filter((m) => soGratuitos !== "preco" || !dizemOPreco || m.gratuito === true);
  const posicao = (id: string) => {
    const i = PREFERENCIA.findIndex((padrao) => padrao.test(id));
    return i === -1 ? PREFERENCIA.length : i;
  };
  return [...uteis].sort((a, b) => posicao(a.id) - posicao(b.id) || a.id.localeCompare(b.id));
}

/** Os nomes dos modelos úteis, pela ordem em que se tentam. */
export function ordenarModelosDeReserva(lista: readonly (string | ModeloDaLista)[], soGratuitos: Fornecedor["soGratuitos"] | boolean, soModelos?: RegExp) {
  return ordenarModelos(lista, soGratuitos === true ? "sufixo" : soGratuitos === false ? null : soGratuitos, soModelos).map((m) => m.id);
}

/** Por chave: os modelos pela ordem e os que veem imagens. */
const modelosDaChave = new Map<string, { ordem: string[]; comImagem: Set<string> }>();
const MODELOS_POR_PEDIDO = 3;

async function pedir(fornecedor: Fornecedor, chave: string, caminho: string, buscar: Buscar, corpo?: unknown, limiteMs = 20_000) {
  const resposta = await buscar(`${fornecedor.base}${caminho}`, {
    method: corpo ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${chave}`,
      ...(corpo ? { "content-type": "application/json" } : {}),
      ...(fornecedor.id === "github" ? { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    signal: AbortSignal.timeout(limiteMs),
  });
  const texto = await resposta.text();
  return { status: resposta.status, ok: resposta.ok, texto };
}

/** A mensagem do fornecedor, curta. O corpo nunca traz a chave. */
function mensagemDoFornecedor(corpo: string) {
  try {
    const dados = JSON.parse(corpo) as { error?: { message?: string } | string; message?: string };
    const texto = typeof dados.error === "string" ? dados.error : dados.error?.message ?? dados.message;
    if (texto) return texto.replace(/\s+/g, " ").slice(0, 200);
  } catch {
    // Não era JSON.
  }
  return corpo.replace(/\s+/g, " ").slice(0, 120);
}

function erroDaChave(fornecedor: Fornecedor, status: number, corpo: string) {
  return new ErroDaReserva(`A ${fornecedor.nome} recusou a chave (${status}: ${mensagemDoFornecedor(corpo)}). Cria outra em ${fornecedor.ondeCriar}.`);
}

async function modelosPara(fornecedor: Fornecedor, chave: string, buscar: Buscar) {
  const guardados = modelosDaChave.get(chave);
  if (guardados) return guardados;
  const { status, ok, texto } = await pedir(fornecedor, chave, fornecedor.caminhoDosModelos, buscar);
  if (status === 401 || status === 403) throw erroDaChave(fornecedor, status, texto);
  if (!ok) throw new ErroDaReserva(`A ${fornecedor.nome} não deu a lista de modelos (${status}: ${mensagemDoFornecedor(texto)}).`);
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new ErroDaReserva(`A ${fornecedor.nome} deu uma lista de modelos que não se lê.`);
  }
  // O catálogo do GitHub é uma lista; os outros vêm em { data: [...] }.
  const brutos = Array.isArray(dados) ? dados : ((dados as { data?: unknown[] })?.data ?? []);
  const lidos = brutos.map(lerModeloDaLista).filter((m): m is ModeloDaLista => Boolean(m));
  const ordenados = ordenarModelos(lidos, fornecedor.soGratuitos, fornecedor.soModelos);
  if (!ordenados.length) throw new ErroDaReserva(`A chave da ${fornecedor.nome} funciona, mas não tem nenhum modelo${fornecedor.pago ? "" : " gratuito"} que escreva texto.`);
  const resultado = {
    ordem: ordenados.map((m) => m.id),
    comImagem: new Set(ordenados.filter((m) => m.veImagens ?? veImagensPeloNome(m.id)).map((m) => m.id)),
  };
  modelosDaChave.set(chave, resultado);
  return resultado;
}

/** Diz se o modelo vê imagens (pela lista do fornecedor, se já foi lida; senão pelo nome). */
export function veImagens(modelo: string, chave?: string) {
  const daLista = chave ? modelosDaChave.get(chave) : undefined;
  return daLista ? daLista.comImagem.has(modelo) : veImagensPeloNome(modelo);
}

/** Os modelos de cada chave de reserva, pela ordem em que se tentam (para o dono escolher). */
export async function modelosDasReservas(buscar: Buscar = fetch) {
  const chaves = await lerChavesDeReserva();
  const resultado: Partial<Record<IdDaReserva, { fornecedor: string; modelos: string[]; erro: string | null }>> = {};
  await Promise.all(chaves.map(async ({ fornecedor, key }) => {
    try {
      resultado[fornecedor.id] = { fornecedor: fornecedor.nome, modelos: (await modelosPara(fornecedor, key, buscar)).ordem, erro: null };
    } catch (erro) {
      resultado[fornecedor.id] = { fornecedor: fornecedor.nome, modelos: [], erro: erro instanceof Error ? erro.message : String(erro) };
    }
  }));
  return resultado;
}

/** Testa uma chave pedindo a lista de modelos. Não gasta pedidos de geração. */
export async function testarChaveDeReserva(id: IdDaReserva, buscar: Buscar = fetch) {
  const chave = (await lerChavesDeReserva()).find((c) => c.fornecedor.id === id);
  if (!chave) return { ok: false, reason: "Sem chave." };
  try {
    const { ordem } = await modelosPara(chave.fornecedor, chave.key, buscar);
    return { ok: true, reason: `${chave.fornecedor.nome} aceite. Modelo: ${ordem[0]}.` };
  } catch (erro) {
    return { ok: false, reason: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** O JSON dentro da resposta: sem cercas de código nem raciocínio, do primeiro "{" ao último "}". */
export function lerJsonDaResposta(texto: string): unknown {
  const limpo = texto.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();
  try {
    return JSON.parse(limpo);
  } catch {
    const inicio = limpo.indexOf("{"), fim = limpo.lastIndexOf("}");
    if (inicio === -1 || fim <= inicio) throw new Error("resposta que não é JSON");
    return JSON.parse(limpo.slice(inicio, fim + 1));
  }
}

/**
 * Um pedido com resposta em JSON, a tentar até três modelos. Limite (429),
 * modelo em baixo (5xx) ou inexistente (404) passam ao seguinte; um formato
 * que o modelo não aceita (400) repete-se sem o modo JSON e sem imagem. Chave
 * recusada pára logo.
 */
export async function gerarJsonNaReserva(reserva: { fornecedor: Fornecedor; key: string }, texto: string, imagem: { mime_type: string; data: string } | null, buscar: Buscar = fetch, temperatura = 0.4, escolhido?: string | null, limiteMs = 90_000) {
  const { fornecedor, key: chave } = reserva;
  const { ordem: todos } = await modelosPara(fornecedor, chave, buscar);
  // O modelo escolhido pelo dono vai à frente — só se estiver na lista da chave.
  const modelos = (escolhido && todos.includes(escolhido) ? [escolhido, ...todos.filter((m) => m !== escolhido)] : todos).slice(0, MODELOS_POR_PEDIDO);
  const falhas: string[] = [];
  for (const modelo of modelos) {
    for (const simples of [false, true]) {
      const comImagem = Boolean(imagem) && veImagens(modelo, chave) && !simples;
      const conteudo = comImagem
        ? [{ type: "text", text: texto }, { type: "image_url", image_url: { url: `data:${imagem!.mime_type};base64,${imagem!.data}` } }]
        : texto;
      const raciocinio = fornecedor.id === "openai" && pensaAntes(modelo);
      const corpo = {
        model: modelo,
        messages: [{ role: "user", content: conteudo }],
        ...(raciocinio ? {} : { temperature: temperatura }),
        // Na OpenAI, `max_completion_tokens` serve a todos os modelos (os de raciocínio recusam `max_tokens`).
        ...(fornecedor.id === "openai" ? { max_completion_tokens: fornecedor.maxTokens } : { max_tokens: fornecedor.maxTokens }),
        ...(raciocinio && !simples ? { reasoning_effort: "low" } : {}),
        ...(simples ? {} : { response_format: { type: "json_object" } }),
      };
      try {
        const { status, ok, texto: resposta } = await pedir(fornecedor, chave, fornecedor.caminhoDaConversa, buscar, corpo, limiteMs);
        if (status === 401 || status === 403) throw erroDaChave(fornecedor, status, resposta);
        // Sem saldo, nenhum modelo da mesma chave vai conseguir: não vale a pena tentar os outros.
        if (fornecedor.id === "openai" && status === 429 && /insufficient_quota/.test(resposta)) {
          throw new ErroDaReserva(`A conta da ${fornecedor.nome} não tem saldo para a API (a assinatura do ChatGPT não conta). Carrega-a em platform.openai.com/settings/organization/billing.`);
        }
        if (!ok) {
          console.warn(`[General] reserva ${fornecedor.nome} ${modelo}${simples ? " (simples)" : ""} respondeu ${status}: ${mensagemDoFornecedor(resposta)}`);
          falhas.push(`${modelo}: ${status} ${mensagemDoFornecedor(resposta).slice(0, 90)}`);
          if ((status === 400 || status === 413 || status === 422) && !simples) continue;
          break;
        }
        const conteudoDaResposta = (JSON.parse(resposta) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
        return { json: lerJsonDaResposta(conteudoDaResposta), modelo: `${fornecedor.nome} · ${modelo}`, comImagem };
      } catch (erro) {
        if (erro instanceof ErroDaReserva) throw erro;
        falhas.push(`${modelo}: ${erro instanceof Error ? erro.message : String(erro)}`);
        if (!simples) continue;
        break;
      }
    }
  }
  throw new ErroDaReserva(`A ${fornecedor.nome} também não conseguiu (${falhas.join(" · ")}).`);
}
