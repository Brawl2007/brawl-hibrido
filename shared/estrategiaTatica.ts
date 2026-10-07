/**
 * A estratégia tática do fim do draft: decisões pequenas, estruturadas e
 * validadas — quem joga em que lane, quem enfrenta quem, o estilo, a abertura,
 * a rotação, o alvo, o plano A/B/C e o que fazer em cada situação.
 *
 * QUEM DECIDE
 *
 * O Jev (TypeSafe) decide: responde a perguntas de escolha com probabilidades
 * calibradas (ver `server/decisoesTaticas.ts`). Quando o Jev não está
 * disponível, as regras do site (as mesmas lanes e duelos que o Draft já
 * mostra) dão uma estratégia base, marcada como tal. Uma IA de texto (Gemini,
 * Groq…) só EXPLICA: nunca escreve nesta estrutura.
 *
 * PORQUÊ ENUMERAÇÕES E NÃO TEXTO
 *
 * Cada decisão é uma escolha de uma lista fechada. Assim a estratégia é
 * validada ao campo, o motor 3D sabe animá-la sem interpretar frases, e nada
 * do que um modelo escreva pode entrar como ação desconhecida ou brawler
 * inventado. Só os nomes do draft passam; só as ações desta lista existem.
 */
import { z } from "zod";

export const LANES = ["esquerda", "mid", "direita"] as const;
export type Lane = (typeof LANES)[number];
export const NOME_DA_LANE: Record<Lane, string> = { esquerda: "Lane esquerda", mid: "Mid", direita: "Lane direita" };

type Opcao<T extends string> = { id: T; nome: string; descricao: string };
const ids = <T extends string>(lista: readonly Opcao<T>[]) => lista.map((o) => o.id) as [T, ...T[]];

export const ESTILOS = [
  { id: "agressivo", nome: "Agressivo", descricao: "Procurar lutas cedo e forçar trocas enquanto os duelos são favoráveis." },
  { id: "controlo", nome: "Controlo", descricao: "Segurar as posições-chave do mapa e obrigar o adversário a entrar." },
  { id: "defensivo", nome: "Defensivo", descricao: "Jogar perto da nossa metade e só lutar com vantagem clara." },
  { id: "pressao-lateral", nome: "Pressão lateral", descricao: "Carregar numa lane para abrir o mapa pelo lado." },
  { id: "poke", nome: "Poke", descricao: "Dano à distância, sem entrar: gastar a vida deles antes de lutar." },
  { id: "esperar-erro", nome: "Esperar o erro", descricao: "Não dar lutas e punir quem avança sozinho." },
  { id: "proteger-objetivo", nome: "Proteger o objetivo", descricao: "Tudo à volta do objetivo do modo: guardar e negar." },
] as const satisfies readonly Opcao<string>[];
export type Estilo = (typeof ESTILOS)[number]["id"];

export const ABERTURAS = [
  { id: "esquerda", nome: "Pela esquerda", descricao: "Os primeiros segundos carregam na lane esquerda." },
  { id: "centro", nome: "Pelo centro", descricao: "Os primeiros segundos são para ganhar o meio." },
  { id: "direita", nome: "Pela direita", descricao: "Os primeiros segundos carregam na lane direita." },
  { id: "dividir", nome: "Dividir 1-1-1", descricao: "Cada um na sua lane, sem juntar." },
] as const satisfies readonly Opcao<string>[];
export type Abertura = (typeof ABERTURAS)[number]["id"];

export const ROTACOES = [
  { id: "manter", nome: "Manter as lanes", descricao: "Ninguém troca de lane." },
  { id: "trocar-com-mid", nome: "Trocar com o Mid", descricao: "O Mid troca com a lane mais fraca." },
  { id: "esquerda-centro", nome: "Esquerda → centro", descricao: "Quem está na esquerda fecha para o meio." },
  { id: "direita-centro", nome: "Direita → centro", descricao: "Quem está na direita fecha para o meio." },
  { id: "centro-esquerda", nome: "Centro → esquerda", descricao: "O Mid roda para ajudar a esquerda." },
  { id: "centro-direita", nome: "Centro → direita", descricao: "O Mid roda para ajudar a direita." },
  { id: "recuar", nome: "Recuar", descricao: "A equipa junta-se atrás e reagrupa." },
  { id: "avancar", nome: "Avançar", descricao: "A equipa sobe junta." },
] as const satisfies readonly Opcao<string>[];
export type Rotacao = (typeof ROTACOES)[number]["id"];

export const PRIORIDADES = [
  { id: "sobreviver", nome: "Sobreviver", descricao: "Não morrer primeiro vale mais do que eliminar." },
  { id: "eliminar", nome: "Eliminar", descricao: "Procurar a eliminação do alvo prioritário." },
  { id: "controlar-terreno", nome: "Controlar o terreno", descricao: "Ganhar e segurar espaço no mapa." },
  { id: "proteger-companheiro", nome: "Proteger um companheiro", descricao: "Manter vivo quem ganha a partida." },
  { id: "pressionar", nome: "Pressionar", descricao: "Não deixar o adversário respirar." },
  { id: "capturar-objetivo", nome: "Capturar o objetivo", descricao: "O objetivo do modo acima de tudo." },
] as const satisfies readonly Opcao<string>[];
export type Prioridade = (typeof PRIORIDADES)[number]["id"];

export const ACOES_NO_CONFRONTO = [
  { id: "enfrentar", nome: "Enfrentar", descricao: "Ir à luta com ele." },
  { id: "evitar", nome: "Evitar", descricao: "Não dar este duelo: recuar e deixar outro tratar dele." },
  { id: "segurar", nome: "Segurar", descricao: "Ficar na posição e não o deixar passar." },
  { id: "pressionar", nome: "Pressionar", descricao: "Dano à distância para o obrigar a recuar." },
] as const satisfies readonly Opcao<string>[];
export type AcaoNoConfronto = (typeof ACOES_NO_CONFRONTO)[number]["id"];

export const PLANOS = [
  { id: "A", nome: "Controlo do centro", descricao: "Ganhar o meio primeiro e jogar a partir dele." },
  { id: "B", nome: "Pressão dupla nas laterais", descricao: "As duas lanes carregam ao mesmo tempo; o meio segura." },
  { id: "C", nome: "Jogar recuado e punir o avanço", descricao: "Ficar atrás, deixá-los entrar e castigar." },
] as const satisfies readonly Opcao<string>[];
export type Plano = (typeof PLANOS)[number]["id"];

export const MUDAR_DE_PLANO = [
  { id: "nunca", nome: "Não mudar", descricao: "O plano escolhido vai até ao fim." },
  { id: "se-perder-uma-lane", nome: "Se perdermos uma lane", descricao: "Passar ao plano de recurso quando uma lane cair." },
  { id: "se-perder-o-mid", nome: "Se perdermos o meio", descricao: "Passar ao plano de recurso quando o meio cair." },
  { id: "a-meio-da-partida", nome: "A meio da partida", descricao: "Mudar para o plano de recurso a meio, aconteça o que acontecer." },
] as const satisfies readonly Opcao<string>[];
export type MudarDePlano = (typeof MUDAR_DE_PLANO)[number]["id"];

export const RESPOSTAS_A_VANTAGEM = [
  { id: "pressionar", nome: "Pressionar", descricao: "Subir e aproveitar a vantagem." },
  { id: "manter", nome: "Manter a posição", descricao: "Guardar a vantagem sem arriscar." },
] as const satisfies readonly Opcao<string>[];
export type RespostaAVantagem = (typeof RESPOSTAS_A_VANTAGEM)[number]["id"];

export const RESPOSTAS_AO_RECUO = [
  { id: "avancar", nome: "Avançar", descricao: "Subir atrás deles." },
  { id: "manter", nome: "Manter", descricao: "Não os seguir." },
  { id: "objetivo", nome: "Ir ao objetivo", descricao: "Aproveitar para jogar o objetivo do modo." },
] as const satisfies readonly Opcao<string>[];
export type RespostaAoRecuo = (typeof RESPOSTAS_AO_RECUO)[number]["id"];

/** O que um brawler faz num passo da timeline. Só estas existem: o motor 3D sabe desenhar cada uma. */
export const ACOES_DA_TIMELINE = ["mover", "avancar", "recuar", "rodar", "pressionar", "atacar", "super", "dash", "segurar", "cobrir"] as const;
export type AcaoDaTimeline = (typeof ACOES_DA_TIMELINE)[number];

/** O objetivo de cada modo, como o jogo o define. Sem o modo, fica por dizer. */
export const OBJETIVO_DO_MODO: Record<string, string> = {
  "gem-grab": "Juntar 10 gemas da mina do centro e segurá-las até ao fim da contagem.",
  "brawl-ball": "Marcar 2 golos na baliza do adversário.",
  knockout: "Eliminar os três adversários em cada ronda (melhor de três).",
  heist: "Destruir o cofre do adversário antes que destruam o nosso.",
  "hot-zone": "Controlar a zona até chegar aos 100%.",
  bounty: "Acabar com mais estrelas do que o adversário: cada eliminação vale estrelas.",
};

export const CONDICOES = [
  { id: "ameaca-avanca", pergunta: "Se a maior ameaça avançar, quem ajuda?" },
  { id: "perde-esquerda", pergunta: "Se perdermos a lane esquerda, quem roda?" },
  { id: "ganha-vantagem", pergunta: "Se ganharmos vantagem, pressionar ou manter?" },
  { id: "inimigo-recua", pergunta: "Se o adversário recuar, o que fazemos?" },
] as const;
export type IdDaCondicao = (typeof CONDICOES)[number]["id"];

/* ---------------------------------------------------------------------------
 * O formato validado. `z.enum` recusa ações desconhecidas; os nomes são
 * conferidos contra o draft em `conferirContraODraft`.
 * ------------------------------------------------------------------------- */
const nome = z.string().trim().min(1).max(40);
const probabilidade = z.number().finite().min(0).max(1);

export const esquemaDaEstrategia = z.object({
  versao: z.literal(1),
  motor: z.enum(["jev", "regras"]),
  modelo: z.string().max(60).optional(),
  lanes: z.object({ esquerda: nome, mid: nome, direita: nome }),
  confrontos: z.array(z.object({ nosso: nome, deles: nome, lane: z.enum(LANES), acao: z.enum(ids(ACOES_NO_CONFRONTO)) })).length(3),
  estilo: z.enum(ids(ESTILOS)),
  abertura: z.enum(ids(ABERTURAS)),
  rotacao: z.enum(ids(ROTACOES)),
  prioridade: z.enum(ids(PRIORIDADES)),
  alvoPrioritario: nome,
  maiorAmeaca: nome,
  plano: z.enum(ids(PLANOS)),
  planoDeRecurso: z.enum(ids(PLANOS)),
  mudarDePlano: z.enum(ids(MUDAR_DE_PLANO)),
  condicoes: z.object({
    ameacaAvanca: nome,
    perdeEsquerda: z.union([nome, z.literal("recuar")]),
    ganhaVantagem: z.enum(ids(RESPOSTAS_A_VANTAGEM)),
    inimigoRecua: z.enum(ids(RESPOSTAS_AO_RECUO)),
  }),
  condicaoDeVitoria: z.string().trim().min(1).max(140),
  /** A confiança do Jev em cada decisão (0–1). Sem Jev, fica vazia. */
  confianca: z.object({ geral: probabilidade.nullable(), porDecisao: z.record(z.string().max(30), probabilidade) }),
});
export type EstrategiaTatica = z.infer<typeof esquemaDaEstrategia>;

export type DraftDaEstrategia = { nossos: readonly string[]; deles: readonly string[] };

/**
 * Valida a forma e confere tudo contra o draft: só brawlers deste draft, cada
 * um do lado certo, cada nosso numa lane só, e confrontos entre os seis.
 * Devolve a estratégia (congelada) ou uma lista de problemas.
 */
export function conferirContraODraft(bruto: unknown, draft: DraftDaEstrategia): { ok: true; estrategia: EstrategiaTatica } | { ok: false; problemas: string[] } {
  const lida = esquemaDaEstrategia.safeParse(bruto);
  if (!lida.success) return { ok: false, problemas: lida.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "estratégia"}: ${i.message}`) };
  const e = lida.data;
  const nossos = new Set(draft.nossos), deles = new Set(draft.deles);
  const problemas: string[] = [];
  const naLane = [e.lanes.esquerda, e.lanes.mid, e.lanes.direita];
  if (naLane.some((n) => !nossos.has(n))) problemas.push("lanes: brawler que não é da nossa equipa neste draft");
  if (new Set(naLane).size !== 3) problemas.push("lanes: o mesmo brawler em duas lanes");
  const nossosNosConfrontos = e.confrontos.map((c) => c.nosso), delesNosConfrontos = e.confrontos.map((c) => c.deles);
  if (nossosNosConfrontos.some((n) => !nossos.has(n)) || new Set(nossosNosConfrontos).size !== 3) problemas.push("confrontos: os nossos têm de ser os três do draft, um confronto cada");
  if (delesNosConfrontos.some((n) => !deles.has(n)) || new Set(delesNosConfrontos).size !== 3) problemas.push("confrontos: os adversários têm de ser os três do draft, um confronto cada");
  if (e.confrontos.some((c) => e.lanes[c.lane] !== c.nosso)) problemas.push("confrontos: a lane do confronto não é a lane desse brawler");
  if (!deles.has(e.alvoPrioritario)) problemas.push("alvoPrioritario: não é um adversário deste draft");
  if (!deles.has(e.maiorAmeaca)) problemas.push("maiorAmeaca: não é um adversário deste draft");
  if (!nossos.has(e.condicoes.ameacaAvanca)) problemas.push("condicoes.ameacaAvanca: não é da nossa equipa");
  if (e.condicoes.perdeEsquerda !== "recuar" && (!nossos.has(e.condicoes.perdeEsquerda) || e.condicoes.perdeEsquerda === e.lanes.esquerda)) {
    problemas.push("condicoes.perdeEsquerda: tem de ser outro brawler nosso (ou recuar)");
  }
  if (problemas.length) return { ok: false, problemas };
  return { ok: true, estrategia: congelar(e) };
}

/** Congela a estratégia inteira: quem explica ou desenha não a pode mudar sem querer. */
function congelar<T>(valor: T): T {
  if (valor && typeof valor === "object") {
    for (const filho of Object.values(valor as Record<string, unknown>)) congelar(filho);
    Object.freeze(valor);
  }
  return valor;
}

/** A lane de um brawler nosso. */
export function laneDe(estrategia: Pick<EstrategiaTatica, "lanes">, brawler: string): Lane | null {
  return LANES.find((lane) => estrategia.lanes[lane] === brawler) ?? null;
}

/** O nível da confiança, para o ecrã. Sem número (sem Jev), não há nível. */
export function nivelDeConfianca(valor: number | null | undefined): "Alta" | "Média" | "Baixa" | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  return valor >= 0.7 ? "Alta" : valor >= 0.45 ? "Média" : "Baixa";
}

export const nomeDe = <T extends string>(lista: readonly Opcao<T>[], id: T) => lista.find((o) => o.id === id)?.nome ?? id;

/**
 * A condição de vitória, escrita a partir das decisões (nunca por uma IA de
 * texto): o objetivo do modo, o plano e o alvo.
 */
export function condicaoDeVitoriaDe(decisoes: { plano: Plano; alvoPrioritario: string; maiorAmeaca: string; prioridade: Prioridade }, modoId: string) {
  const plano = decisoes.plano === "A" ? "Controlar o centro" : decisoes.plano === "B" ? "Ganhar as duas laterais" : "Esperar atrás e punir quem entra";
  const alvo = decisoes.prioridade === "sobreviver" || decisoes.prioridade === "proteger-companheiro"
    ? `sem perder ninguém para ${decisoes.maiorAmeaca}`
    : `e eliminar ${decisoes.alvoPrioritario} primeiro`;
  const objetivo = modoId === "hot-zone" ? " para ficar com a zona"
    : modoId === "gem-grab" ? " para segurar as gemas"
      : modoId === "brawl-ball" ? " para abrir caminho à baliza"
        : modoId === "heist" ? " para chegar ao cofre"
          : modoId === "bounty" ? " para acabar com mais estrelas"
            : "";
  return `${plano}${objetivo}, ${alvo}.`.slice(0, 140);
}

/* ---------------------------------------------------------------------------
 * A explicação da IA de texto: só texto, à parte das decisões.
 * ------------------------------------------------------------------------- */
export const FASES_EXPLICADAS = ["abertura", "confrontos", "ameaca", "rotacao", "perde-esquerda", "vantagem"] as const;
export type FaseExplicada = (typeof FASES_EXPLICADAS)[number];
export type ExplicacaoTatica = {
  resumo: string;
  /** `corrigida`: a IA contradisse a decisão (ou não disse nada); a instrução foi escrita a partir das decisões. */
  porBrawler: Array<{ brawler: string; instrucao: string; corrigida?: true }>;
  porFase: Array<{ fase: FaseExplicada; dica: string }>;
  justificativa: string;
};
