/**
 * A IA de reserva: quando a Gemini chega ao limite gratuito (ou está em baixo),
 * o plano é feito por outra IA gratuita — Groq ou OpenRouter.
 *
 * PORQUÊ ESTAS DUAS
 *
 * Ambas têm chave gratuita e falam a mesma língua (a API "compatível com
 * OpenAI": /models e /chat/completions), por isso um só cliente serve as duas.
 * Qual é, sabe-se pela própria chave: as da Groq começam por "gsk_", as da
 * OpenRouter por "sk-or-". Na OpenRouter só se usam os modelos gratuitos
 * (":free"), para nunca gastar créditos.
 *
 * A CHAVE
 *
 * Como a da Gemini: do ambiente (`IA_RESERVA_API_KEY`) ou colada no site pelo
 * dono e guardada na base de dados. Nunca volta ao navegador; vai no cabeçalho
 * Authorization, nunca no endereço.
 *
 * O QUE NÃO FAZ
 *
 * Não pesquisa na web (isso é da Gemini). O pedido leva a grelha do mapa em
 * texto e, quando o modelo vê imagens, também a imagem.
 */
import { getSetting, setSetting } from "./appSettings";

export const CHAVE_DE_RESERVA_SETTING = "iaReservaApiKey";

type Buscar = typeof fetch;
export type Fornecedor = { nome: "Groq" | "OpenRouter"; base: string; soGratuitos: boolean; ondeCriar: string };

/** Qual é o fornecedor, pela forma da chave. `null` quando não se reconhece. */
export function fornecedorDaChave(chave: string): Fornecedor | null {
  // Configurável só para testes locais com uma IA falsa.
  const base = (padrao: string) => (process.env.IA_RESERVA_BASE ?? padrao).replace(/\/$/, "");
  if (/^gsk_[\w-]{20,}$/.test(chave)) return { nome: "Groq", base: base("https://api.groq.com/openai/v1"), soGratuitos: false, ondeCriar: "console.groq.com/keys" };
  if (/^sk-or-[\w-]{20,}$/.test(chave)) return { nome: "OpenRouter", base: base("https://openrouter.ai/api/v1"), soGratuitos: true, ondeCriar: "openrouter.ai/keys" };
  return null;
}

export async function lerChaveDeReserva() {
  const doAmbiente = (process.env.IA_RESERVA_API_KEY ?? "").trim();
  if (doAmbiente) return { key: doAmbiente, origin: "ambiente" as const };
  const daBase = (await getSetting(CHAVE_DE_RESERVA_SETTING))?.trim();
  if (daBase) return { key: daBase, origin: "site" as const };
  return { key: "", origin: "nenhuma" as const };
}

export async function guardarChaveDeReserva(chave: string | null) {
  modelosDaChave.clear();
  await setSetting(CHAVE_DE_RESERVA_SETTING, chave?.trim() || null);
}

/** Um erro com uma frase que o dono percebe. */
export class ErroDaReserva extends Error {}

/**
 * Os modelos a tentar, pela ordem: os mais fortes que costumam existir de
 * graça, os que veem imagens primeiro. Nada de voz, moderação ou embeddings.
 */
const PREFERENCIA = [/llama-4-maverick/, /llama-4-scout/, /gpt-oss-120b/, /kimi-k2/, /llama-3\.3-70b/, /qwen-?3/, /gemma-3-27b/, /deepseek/, /mistral-small/, /llama/];
export const veImagens = (modelo: string) => /llama-4|gemma-3|vision|-vl|maverick|scout/i.test(modelo);

export function ordenarModelosDeReserva(ids: readonly string[], soGratuitos: boolean) {
  const uteis = ids
    .filter((id) => !/whisper|tts|guard|embed|moderation|audio|playai|compound|orpheus|prompt-guard/i.test(id))
    .filter((id) => !soGratuitos || id.endsWith(":free"));
  const posicao = (id: string) => {
    const i = PREFERENCIA.findIndex((padrao) => padrao.test(id));
    return i === -1 ? PREFERENCIA.length : i;
  };
  return [...uteis].sort((a, b) => posicao(a) - posicao(b) || a.localeCompare(b));
}

const modelosDaChave = new Map<string, string[]>();
const MODELOS_POR_PEDIDO = 3;

async function pedir(fornecedor: Fornecedor, chave: string, caminho: string, buscar: Buscar, corpo?: unknown, limiteMs = 20_000) {
  const resposta = await buscar(`${fornecedor.base}${caminho}`, {
    method: corpo ? "POST" : "GET",
    headers: { authorization: `Bearer ${chave}`, ...(corpo ? { "content-type": "application/json" } : {}) },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    signal: AbortSignal.timeout(limiteMs),
  });
  const texto = await resposta.text();
  return { status: resposta.status, ok: resposta.ok, texto };
}

/** A mensagem do fornecedor, curta. O corpo nunca traz a chave. */
function mensagemDoFornecedor(corpo: string) {
  try {
    const erro = (JSON.parse(corpo) as { error?: { message?: string } | string }).error;
    const texto = typeof erro === "string" ? erro : erro?.message;
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
  const { status, ok, texto } = await pedir(fornecedor, chave, "/models", buscar);
  if (status === 401 || status === 403) throw erroDaChave(fornecedor, status, texto);
  if (!ok) throw new ErroDaReserva(`A ${fornecedor.nome} não deu a lista de modelos (${status}: ${mensagemDoFornecedor(texto)}).`);
  const ids = ((JSON.parse(texto) as { data?: Array<{ id?: unknown }> }).data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
  const ordem = ordenarModelosDeReserva(ids, fornecedor.soGratuitos);
  if (!ordem.length) throw new ErroDaReserva(`A chave da ${fornecedor.nome} funciona, mas não tem nenhum modelo gratuito que escreva texto.`);
  modelosDaChave.set(chave, ordem);
  return ordem;
}

/** Testa a chave pedindo a lista de modelos. Não gasta pedidos de geração. */
export async function testarChaveDeReserva(buscar: Buscar = fetch) {
  const { key } = await lerChaveDeReserva();
  if (!key) return { ok: false, reason: "Sem chave." };
  const fornecedor = fornecedorDaChave(key);
  if (!fornecedor) return { ok: false, reason: "Não reconheço esta chave: as da Groq começam por gsk_ e as da OpenRouter por sk-or-." };
  try {
    const modelos = await modelosPara(fornecedor, key, buscar);
    return { ok: true, reason: `${fornecedor.nome} aceite. Modelo: ${modelos[0]}.` };
  } catch (erro) {
    return { ok: false, reason: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** O JSON dentro da resposta: sem cercas de código, do primeiro "{" ao último "}". */
export function lerJsonDaResposta(texto: string): unknown {
  const limpo = texto.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
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
export async function gerarJsonNaReserva(chave: string, texto: string, imagem: { mime_type: string; data: string } | null, buscar: Buscar = fetch, temperatura = 0.4) {
  const fornecedor = fornecedorDaChave(chave);
  if (!fornecedor) throw new ErroDaReserva("A chave da IA de reserva não é da Groq nem da OpenRouter.");
  const modelos = (await modelosPara(fornecedor, chave, buscar)).slice(0, MODELOS_POR_PEDIDO);
  const falhas: string[] = [];
  for (const modelo of modelos) {
    for (const simples of [false, true]) {
      const comImagem = Boolean(imagem) && veImagens(modelo) && !simples;
      const conteudo = comImagem
        ? [{ type: "text", text: texto }, { type: "image_url", image_url: { url: `data:${imagem!.mime_type};base64,${imagem!.data}` } }]
        : texto;
      const corpo = {
        model: modelo,
        messages: [{ role: "user", content: conteudo }],
        temperature: temperatura,
        max_tokens: 8000,
        ...(simples ? {} : { response_format: { type: "json_object" } }),
      };
      try {
        const { status, ok, texto: resposta } = await pedir(fornecedor, chave, "/chat/completions", buscar, corpo, 90_000);
        if (status === 401 || status === 403) throw erroDaChave(fornecedor, status, resposta);
        if (!ok) {
          console.warn(`[General] reserva ${fornecedor.nome} ${modelo}${simples ? " (simples)" : ""} respondeu ${status}: ${mensagemDoFornecedor(resposta)}`);
          falhas.push(`${modelo}: ${status} ${mensagemDoFornecedor(resposta).slice(0, 90)}`);
          if (status === 400 && !simples) continue;
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
