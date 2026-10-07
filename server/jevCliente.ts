/**
 * O cliente do Jev, o modelo de decisão da TypeSafe ("System One"). Só no
 * servidor: a chave nunca vai para o navegador, nem para o bundle, nem para os
 * registos.
 *
 * O CONTRATO
 *
 * Tirado do SDK oficial (`@typesafe-ai/sdk` 0.6.0, licença MIT, a documentação
 * em docs.typesafe.ai remete para ele):
 *
 *   POST {TYPESAFE_BASE_URL, por omissão https://api.typesafe.ai}/v1/systemone
 *   Authorization: Bearer <TYPESAFE_API_KEY>
 *   { "model": "jev-latest", "state": <texto ou JSON>, "questions": {
 *       "<nome>": { "type": "choice", "instructions": "…", "criteria": { "<rótulo>": "<descrição>" } } } }
 *   → { "model": "…", "answers": { "<nome>": { "type": "choice", "choice": "<rótulo>",
 *        "confidence": 0.8, "probabilities": { "<rótulo>": 0.8, … } } }, "usage": { … } }
 *
 * Não se usa o SDK em si: um pedido só, sem as novas tentativas dele (2 por
 * omissão, com esperas) — aqui cada segundo conta, e quando o Jev falha o site
 * passa logo à IA padrão. Assim também se testa com um `fetch` falso, como o
 * resto do General.
 *
 * O QUE SE CONFERE NA RESPOSTA
 *
 * Tudo, com zod: cada pergunta tem de ter resposta, a escolha tem de ser um
 * dos rótulos que se mandaram, e a confiança e as probabilidades têm de ser
 * números entre 0 e 1. Uma resposta que não é JSON, que vem cortada ou que é
 * enorme é recusada — nunca se "aproveita" metade.
 */
import { z } from "zod";

export type PerguntaDeEscolha = { type: "choice"; instructions: string; criteria: Record<string, string | null> };
export type PerguntasAoJev = Record<string, PerguntaDeEscolha>;
export type RespostaDeEscolha = { choice: string; confidence: number; probabilities: Record<string, number> };
export type EstadoParaOJev = string | Record<string, unknown> | unknown[];

export type TipoDeFalhaDoJev = "sem-chave" | "timeout" | "sem-creditos" | "chave-recusada" | "limite" | "indisponivel" | "resposta-invalida" | "rede";

/** Uma falha com uma frase que o dono percebe. A mensagem nunca leva a chave. */
export class ErroDoJev extends Error {
  constructor(readonly tipo: TipoDeFalhaDoJev, mensagem: string, readonly status?: number) {
    super(mensagem);
  }
}

const BASE_POR_OMISSAO = "https://api.typesafe.ai";
const MODELO_POR_OMISSAO = "jev-latest";
/** Uma resposta a sério tem poucos KB; mais do que isto não é uma resposta do Jev. */
const MAXIMO_DA_RESPOSTA = 200_000;

/** A configuração, lida do ambiente como o SDK oficial a lê. Valores vazios não contam. */
export function configDoJev(env: NodeJS.ProcessEnv = process.env) {
  const ler = (nome: string) => (env[nome] ?? "").trim() || null;
  return {
    chave: ler("TYPESAFE_API_KEY"),
    base: (ler("TYPESAFE_BASE_URL") ?? BASE_POR_OMISSAO).replace(/\/+$/, ""),
    modelo: ler("TYPESAFE_DEFAULT_MODEL") ?? MODELO_POR_OMISSAO,
  };
}

export const jevConfigurado = (env: NodeJS.ProcessEnv = process.env) => Boolean(configDoJev(env).chave);

const esquemaDaResposta = z.object({
  model: z.string().max(80).optional(),
  answers: z.record(z.string(), z.unknown()),
});
const esquemaDaEscolha = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number().finite().min(0).max(1),
  probabilities: z.record(z.string(), z.number().finite().min(0).max(1)),
});

/** O que o Jev devolveu, conferido contra as perguntas que se lhe fizeram. */
export function lerRespostaDoJev(corpo: unknown, perguntas: PerguntasAoJev): { modelo: string; respostas: Record<string, RespostaDeEscolha> } {
  const lida = esquemaDaResposta.safeParse(corpo);
  if (!lida.success) throw new ErroDoJev("resposta-invalida", "O Jev respondeu sem as respostas no formato esperado.");
  const respostas: Record<string, RespostaDeEscolha> = {};
  for (const [nome, pergunta] of Object.entries(perguntas)) {
    const resposta = esquemaDaEscolha.safeParse(lida.data.answers[nome]);
    if (!resposta.success) throw new ErroDoJev("resposta-invalida", `O Jev não respondeu bem à pergunta «${nome}».`);
    const rotulos = Object.keys(pergunta.criteria);
    if (!rotulos.includes(resposta.data.choice)) throw new ErroDoJev("resposta-invalida", `O Jev escolheu uma opção que não existe na pergunta «${nome}».`);
    // Só as probabilidades dos rótulos que se mandaram.
    const probabilidades = Object.fromEntries(rotulos.map((r) => [r, resposta.data.probabilities[r]]).filter(([, p]) => typeof p === "number"));
    respostas[nome] = { choice: resposta.data.choice, confidence: resposta.data.confidence, probabilities: probabilidades };
  }
  return { modelo: lida.data.model ?? MODELO_POR_OMISSAO, respostas };
}

function falhaDoEstado(status: number, corpo: string): ErroDoJev {
  if (status === 401 || status === 403) return new ErroDoJev("chave-recusada", `A TypeSafe recusou a chave (${status}). Cria outra em console.typesafe.ai.`, status);
  // Sem créditos: 402, ou um 429 que diz que é do saldo e não da pressa.
  if (status === 402 || (status === 429 && /credit|quota|balance|insufficient|billing|saldo/i.test(corpo))) {
    return new ErroDoJev("sem-creditos", "A conta da TypeSafe não tem créditos para o Jev.", status);
  }
  if (status === 429) return new ErroDoJev("limite", "O Jev está no limite de pedidos. Tenta daqui a pouco.", status);
  return new ErroDoJev("indisponivel", `O Jev não respondeu bem (${status}).`, status);
}

/**
 * Faz as perguntas ao Jev. Um pedido, com prazo: se não chegar a tempo, é um
 * `ErroDoJev` "timeout" — quem chama passa à IA padrão.
 */
export async function perguntarAoJev(
  pedido: { state: EstadoParaOJev; questions: PerguntasAoJev },
  opcoes: { limiteMs: number; buscar?: typeof fetch; env?: NodeJS.ProcessEnv },
): Promise<{ modelo: string; respostas: Record<string, RespostaDeEscolha> }> {
  const { chave, base, modelo } = configDoJev(opcoes.env);
  if (!chave) throw new ErroDoJev("sem-chave", "Falta a variável TYPESAFE_API_KEY no servidor.");
  if (!/^https:\/\//.test(base)) throw new ErroDoJev("indisponivel", "TYPESAFE_BASE_URL tem de ser um endereço https.");
  if (!Object.keys(pedido.questions).length) throw new ErroDoJev("resposta-invalida", "Não há perguntas para o Jev.");
  const buscar = opcoes.buscar ?? fetch;
  const controlo = new AbortController();
  const relogio = setTimeout(() => controlo.abort(), opcoes.limiteMs);
  try {
    let resposta: Response;
    try {
      resposta = await buscar(`${base}/v1/systemone`, {
        method: "POST",
        headers: { authorization: `Bearer ${chave}`, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ model: modelo, state: pedido.state, questions: pedido.questions }),
        signal: controlo.signal,
      });
    } catch (erro) {
      if (controlo.signal.aborted) throw new ErroDoJev("timeout", `O Jev não respondeu em ${Math.round(opcoes.limiteMs / 100) / 10} s.`);
      throw new ErroDoJev("rede", `Não foi possível falar com o Jev (${erro instanceof Error ? erro.name : "rede"}).`);
    }
    let texto: string;
    try {
      texto = await resposta.text();
    } catch {
      if (controlo.signal.aborted) throw new ErroDoJev("timeout", `O Jev não acabou de responder em ${Math.round(opcoes.limiteMs / 100) / 10} s.`);
      throw new ErroDoJev("rede", "A resposta do Jev chegou cortada.");
    }
    if (!resposta.ok) throw falhaDoEstado(resposta.status, texto.slice(0, 500));
    if (texto.length > MAXIMO_DA_RESPOSTA) throw new ErroDoJev("resposta-invalida", "A resposta do Jev é grande demais.");
    let corpo: unknown;
    try {
      corpo = JSON.parse(texto);
    } catch {
      throw new ErroDoJev("resposta-invalida", "O Jev respondeu, mas não em JSON (ou a resposta veio cortada).");
    }
    return lerRespostaDoJev(corpo, pedido.questions);
  } finally {
    clearTimeout(relogio);
  }
}
