/**
 * O quadro do general: o mapa no fim do draft, com cada brawler numa posição e
 * setas de avanço, recuo e rotação — como um plano de batalha desenhado à mão.
 *
 * COORDENADAS
 *
 * Tudo em frações do mapa, de 0 a 1: `x` da esquerda para a direita, `y` de
 * cima para baixo. Em cima fica o adversário, em baixo a tua equipa — o mesmo
 * que o mapa dos duelos e o próprio jogo mostram. Frações, e não píxeis, para o
 * plano ser o mesmo num telemóvel e num ecrã grande.
 *
 * QUEM ESCREVE O PLANO
 *
 * Pode ser a IA (ver `server/generalIA.ts`) ou quem usa o site, arrastando os
 * brawlers e desenhando setas. A resposta da IA passa sempre por
 * `lerPlanoDaIA`: um modelo pode inventar um brawler que não está no draft,
 * dar coordenadas em percentagem ou fora do mapa, ou mandar vinte setas. Nada
 * disso chega ao ecrã.
 */
import { inferDraftRole, posicionarNoMapa, type DraftRole } from "./draft";
import { COLUNAS_DO_MAPA, LINHAS_DO_MAPA, centroDaCasa, grelhaEmTexto, pontoLivre, type TerrenoDoMapa } from "./terrenoDoMapa";

export type PontoNoMapa = { x: number; y: number };
export type TipoDeSeta = "avanco" | "recuo" | "rotacao";
/** `nota`: porquê este movimento, em poucas palavras — fica escrita no mapa, a meio da seta. */
export type SetaDoPlano = { id: string; de: PontoNoMapa; para: PontoNoMapa; tipo: TipoDeSeta; brawler?: string; nota?: string };
/** Build sugerida. Vazio quando a IA não tem a certeza — melhor nada do que um nome inventado. */
export type BuildDoBrawler = {
  gadget: string;
  poderEstelar: string;
  engrenagens: string[];
  /** Os desenhos, postos pelo servidor a partir da lista real (ver `server/catalogoDeBuilds.ts`). */
  imagens?: { gadget?: string | null; poderEstelar?: string | null; engrenagens?: Array<string | null> };
};
/** O que o brawler consegue fazer ao terreno. Só entra o que a IA afirma com certeza. */
export type Capacidade = "parte-paredes" | "atravessa-agua" | "salta-paredes";
export const CAPACIDADES: ReadonlyArray<{ id: Capacidade; nome: string }> = [
  { id: "parte-paredes", nome: "Parte paredes" },
  { id: "atravessa-agua", nome: "Atravessa água" },
  { id: "salta-paredes", nome: "Salta paredes" },
];
/** Passos fantasma: o caminho que a IA prevê que um brawler vai percorrer mais vezes. */
export type TrilhoDoPlano = { id: string; brawler: string; lado: "nos" | "eles"; pontos: PontoNoMapa[] };
export const MAXIMO_DE_TRILHOS = 6;

export type OrdemDoBrawler = {
  brawler: string;
  funcao: string;
  objetivo: string;
  quandoAvancar: string;
  cuidados: string[];
  /** Quando e como usar o gadget (o acessório), numa situação concreta. Vazio se a IA não disse. */
  usarGadget?: string;
  build?: BuildDoBrawler;
  capacidades?: Capacidade[];
};
/** Uma ordem no sítio do mapa onde deve acontecer. */
export type TipoDeMarcador =
  | "ataque" | "defesa" | "controlo" | "posicao" | "emboscada" | "flanco" | "cobertura" | "gadget"
  | "destruir" | "agua" | "abertura" | "perigo" | "foco";
export type MarcadorDoPlano = { id: string; tipo: TipoDeMarcador; ponto: PontoNoMapa; nota: string; brawler?: string };
export type FaseDoPlano = { nome: string; instrucao: string };

export type PlanoDoGeneral = {
  resumo: string;
  condicaoDeVitoria: string;
  fases: FaseDoPlano[];
  /** O que o adversário deve fazer, lido do draft dele e do mapa. */
  previsao: string[];
  ordens: OrdemDoBrawler[];
  marcadores: MarcadorDoPlano[];
  trilhos: TrilhoDoPlano[];
  /** Posições pela chave `chaveDaFicha` ("a:Wendy", "e:Amber"). */
  posicoes: Record<string, PontoNoMapa>;
  setas: SetaDoPlano[];
  origem: "ia" | "manual";
  geradoEm?: string;
  /** Páginas que a IA consultou na pesquisa de atualidade antes de planear. */
  fontes?: FonteConsultada[];
};

export type FonteConsultada = { titulo: string; url: string };

export const TIPOS_DE_SETA: ReadonlyArray<{ id: TipoDeSeta; nome: string }> = [
  { id: "avanco", nome: "Avanço" },
  { id: "recuo", nome: "Recuo" },
  { id: "rotacao", nome: "Rotação" },
];

export const MAXIMO_DE_SETAS = 12;
export const MAXIMO_DE_MARCADORES = 14;

export const TIPOS_DE_MARCADOR: ReadonlyArray<{ id: TipoDeMarcador; nome: string; curto: string; simbolo: string }> = [
  { id: "ataque", nome: "Atacar aqui", curto: "Ataque", simbolo: "⚔" },
  { id: "defesa", nome: "Defender aqui", curto: "Defesa", simbolo: "⛊" },
  { id: "controlo", nome: "Controlar esta posição", curto: "Controlo", simbolo: "◎" },
  { id: "posicao", nome: "Assumir esta posição", curto: "Posição", simbolo: "⚑" },
  { id: "emboscada", nome: "Esconder no mato para emboscada", curto: "Emboscada", simbolo: "◉" },
  { id: "flanco", nome: "Flanquear por aqui", curto: "Flanco", simbolo: "↪" },
  { id: "cobertura", nome: "Usar esta parede como cobertura", curto: "Cobertura", simbolo: "▮" },
  { id: "gadget", nome: "Usar o gadget aqui", curto: "Gadget", simbolo: "◆" },
  { id: "destruir", nome: "Partir estas paredes", curto: "Partir paredes", simbolo: "✹" },
  { id: "agua", nome: "Atravessar a água aqui", curto: "Água", simbolo: "≈" },
  { id: "abertura", nome: "Abertura: dá para avançar", curto: "Abertura", simbolo: "➜" },
  { id: "perigo", nome: "Perigo", curto: "Perigo", simbolo: "!" },
  { id: "foco", nome: "Alvo prioritário", curto: "Alvo", simbolo: "✕" },
];

/** Nomes dos modos como o jogo os diz em português. */
export const NOME_DO_MODO: Record<string, string> = {
  "gem-grab": "Pique-Gema",
  "brawl-ball": "Fute-Brawl",
  knockout: "Nocaute",
  heist: "Roubo (cofre)",
  "hot-zone": "Zona Estratégica",
  bounty: "Caça-Estrelas",
};

export function chaveDaFicha(lado: "nos" | "eles", brawler: string) {
  return `${lado === "nos" ? "a" : "e"}:${brawler}`;
}

const COLUNA_X = { left: 0.2, mid: 0.5, right: 0.8 } as const;
const LINHA_Y = { nos: 0.84, eles: 0.16 } as const;

/**
 * Onde cada um começa antes de alguém mexer: a mesma coluna do mapa dos
 * duelos (Mid ao meio, Lane nas pontas), a tua equipa em baixo e o adversário
 * em cima.
 */
export function posicoesIniciais(nossos: readonly string[], deles: readonly string[], funcaoDe: (brawler: string) => DraftRole = inferDraftRole) {
  const posicoes: Record<string, PontoNoMapa> = {};
  for (const [lado, nomes] of [["nos", nossos], ["eles", deles]] as const) {
    for (const { position, item } of posicionarNoMapa(nomes, funcaoDe)) {
      posicoes[chaveDaFicha(lado, item)] = { x: COLUNA_X[position], y: LINHA_Y[lado] };
    }
    // Um quarto brawler (draft fora do normal) não fica sem lugar.
    nomes.forEach((nome, indice) => {
      posicoes[chaveDaFicha(lado, nome)] ??= { x: 0.2 + 0.3 * (indice % 3), y: lado === "nos" ? 0.72 : 0.28 };
    });
  }
  return posicoes;
}

export function planoVazio(nossos: readonly string[], deles: readonly string[]): PlanoDoGeneral {
  return { resumo: "", condicaoDeVitoria: "", fases: [], previsao: [], ordens: [], marcadores: [], trilhos: [], posicoes: posicoesIniciais(nossos, deles), setas: [], origem: "manual" };
}

/** Uma coordenada dentro do mapa, com margem para a ficha não sair pela borda. */
export function limitarAoMapa(valor: number) {
  if (!Number.isFinite(valor)) return 0.5;
  return Math.min(0.97, Math.max(0.03, valor));
}

const normalizarNome = (nome: string) => nome.toLowerCase().replace(/[^a-z0-9]/g, "");

const texto = (valor: unknown, maximo: number) =>
  typeof valor === "string" ? valor.replace(/\s+/g, " ").trim().slice(0, maximo) : "";

/**
 * Um ponto vindo da IA. O pedido é em casas (coluna 0–20, linha 0–32), que é
 * como a IA lê a grelha; aceita também frações {x, y}, que alguns modelos
 * devolvem na mesma. Tudo o resto é recusado.
 */
function lerPonto(bruto: unknown): PontoNoMapa | null {
  if (!bruto || typeof bruto !== "object") return null;
  const { col, linha, x, y } = bruto as { col?: unknown; linha?: unknown; x?: unknown; y?: unknown };
  const numero = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? valor : null);
  const c = numero(col), l = numero(linha);
  if (c !== null && l !== null) {
    const casa = centroDaCasa({ colunas: COLUNAS_DO_MAPA, linhas: LINHAS_DO_MAPA }, Math.round(c), Math.round(l));
    return { x: limitarAoMapa(casa.x), y: limitarAoMapa(casa.y) };
  }
  const fx = numero(x), fy = numero(y);
  if (fx === null || fy === null) return null;
  const escala = fx > 1.5 || fy > 1.5 ? 100 : 1;
  return { x: limitarAoMapa(fx / escala), y: limitarAoMapa(fy / escala) };
}

/** "não sei", "—", "desconhecido": a IA a dizer que não sabe conta como vazio. */
const naoSabe = (valor: string) => !valor || /^(n[aã]o sei|desconhecid[oa]|—|-|n\/a|nenhum[a]?)$/i.test(valor);

function lerBuild(bruto: unknown): { build?: BuildDoBrawler } {
  if (!bruto || typeof bruto !== "object") return {};
  const { gadget, poderEstelar, engrenagens } = bruto as Record<string, unknown>;
  const build: BuildDoBrawler = {
    gadget: naoSabe(texto(gadget, 60)) ? "" : texto(gadget, 60),
    poderEstelar: naoSabe(texto(poderEstelar, 60)) ? "" : texto(poderEstelar, 60),
    engrenagens: (Array.isArray(engrenagens) ? engrenagens : []).map((e) => texto(e, 40)).filter((e) => !naoSabe(e)).slice(0, 2),
  };
  return build.gadget || build.poderEstelar || build.engrenagens.length ? { build } : {};
}

/**
 * Transforma a resposta da IA num plano que o ecrã pode desenhar.
 *
 * - Só entram brawlers da tua equipa neste draft; nomes inventados ficam de fora.
 * - Coordenadas ficam dentro do mapa.
 * - Os adversários ficam onde estavam: a IA dá ordens à tua equipa, não à outra.
 * - No máximo `MAXIMO_DE_SETAS` setas, e uma seta sem comprimento não conta.
 * - Uma resposta sem nenhuma ordem utilizável é um erro, não um plano vazio.
 */
export function lerPlanoDaIA(bruto: unknown, nossos: readonly string[], deles: readonly string[], agora = new Date(), terreno?: TerrenoDoMapa | null): PlanoDoGeneral {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) throw new Error("A IA não devolveu um plano.");
  const resposta = bruto as Record<string, unknown>;
  const porNome = new Map(nossos.map((nome) => [normalizarNome(nome), nome]));
  const posicoes = posicoesIniciais(nossos, deles);
  const ordens: OrdemDoBrawler[] = [];

  for (const entrada of Array.isArray(resposta.ordens) ? resposta.ordens : []) {
    if (!entrada || typeof entrada !== "object") continue;
    const ordem = entrada as Record<string, unknown>;
    const brawler = porNome.get(normalizarNome(texto(ordem.brawler, 40)));
    if (!brawler || ordens.some((jaLida) => jaLida.brawler === brawler)) continue;
    const capacidades = (Array.isArray(ordem.capacidades) ? ordem.capacidades : []).filter((c): c is Capacidade => CAPACIDADES.some((item) => item.id === c)).filter((c, i, todas) => todas.indexOf(c) === i);
    const posicao = lerPonto(ordem.posicao);
    // Nunca dentro de uma parede; na água só quem a atravessa. Senão, a casa livre mais próxima.
    if (posicao) posicoes[chaveDaFicha("nos", brawler)] = pontoLivre(terreno, posicao, { atravessaAgua: capacidades.includes("atravessa-agua") });
    ordens.push({
      brawler,
      funcao: texto(ordem.funcao, 40),
      objetivo: texto(ordem.objetivo, 160),
      quandoAvancar: texto(ordem.quandoAvancar, 100),
      ...(naoSabe(texto(ordem.usarGadget, 110)) ? {} : { usarGadget: texto(ordem.usarGadget, 110) }),
      ...lerBuild(ordem.build),
      capacidades,
      cuidados: (Array.isArray(ordem.cuidados) ? ordem.cuidados : []).map((cuidado) => texto(cuidado, 100)).filter(Boolean).slice(0, 2),
    });
  }
  if (ordens.length === 0) throw new Error("A IA respondeu, mas sem ordens para nenhum brawler da tua equipa.");
  // A ordem das fichas é a do draft, não a da resposta.
  ordens.sort((a, b) => nossos.indexOf(a.brawler) - nossos.indexOf(b.brawler));
  const atravessaAgua = (nome?: string) => Boolean(nome && ordens.find((o) => o.brawler === nome)?.capacidades?.includes("atravessa-agua"));

  // Onde a IA prevê que os adversários vão estar (opcional).
  const porNomeDeles = new Map(deles.map((nome) => [normalizarNome(nome), nome]));
  for (const entrada of Array.isArray(resposta.inimigos) ? resposta.inimigos : []) {
    const inimigo = (entrada ?? {}) as Record<string, unknown>;
    const nome = porNomeDeles.get(normalizarNome(texto(inimigo.brawler, 40)));
    const ponto = lerPonto(inimigo.posicao);
    if (nome && ponto) posicoes[chaveDaFicha("eles", nome)] = pontoLivre(terreno, ponto);
  }

  const setas: SetaDoPlano[] = [];
  for (const entrada of Array.isArray(resposta.setas) ? resposta.setas : []) {
    if (setas.length >= MAXIMO_DE_SETAS) break;
    if (!entrada || typeof entrada !== "object") continue;
    const seta = entrada as Record<string, unknown>;
    const brawler = porNome.get(normalizarNome(texto(seta.brawler, 40)));
    // A ponta de uma seta é para onde o brawler vai: nunca uma parede, e água só para quem a atravessa.
    const de = lerPonto(seta.de);
    const paraBruto = lerPonto(seta.para);
    const para = paraBruto && pontoLivre(terreno, paraBruto, { atravessaAgua: atravessaAgua(brawler) });
    if (!de || !para || Math.hypot(para.x - de.x, para.y - de.y) < 0.03) continue;
    const tipo = TIPOS_DE_SETA.some((item) => item.id === seta.tipo) ? (seta.tipo as TipoDeSeta) : "avanco";
    const notaDaSeta = texto(seta.nota, 50);
    setas.push({ id: `ia-${setas.length + 1}`, de, para, tipo, ...(brawler ? { brawler } : {}), ...(notaDaSeta ? { nota: notaDaSeta } : {}) });
  }

  const marcadores: MarcadorDoPlano[] = [];
  for (const entrada of Array.isArray(resposta.marcadores) ? resposta.marcadores : []) {
    if (marcadores.length >= MAXIMO_DE_MARCADORES) break;
    const marcador = (entrada ?? {}) as Record<string, unknown>;
    const pontoBruto = lerPonto(marcador.ponto);
    const nota = texto(marcador.nota, 60);
    if (!pontoBruto || !nota) continue;
    const tipo = TIPOS_DE_MARCADOR.some((item) => item.id === marcador.tipo) ? (marcador.tipo as TipoDeMarcador) : "foco";
    const dono = porNome.get(normalizarNome(texto(marcador.brawler, 40)));
    // "Partir paredes" aponta para uma parede e "atravessar água" para a água; o resto fica em chão livre.
    // "Cobertura" e "partir paredes" apontam para uma parede, "atravessar água" para a água; o resto fica em chão livre.
    const ponto = tipo === "destruir" || tipo === "agua" || tipo === "cobertura" ? pontoBruto : pontoLivre(terreno, pontoBruto, { atravessaAgua: atravessaAgua(dono) });
    marcadores.push({ id: `ia-m${marcadores.length + 1}`, tipo, ponto, nota, ...(dono ? { brawler: dono } : {}) });
  }

  // Passos fantasma: só brawlers deste draft, 2 a 6 casas, sem paredes (e sem água para quem não a atravessa).
  const trilhos: TrilhoDoPlano[] = [];
  for (const entrada of Array.isArray(resposta.trilhos) ? resposta.trilhos : []) {
    if (trilhos.length >= MAXIMO_DE_TRILHOS) break;
    const trilho = (entrada ?? {}) as Record<string, unknown>;
    const bruto = normalizarNome(texto(trilho.brawler, 40));
    const nosso = porNome.get(bruto);
    const deles_ = porNomeDeles.get(bruto);
    const brawler = nosso ?? deles_;
    if (!brawler) continue;
    const lado = nosso ? "nos" : "eles";
    const pontos = (Array.isArray(trilho.pontos) ? trilho.pontos : [])
      .map((p) => lerPonto(p))
      .filter((p): p is PontoNoMapa => Boolean(p))
      .map((p) => pontoLivre(terreno, p, { atravessaAgua: lado === "nos" && atravessaAgua(brawler) }))
      .slice(0, 6);
    if (pontos.length >= 2) trilhos.push({ id: `ia-t${trilhos.length + 1}`, brawler, lado, pontos });
  }

  const previsao = (Array.isArray(resposta.previsao) ? resposta.previsao : []).map((linha) => texto(linha, 110)).filter(Boolean).slice(0, 3);

  const fases = (Array.isArray(resposta.fases) ? resposta.fases : [])
    .map((fase) => ({ nome: texto((fase as { nome?: unknown })?.nome, 30), instrucao: texto((fase as { instrucao?: unknown })?.instrucao, 110) }))
    .filter((fase) => fase.nome && fase.instrucao)
    .slice(0, 4);

  return {
    resumo: texto(resposta.resumo, 160),
    condicaoDeVitoria: texto(resposta.condicaoDeVitoria, 120),
    fases,
    previsao,
    ordens,
    marcadores,
    trilhos,
    posicoes,
    setas,
    origem: "ia",
    geradoEm: agora.toISOString(),
  };
}

/** O que o site manda ao servidor para pedir um plano. */
export type PedidoDePlano = {
  mapa: string;
  modoId: string;
  /** O id do mapa na Brawlify: dá a imagem e o terreno. Sem ele, a IA trabalha só com o nome. */
  mapaId?: string | null;
  nossos: Array<{ brawler: string; funcao: string }>;
  deles: Array<{ brawler: string; funcao: string }>;
  duelos: Array<{ nosso: string; deles: string; vantagem: number }>;
  nosNome: string;
  /** Os números do site para este mapa, já no elo escolhido. */
  numeros?: Array<{ brawler: string; lado: "nos" | "eles"; vitoria: number | null; uso: number | null }>;
  /** Quando esses números foram recolhidos. */
  dadosDe?: string | null;
  elo?: string | null;
};

/** O que a pesquisa na web trouxe de atual sobre estes brawlers. */
export type Atualidade = { texto: string; fontes: FonteConsultada[] };

/**
 * As instruções para a IA.
 *
 * O que faz dela um analista e não um palpite:
 * - vê a imagem do mapa E a grelha casa a casa (parede, mato, água, objetivo),
 *   por isso pode falar de uma passagem ou de um mato concreto;
 * - responde em casas (coluna, linha), que é como lê a grelha;
 * - tem de prever o adversário, dizer onde há aberturas e quando avançar;
 * - não pode inventar habilidades que não conhece.
 */
/** As builds que existem hoje, para a IA escolher em vez de inventar. */
export type OpcoesDeBuild = { porBrawler: Record<string, { gadgets: string[]; poderes: string[] }>; engrenagens: string[] };

function listaDeBuilds(pedido: PedidoDePlano, opcoes?: OpcoesDeBuild | null) {
  if (!opcoes) return "";
  const linhas = pedido.nossos.map(({ brawler }) => {
    const b = opcoes.porBrawler[brawler];
    return b ? `- ${brawler}: gadgets [${b.gadgets.join(" | ")}]; poderes estelares [${b.poderes.join(" | ")}]` : `- ${brawler}: (sem lista)`;
  });
  return [
    "LISTA DE BUILDS QUE EXISTEM HOJE (escolhe só daqui, com o nome exato):",
    ...linhas,
    opcoes.engrenagens.length ? `Engrenagens: [${opcoes.engrenagens.join(" | ")}]` : "",
  ].filter(Boolean).join("\n");
}

export function textoDoPedido(pedido: PedidoDePlano, comImagem: boolean, terreno?: TerrenoDoMapa | null, atualidade?: Atualidade | null, hoje = new Date(), opcoes?: OpcoesDeBuild | null) {
  const modo = NOME_DO_MODO[pedido.modoId] ?? pedido.modoId;
  const linha = (lista: PedidoDePlano["nossos"]) => lista.map((item) => `${item.brawler} (${item.funcao})`).join(", ") || "—";
  const duelos = pedido.duelos.length
    ? pedido.duelos.map((duelo) => `- ${duelo.nosso} contra ${duelo.deles}: ${Math.round(duelo.vantagem)}% para nós`).join("\n")
    : "- sem duelos calculados";
  const pct = (valor: number | null) => (typeof valor === "number" ? `${valor.toFixed(1)}%` : "—");
  const numeros = (pedido.numeros ?? []).map((n) => `- ${n.brawler} (${n.lado === "nos" ? "nosso" : "adversário"}): vitória ${pct(n.vitoria)}, uso ${pct(n.uso)}`).join("\n");
  const dia = (iso: string) => iso.slice(0, 10);
  return [
    "És um analista profissional de Brawl Stars competitivo (Ranked e Power League, 3 contra 3), especialista em estratégia, leitura de mapa e previsão do adversário. O draft acabou. Planeia a partida da NOSSA equipa como um general a planear uma batalha: posições, movimentos, momentos de avançar e de recuar.",
    "",
    `HOJE É ${dia(hoje.toISOString())}. Planeia com o jogo como está HOJE. O teu conhecimento interno pode estar desatualizado (kits, equilíbrio, builds mudam a cada atualização): quando a informação atual abaixo contradisser o que sabes, vale a informação atual.`,
    "",
    `Mapa: ${pedido.mapa}`,
    `Modo: ${modo}`,
    `Nossa equipa (${pedido.nosNome}): ${linha(pedido.nossos)}`,
    `Adversário: ${linha(pedido.deles)}`,
    "Duelos 1v1 calculados pelo site (percentagem de vantagem para nós; 50% = equilibrado):",
    duelos,
    numeros ? `Números ATUAIS do site neste mapa${pedido.elo ? ` (elo: ${pedido.elo})` : ""}${pedido.dadosDe ? `, recolhidos em ${dia(pedido.dadosDe)}` : ""}:\n${numeros}` : "",
    atualidade?.texto ? `INFORMAÇÃO ATUAL pesquisada hoje na web sobre estes brawlers:\n${atualidade.texto}` : "Não foi possível pesquisar informação atual: se não tiveres a certeza de que algo ainda é assim no jogo de hoje, não o afirmes.",
    "",
    comImagem
      ? "A imagem é o mapa visto de cima, com uma casa de margem à volta. Analisa-a canto a canto: paredes que tapam tiros, mato para emboscadas, água, corredores abertos, passagens estreitas e objetivos (zonas, cofre, baliza, mina de gemas, bases)."
      : "Não há imagem do mapa: usa a grelha e o que sabes do modo.",
    "",
    "COORDENADAS: em casas. col vai de 0 (esquerda) a 20 (direita); linha vai de 0 (topo, base do ADVERSÁRIO) a 32 (fundo, a NOSSA base). O meio do mapa é a linha 16.",
    terreno
      ? `GRELHA DO MAPA (${terreno.colunas}×${terreno.linhas}; "#" parede, '"' mato, "~" água, "o" objetivo/base, "." chão). Cada linha começa pelo seu número:\n${grelhaEmTexto(terreno)}`
      : "",
    "",
    listaDeBuilds(pedido, opcoes),
    "",
    "O JOGADOR VAI LER ISTO EM 20 SEGUNDOS, antes da partida começar. Escreve pouco: frases telegráficas, sem floreados, em português de Portugal. A explicação vai no MAPA (símbolos com nota), não em texto corrido.",
    "O QUE TENS DE ENTREGAR:",
    "1. resumo: 1 frase, no máximo 12 palavras. condicaoDeVitoria: no máximo 10 palavras.",
    "2. previsao: 2 ou 3 frases de no máximo 10 palavras: o que o adversário vai fazer (por onde entra, quem procura quem).",
    "3. inimigos: onde prevês cada adversário a meio do jogo (uma casa por adversário).",
    "4. ordens, uma por brawler nosso:",
    "   - funcao: 2 ou 3 palavras (ex.: \"segura a zona\", \"emboscada no mato\")",
    "   - objetivo: no máximo 12 palavras, com um sítio concreto do mapa",
    "   - quandoAvancar: no máximo 8 palavras (ex.: \"quando o Ash gastar o super\")",
    "   - cuidados: 1 perigo, no máximo 8 palavras",
    "   - usarGadget: quando e como usar o gadget escolhido, numa situação concreta deste jogo, no máximo 10 palavras (ex.: \"no Ash quando saltar para a zona\"). Se não souberes, \"não sei\".",
    "   - posicao: casa a meio do jogo; chão ou mato. NUNCA parede. Água (\"~\") só para quem atravessa água. Pode ser no meio do território inimigo, até junto da base deles, se a estratégia o pedir (roubar a zona, pressionar o spawn, flanquear).",
    "   - build: escolhe da LISTA acima (gadget, poderEstelar e até 2 engrenagens) os nomes EXATOS. Se a lista não tiver o brawler, escreve \"não sei\".",
    "   - capacidades: só as que tem de certeza: \"parte-paredes\", \"atravessa-agua\", \"salta-paredes\". Na dúvida, lista vazia.",
    "5. setas (3 a 7): movimentos-chave. \"avanco\", \"recuo\" ou \"rotacao\"; o \"de\" é a posição do brawler; indica o brawler; e uma nota de no máximo 5 palavras a dizer PORQUÊ (ex.: \"recua se perder o 1v1\", \"entra quando a zona abrir\"). A ponta NUNCA numa parede nem na água (\"~\"), salvo quem atravessa água.",
    "6. marcadores (5 a 10): a explicação no mapa. Cada um com nota de no máximo 5 palavras e, se for de um brawler, o nome dele. Tipos: \"ataque\", \"defesa\", \"controlo\" (segurar passagem), \"posicao\" (assumir posição), \"emboscada\" (esconder neste mato), \"flanco\", \"cobertura\" (usar ESTA parede para tapar tiros), \"gadget\" (usar o gadget AQUI; a nota diz a situação), \"destruir\" (partir estas paredes — só quem parte paredes), \"agua\" (atravessar aqui — só quem atravessa), \"abertura\" (corredor aberto), \"perigo\", \"foco\" (alvo prioritário).",
    "7. fases: 3 (início, meio, fecho), instrução de no máximo 8 palavras.",
    "8. trilhos (passos fantasma): para 3 a 6 brawlers — nossos E adversários — o caminho que vão percorrer mais vezes durante a partida, com 3 a 5 casas por ordem (de onde partem até onde lutam). Sem atravessar paredes nem água (salvo quem atravessa água).",
    "",
    "USA O TERRENO, casa a casa, e diz isso nos símbolos e nas setas: paredes (\"#\") como cobertura contra atiradores; mato ('\"') para emboscada e para esconder quem é de perto; água (\"~\") como barreira que corta caminhos (e atalho para quem a atravessa); corredores abertos (muitos \".\") para quem tem alcance longo; passagens estreitas para controlar. Cada brawler deve ter pelo menos um símbolo ou seta ligado a um sítio concreto do mapa.",
    "",
    "Regras: usa só os brawlers indicados. \"~\" é água: ninguém anda nela, exceto quem atravessa água. Se não conheceres bem o kit de um brawler, NÃO inventes habilidades: fala da função e do alcance.",
  ].filter((parte, indice, todas) => parte !== "" || todas[indice - 1] !== "").join("\n");
}

const CASA = { type: "OBJECT", properties: { col: { type: "INTEGER" }, linha: { type: "INTEGER" } }, required: ["col", "linha"] } as const;

/** O formato que a IA tem de devolver (esquema de resposta da API Gemini). */
export const ESQUEMA_DO_PLANO = {
  type: "OBJECT",
  properties: {
    resumo: { type: "STRING" },
    condicaoDeVitoria: { type: "STRING" },
    previsao: { type: "ARRAY", items: { type: "STRING" } },
    inimigos: { type: "ARRAY", items: { type: "OBJECT", properties: { brawler: { type: "STRING" }, posicao: CASA }, required: ["brawler", "posicao"] } },
    fases: { type: "ARRAY", items: { type: "OBJECT", properties: { nome: { type: "STRING" }, instrucao: { type: "STRING" } }, required: ["nome", "instrucao"] } },
    ordens: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          brawler: { type: "STRING" },
          funcao: { type: "STRING" },
          objetivo: { type: "STRING" },
          quandoAvancar: { type: "STRING" },
          usarGadget: { type: "STRING" },
          cuidados: { type: "ARRAY", items: { type: "STRING" } },
          posicao: CASA,
          build: {
            type: "OBJECT",
            properties: { gadget: { type: "STRING" }, poderEstelar: { type: "STRING" }, engrenagens: { type: "ARRAY", items: { type: "STRING" } } },
            required: ["gadget", "poderEstelar", "engrenagens"],
          },
          capacidades: { type: "ARRAY", items: { type: "STRING", enum: ["parte-paredes", "atravessa-agua", "salta-paredes"] } },
        },
        required: ["brawler", "funcao", "objetivo", "quandoAvancar", "cuidados", "posicao"],
      },
    },
    setas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          brawler: { type: "STRING" },
          tipo: { type: "STRING", enum: ["avanco", "recuo", "rotacao"] },
          de: CASA,
          para: CASA,
          nota: { type: "STRING" },
        },
        required: ["tipo", "de", "para"],
      },
    },
    trilhos: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { brawler: { type: "STRING" }, pontos: { type: "ARRAY", items: CASA } }, required: ["brawler", "pontos"] },
    },
    marcadores: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          tipo: { type: "STRING", enum: ["ataque", "defesa", "controlo", "posicao", "emboscada", "flanco", "cobertura", "gadget", "destruir", "agua", "abertura", "perigo", "foco"] },
          ponto: CASA,
          nota: { type: "STRING" },
          brawler: { type: "STRING" },
        },
        required: ["tipo", "ponto", "nota"],
      },
    },
  },
  required: ["resumo", "condicaoDeVitoria", "previsao", "fases", "ordens", "setas", "marcadores"],
} as const;

/**
 * A mesma forma do esquema, escrita por extenso. Vai no fim do pedido quando
 * a Google falha com o formato estrito e se repete sem ele.
 */
export const FORMATO_DO_PLANO_EM_TEXTO = [
  "Responde só com um objeto JSON, sem texto antes nem depois, exatamente com estas chaves:",
  '{"resumo":"...","condicaoDeVitoria":"...","previsao":["..."],',
  '"inimigos":[{"brawler":"Nome","posicao":{"col":10,"linha":8}}],',
  '"fases":[{"nome":"Início","instrucao":"..."}],',
  '"ordens":[{"brawler":"Nome","funcao":"...","objetivo":"...","quandoAvancar":"...","usarGadget":"...","cuidados":["..."],"posicao":{"col":10,"linha":20},"build":{"gadget":"...","poderEstelar":"...","engrenagens":["..."]},"capacidades":["parte-paredes"]}],',
  '"setas":[{"brawler":"Nome","tipo":"avanco","de":{"col":10,"linha":20},"para":{"col":10,"linha":14},"nota":"porquê, curto"}],',
  '"marcadores":[{"tipo":"emboscada","ponto":{"col":13,"linha":15},"nota":"...","brawler":"Nome"}],',
  '"trilhos":[{"brawler":"Nome","pontos":[{"col":10,"linha":28},{"col":9,"linha":22},{"col":8,"linha":17}]}]}',
  "tipo das setas: avanco, recuo ou rotacao. tipo dos marcadores: ataque, defesa, controlo, posicao, emboscada, flanco, cobertura, gadget, destruir, agua, abertura, perigo ou foco. col de 0 a 20, linha de 0 a 32.",
].join("\n");

/** Onde o plano de um draft fica guardado neste navegador. */
export function chaveDoQuadro(mapa: string | undefined, nossos: readonly string[], deles: readonly string[]) {
  const lista = (nomes: readonly string[]) => [...nomes].sort().join(",");
  return `brawl-hibrido:quadro-do-general:v2:${mapa ?? "sem-mapa"}|${lista(nossos)}|${lista(deles)}`;
}

/** Um desenho só do CDN da Brawlify, em https: um plano guardado não traz outros endereços para a página. */
const desenhoSeguro = (url: unknown) => (typeof url === "string" && /^https:\/\/cdn\.brawlify\.com\/[\w\-/.]+\.(png|webp)$/.test(url) ? url : null);

function limparBuild(build: BuildDoBrawler): BuildDoBrawler {
  return {
    gadget: typeof build.gadget === "string" ? build.gadget : "",
    poderEstelar: typeof build.poderEstelar === "string" ? build.poderEstelar : "",
    engrenagens: Array.isArray(build.engrenagens) ? build.engrenagens.filter((e): e is string => typeof e === "string") : [],
    imagens: build.imagens
      ? {
        gadget: desenhoSeguro(build.imagens.gadget),
        poderEstelar: desenhoSeguro(build.imagens.poderEstelar),
        engrenagens: Array.isArray(build.imagens.engrenagens) ? build.imagens.engrenagens.map(desenhoSeguro) : [],
      }
      : undefined,
  };
}

/**
 * Lê um plano guardado. Um plano de outra versão, estragado, ou de brawlers
 * que já não estão no draft dá lugar ao plano de partida — nunca a um erro.
 */
export function lerPlanoGuardado(bruto: string | null, nossos: readonly string[], deles: readonly string[]): PlanoDoGeneral {
  const base = planoVazio(nossos, deles);
  if (!bruto) return base;
  try {
    const guardado = JSON.parse(bruto) as Partial<PlanoDoGeneral>;
    if (!guardado || typeof guardado !== "object") return base;
    const posicoes = { ...base.posicoes };
    for (const chave of Object.keys(base.posicoes)) {
      const ponto = guardado.posicoes?.[chave];
      if (ponto && typeof ponto.x === "number" && typeof ponto.y === "number") posicoes[chave] = { x: limitarAoMapa(ponto.x), y: limitarAoMapa(ponto.y) };
    }
    const setas = (Array.isArray(guardado.setas) ? guardado.setas : [])
      .filter((seta) => seta && typeof seta.de?.x === "number" && typeof seta.para?.x === "number" && TIPOS_DE_SETA.some((tipo) => tipo.id === seta.tipo))
      .map((seta) => ({ ...seta, nota: typeof seta.nota === "string" ? seta.nota.slice(0, 50) : undefined }))
      .slice(0, MAXIMO_DE_SETAS * 2);
    const ordens = (Array.isArray(guardado.ordens) ? guardado.ordens : [])
      .filter((ordem) => ordem && nossos.includes(ordem.brawler))
      .map((ordem) => ({
        ...ordem,
        quandoAvancar: typeof ordem.quandoAvancar === "string" ? ordem.quandoAvancar : "",
        cuidados: Array.isArray(ordem.cuidados) ? ordem.cuidados : [],
        usarGadget: typeof ordem.usarGadget === "string" ? ordem.usarGadget.slice(0, 110) : undefined,
        build: ordem.build ? limparBuild(ordem.build) : undefined,
      }));
    const nomesDoDraft = new Set([...nossos, ...deles]);
    const trilhos = (Array.isArray(guardado.trilhos) ? guardado.trilhos : [])
      .filter((t) => t && nomesDoDraft.has(t.brawler) && (t.lado === "nos" || t.lado === "eles") && Array.isArray(t.pontos))
      .map((t) => ({ ...t, pontos: t.pontos.filter((p) => typeof p?.x === "number" && typeof p?.y === "number").map((p) => ({ x: limitarAoMapa(p.x), y: limitarAoMapa(p.y) })).slice(0, 6) }))
      .filter((t) => t.pontos.length >= 2)
      .slice(0, MAXIMO_DE_TRILHOS);
    const marcadores = (Array.isArray(guardado.marcadores) ? guardado.marcadores : [])
      .filter((marcador) => marcador && typeof marcador.ponto?.x === "number" && typeof marcador.ponto?.y === "number" && TIPOS_DE_MARCADOR.some((tipo) => tipo.id === marcador.tipo))
      .slice(0, MAXIMO_DE_MARCADORES * 3);
    return {
      ...base,
      resumo: typeof guardado.resumo === "string" ? guardado.resumo : "",
      condicaoDeVitoria: typeof guardado.condicaoDeVitoria === "string" ? guardado.condicaoDeVitoria : "",
      fases: Array.isArray(guardado.fases) ? guardado.fases.filter((fase) => fase && typeof fase.nome === "string") : [],
      previsao: Array.isArray(guardado.previsao) ? guardado.previsao.filter((linha): linha is string => typeof linha === "string") : [],
      ordens,
      marcadores,
      trilhos,
      posicoes,
      setas,
      origem: guardado.origem === "ia" ? "ia" : "manual",
      geradoEm: typeof guardado.geradoEm === "string" ? guardado.geradoEm : undefined,
      fontes: Array.isArray(guardado.fontes)
        ? guardado.fontes.filter((f) => f && typeof f.titulo === "string" && typeof f.url === "string" && /^https:\/\//.test(f.url)).slice(0, 8)
        : undefined,
    };
  } catch {
    return base;
  }
}
