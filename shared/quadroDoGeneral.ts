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
import { COLUNAS_DO_MAPA, LINHAS_DO_MAPA, bloqueiaPassagem, centroDaCasa, corrigirCasas, grelhaEmTexto, pontoLivre, tipoDaCasa, type TerrenoDoMapa } from "./terrenoDoMapa";

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

/**
 * A partida em três momentos. O INÍCIO é o plano principal (posições, setas e
 * símbolos de cima); o MEIO e o FIM têm as suas próprias camadas — os
 * brawlers mudam de sítio, trocam de lane, e há paredes que já foram partidas.
 */
export type MomentoDoPlano = "inicio" | "meio" | "fim";
export const MOMENTOS: ReadonlyArray<{ id: MomentoDoPlano; nome: string }> = [
  { id: "inicio", nome: "Início" },
  { id: "meio", nome: "Meio" },
  { id: "fim", nome: "Fim" },
];
export type CasaDoMapa = { coluna: number; linha: number };
/** O que se desenha num momento. As paredes partidas acumulam: as do meio continuam partidas no fim. */
export type CamadasDoMomento = {
  posicoes: Record<string, PontoNoMapa>;
  setas: SetaDoPlano[];
  marcadores: MarcadorDoPlano[];
  paredesPartidas: CasaDoMapa[];
};
/** O texto de um momento: quando é e como reagir ao marcador. */
export type TextoDoMomento = { momento: MomentoDoPlano; quando: string; resumo: string; seGanhar: string; sePerder: string };
/**
 * Uma ameaça: quem é perigoso para quem, e a exceção em que deixa de ser.
 * Ex.: Pearl → Shade: "não chegues perto, morres" · exceto "Pearl com pouca vida".
 */
export type AmeacaDoPlano = { id: string; perigoso: string; ladoDoPerigoso: "nos" | "eles"; alvo: string; texto: string; excecao?: string };
export const MAXIMO_DE_AMEACAS = 5;
export const MAXIMO_DE_PAREDES_PARTIDAS = 40;

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
  /** Os três momentos da partida (texto). */
  momentos?: TextoDoMomento[];
  /** As camadas do meio e do fim; o início são as camadas de cima. */
  quadros?: Partial<Record<Exclude<MomentoDoPlano, "inicio">, CamadasDoMomento>>;
  ameacas?: AmeacaDoPlano[];
};

/** As camadas de um momento. Um momento que ainda não tem as suas usa as do início. */
const SEM_PAREDES_PARTIDAS: CasaDoMapa[] = [];
export function camadasDoMomento(plano: PlanoDoGeneral, momento: MomentoDoPlano): CamadasDoMomento {
  // Sempre a mesma lista vazia: quem desenha o terreno não o refaz sem razão.
  const inicio = { posicoes: plano.posicoes, setas: plano.setas, marcadores: plano.marcadores, paredesPartidas: SEM_PAREDES_PARTIDAS };
  if (momento === "inicio") return inicio;
  return plano.quadros?.[momento] ?? plano.quadros?.meio ?? inicio;
}

/** O plano com as camadas de um momento trocadas. */
export function comCamadas(plano: PlanoDoGeneral, momento: MomentoDoPlano, camadas: CamadasDoMomento): PlanoDoGeneral {
  if (momento === "inicio") return { ...plano, posicoes: camadas.posicoes, setas: camadas.setas, marcadores: camadas.marcadores };
  return { ...plano, quadros: { ...(plano.quadros ?? {}), [momento]: camadas } };
}

/** O terreno de um momento: as paredes partidas passam a chão. */
export function terrenoDoMomento(terreno: TerrenoDoMapa | null | undefined, paredesPartidas: readonly CasaDoMapa[]) {
  if (!terreno || paredesPartidas.length === 0) return terreno ?? null;
  return corrigirCasas(terreno, paredesPartidas.map((casa) => ({ ...casa, tipo: "chao" as const })));
}

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

  const lerSetas = (lista: unknown, terrenoAqui: TerrenoDoMapa | null | undefined, prefixo: string) => {
    const setas: SetaDoPlano[] = [];
    for (const entrada of Array.isArray(lista) ? lista : []) {
      if (setas.length >= MAXIMO_DE_SETAS) break;
      if (!entrada || typeof entrada !== "object") continue;
      const seta = entrada as Record<string, unknown>;
      const brawler = porNome.get(normalizarNome(texto(seta.brawler, 40)));
      // A ponta de uma seta é para onde o brawler vai: nunca uma parede, e água só para quem a atravessa.
      const de = lerPonto(seta.de);
      const paraBruto = lerPonto(seta.para);
      const para = paraBruto && pontoLivre(terrenoAqui, paraBruto, { atravessaAgua: atravessaAgua(brawler) });
      if (!de || !para || Math.hypot(para.x - de.x, para.y - de.y) < 0.03) continue;
      const tipo = TIPOS_DE_SETA.some((item) => item.id === seta.tipo) ? (seta.tipo as TipoDeSeta) : "avanco";
      const notaDaSeta = texto(seta.nota, 50);
      setas.push({ id: `${prefixo}${setas.length + 1}`, de, para, tipo, ...(brawler ? { brawler } : {}), ...(notaDaSeta ? { nota: notaDaSeta } : {}) });
    }
    return setas;
  };

  const lerMarcadores = (lista: unknown, terrenoAqui: TerrenoDoMapa | null | undefined, prefixo: string) => {
    const marcadores: MarcadorDoPlano[] = [];
    for (const entrada of Array.isArray(lista) ? lista : []) {
      if (marcadores.length >= MAXIMO_DE_MARCADORES) break;
      const marcador = (entrada ?? {}) as Record<string, unknown>;
      const pontoBruto = lerPonto(marcador.ponto);
      const nota = texto(marcador.nota, 60);
      if (!pontoBruto || !nota) continue;
      const tipo = TIPOS_DE_MARCADOR.some((item) => item.id === marcador.tipo) ? (marcador.tipo as TipoDeMarcador) : "foco";
      const dono = porNome.get(normalizarNome(texto(marcador.brawler, 40)));
      // "Cobertura" e "partir paredes" apontam para uma parede, "atravessar água" para a água; o resto fica em chão livre.
      const ponto = tipo === "destruir" || tipo === "agua" || tipo === "cobertura" ? pontoBruto : pontoLivre(terrenoAqui, pontoBruto, { atravessaAgua: atravessaAgua(dono) });
      marcadores.push({ id: `${prefixo}${marcadores.length + 1}`, tipo, ponto, nota, ...(dono ? { brawler: dono } : {}) });
    }
    return marcadores;
  };

  const setas = lerSetas(resposta.setas, terreno, "ia-");
  const marcadores = lerMarcadores(resposta.marcadores, terreno, "ia-m");

  // O meio e o fim: posições novas (podem trocar de lane), setas, símbolos e
  // paredes partidas até esse momento. Uma parede só pode ser partida se existir.
  const momentos: TextoDoMomento[] = [];
  const quadros: NonNullable<PlanoDoGeneral["quadros"]> = {};
  let partidasAntes: CasaDoMapa[] = [];
  const brutos = Array.isArray(resposta.momentos) ? resposta.momentos : [];
  for (const { id: momento } of MOMENTOS) {
    const bruto = brutos.find((m) => (m as { momento?: unknown })?.momento === momento) as Record<string, unknown> | undefined;
    if (!bruto) continue;
    momentos.push({
      momento,
      quando: texto(bruto.quando, 20),
      resumo: texto(bruto.resumo, 110),
      seGanhar: texto(bruto.seGanhar, 80),
      sePerder: texto(bruto.sePerder, 80),
    });
    if (momento === "inicio") continue;
    const partidas = [...partidasAntes];
    for (const casaBruta of Array.isArray(bruto.paredesPartidas) ? bruto.paredesPartidas : []) {
      if (partidas.length >= MAXIMO_DE_PAREDES_PARTIDAS) break;
      const { col, linha } = (casaBruta ?? {}) as { col?: unknown; linha?: unknown };
      if (typeof col !== "number" || typeof linha !== "number") continue;
      const casa = { coluna: Math.round(col), linha: Math.round(linha) };
      if (!terreno || !bloqueiaPassagem(tipoDaCasa(terreno, casa.coluna, casa.linha))) continue;
      if (!partidas.some((p) => p.coluna === casa.coluna && p.linha === casa.linha)) partidas.push(casa);
    }
    partidasAntes = partidas;
    const terrenoAqui = terrenoDoMomento(terreno, partidas);
    const posicoesAqui = { ...(quadros.meio?.posicoes ?? posicoes) };
    for (const entrada of Array.isArray(bruto.posicoes) ? bruto.posicoes : []) {
      const item = (entrada ?? {}) as Record<string, unknown>;
      const nome = normalizarNome(texto(item.brawler, 40));
      const ponto = lerPonto(item.posicao);
      if (!ponto) continue;
      const nosso = porNome.get(nome), deles_ = porNomeDeles.get(nome);
      if (nosso) posicoesAqui[chaveDaFicha("nos", nosso)] = pontoLivre(terrenoAqui, ponto, { atravessaAgua: atravessaAgua(nosso) });
      else if (deles_) posicoesAqui[chaveDaFicha("eles", deles_)] = pontoLivre(terrenoAqui, ponto);
    }
    quadros[momento] = {
      posicoes: posicoesAqui,
      setas: lerSetas(bruto.setas, terrenoAqui, `ia-${momento}-`),
      marcadores: lerMarcadores(bruto.marcadores, terrenoAqui, `ia-${momento}-m`),
      paredesPartidas: partidas,
    };
  }

  // Ameaças: quem é perigoso para quem (lados opostos), e a exceção.
  const ameacas: AmeacaDoPlano[] = [];
  for (const entrada of Array.isArray(resposta.ameacas) ? resposta.ameacas : []) {
    if (ameacas.length >= MAXIMO_DE_AMEACAS) break;
    const item = (entrada ?? {}) as Record<string, unknown>;
    const perigosoBruto = normalizarNome(texto(item.perigoso, 40));
    const alvoBruto = normalizarNome(texto(item.alvo, 40));
    const perigosoDeles = porNomeDeles.get(perigosoBruto), perigosoNosso = porNome.get(perigosoBruto);
    const perigoso = perigosoDeles ?? perigosoNosso;
    const alvo = perigosoDeles ? porNome.get(alvoBruto) : porNomeDeles.get(alvoBruto);
    const textoDaAmeaca = texto(item.texto, 60);
    if (!perigoso || !alvo || !textoDaAmeaca) continue;
    const excecao = texto(item.excecao, 60);
    ameacas.push({
      id: `ia-a${ameacas.length + 1}`,
      perigoso,
      ladoDoPerigoso: perigosoDeles ? "eles" : "nos",
      alvo,
      texto: textoDaAmeaca,
      ...(naoSabe(excecao) ? {} : { excecao }),
    });
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
    ...(momentos.length ? { momentos } : {}),
    ...(Object.keys(quadros).length ? { quadros } : {}),
    ...(ameacas.length ? { ameacas } : {}),
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
      ? `GRELHA DO MAPA (${terreno.colunas}×${terreno.linhas}; "#" parede, "*" jarro/barril solto (bloqueia, mas parte-se com ataques normais: não é cobertura segura), '"' mato, "~" água, "o" objetivo/base, "." chão). Cada linha começa pelo seu número:\n${grelhaEmTexto(terreno)}`
      : "",
    "",
    listaDeBuilds(pedido, opcoes),
    "",
    "O JOGADOR VAI LER ISTO EM 20 SEGUNDOS, antes da partida começar. Escreve pouco: frases telegráficas, sem floreados, em português de Portugal. A explicação vai no MAPA (símbolos com nota), não em texto corrido.",
    "O QUE TENS DE ENTREGAR:",
    "1. resumo: 1 frase, no máximo 12 palavras. condicaoDeVitoria: no máximo 10 palavras.",
    "2. previsao: 2 ou 3 frases de no máximo 10 palavras: o que o adversário vai fazer (por onde entra, quem procura quem).",
    "3. inimigos: onde prevês cada adversário no INÍCIO, na primeira luta (uma casa por adversário).",
    "4. ordens, uma por brawler nosso:",
    "   - funcao: 2 ou 3 palavras (ex.: \"segura a zona\", \"emboscada no mato\")",
    "   - objetivo: no máximo 12 palavras, com um sítio concreto do mapa",
    "   - quandoAvancar: no máximo 8 palavras (ex.: \"quando o Ash gastar o super\")",
    "   - cuidados: 1 perigo, no máximo 8 palavras",
    "   - usarGadget: quando e como usar o gadget escolhido, numa situação concreta deste jogo, no máximo 10 palavras (ex.: \"no Ash quando saltar para a zona\"). Se não souberes, \"não sei\".",
    "   - posicao: casa no INÍCIO (primeira luta); chão ou mato. NUNCA parede nem jarro. Água (\"~\") só para quem atravessa água. Pode ser no meio do território inimigo, até junto da base deles, se a estratégia o pedir (roubar a zona, pressionar o spawn, flanquear).",
    "   - build: escolhe da LISTA acima (gadget, poderEstelar e até 2 engrenagens) os nomes EXATOS. Se a lista não tiver o brawler, escreve \"não sei\".",
    "   - capacidades: só as que tem de certeza: \"parte-paredes\", \"atravessa-agua\", \"salta-paredes\". Na dúvida, lista vazia.",
    "5. setas (3 a 7): movimentos-chave. \"avanco\", \"recuo\" ou \"rotacao\"; o \"de\" é a posição do brawler; indica o brawler; e uma nota de no máximo 5 palavras a dizer PORQUÊ (ex.: \"recua se perder o 1v1\", \"entra quando a zona abrir\"). A ponta NUNCA numa parede nem na água (\"~\"), salvo quem atravessa água.",
    "6. marcadores (5 a 10): a explicação no mapa. Cada um com nota de no máximo 5 palavras e, se for de um brawler, o nome dele. Tipos: \"ataque\", \"defesa\", \"controlo\" (segurar passagem), \"posicao\" (assumir posição), \"emboscada\" (esconder neste mato), \"flanco\", \"cobertura\" (usar ESTA parede para tapar tiros), \"gadget\" (usar o gadget AQUI; a nota diz a situação), \"destruir\" (partir estas paredes — só quem parte paredes), \"agua\" (atravessar aqui — só quem atravessa), \"abertura\" (corredor aberto), \"perigo\", \"foco\" (alvo prioritário).",
    "7. momentos: exatamente 3 — \"inicio\", \"meio\" e \"fim\" da partida. Cada um com: quando (ex.: \"0:00–0:40\"), resumo (no máximo 10 palavras), seGanhar (o que fazer se estivermos À FRENTE, no máximo 8 palavras, ex.: \"recua e guarda a vantagem\") e sePerder (se estivermos ATRÁS, no máximo 8 palavras, ex.: \"junta os três e força o flanco\"). No \"meio\" e no \"fim\" dá também um quadro novo: posicoes (os 6 brawlers, nossos e deles, onde estão nesse momento — PODES trocar os nossos de lane ou de função se isso for melhor), setas (2 a 5), marcadores (3 a 6) e paredesPartidas (as casas \"#\" ou \"*\" que já foram partidas até esse momento por quem parte paredes; lista vazia se ninguém parte). Prevê o que muda: paredes que caem, quem ganhou vantagem, zonas que abrem.",
    "8. ameacas (2 a 4): quem é perigoso para quem, de lados opostos, e a exceção. perigoso e alvo são nomes do draft; texto no máximo 8 palavras (ex.: \"não chegues perto: morres rápido\"); excecao: quando deixa de valer, no máximo 6 palavras (ex.: \"Pearl com pouca vida\"). Usa-as para avisar os NOSSOS do que os mata, e para mostrar os NOSSOS que são perigosos para eles.",
    "9. trilhos (passos fantasma): para 3 a 6 brawlers — nossos E adversários — o caminho que vão percorrer mais vezes durante a partida, com 3 a 5 casas por ordem (de onde partem até onde lutam). Sem atravessar paredes nem água (salvo quem atravessa água).",
    "",
    "PAREDES: antes de mandar partir uma parede, vê quem da NOSSA equipa precisa dela — quem lança por cima (Sprout, Barley, Dynamike, Tick, Grom, Larry & Lawrie, Willow…) e quem se esconde atrás dela. Não partas essas: parte as que protegem os atiradores DELES ou que tapam o caminho até eles. Diz no símbolo \"destruir\" QUAIS e PORQUÊ.",
    "",
    "USA O TERRENO, casa a casa, e diz isso nos símbolos e nas setas: paredes (\"#\") como cobertura contra atiradores; mato ('\"') para emboscada e para esconder quem é de perto; água (\"~\") como barreira que corta caminhos (e atalho para quem a atravessa); corredores abertos (muitos \".\") para quem tem alcance longo; passagens estreitas para controlar. Cada brawler deve ter pelo menos um símbolo ou seta ligado a um sítio concreto do mapa.",
    "",
    "Regras: usa só os brawlers indicados. \"~\" é água: ninguém anda nela, exceto quem atravessa água. Se não conheceres bem o kit de um brawler, NÃO inventes habilidades: fala da função e do alcance.",
  ].filter((parte, indice, todas) => parte !== "" || todas[indice - 1] !== "").join("\n");
}

const CASA = { type: "OBJECT", properties: { col: { type: "INTEGER" }, linha: { type: "INTEGER" } }, required: ["col", "linha"] } as const;

const SETAS = {
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
} as const;

const MARCADORES = {
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
} as const;

/** O formato que a IA tem de devolver (esquema de resposta da API Gemini). */
export const ESQUEMA_DO_PLANO = {
  type: "OBJECT",
  properties: {
    resumo: { type: "STRING" },
    condicaoDeVitoria: { type: "STRING" },
    previsao: { type: "ARRAY", items: { type: "STRING" } },
    inimigos: { type: "ARRAY", items: { type: "OBJECT", properties: { brawler: { type: "STRING" }, posicao: CASA }, required: ["brawler", "posicao"] } },
    momentos: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          momento: { type: "STRING", enum: ["inicio", "meio", "fim"] },
          quando: { type: "STRING" },
          resumo: { type: "STRING" },
          seGanhar: { type: "STRING" },
          sePerder: { type: "STRING" },
          posicoes: { type: "ARRAY", items: { type: "OBJECT", properties: { brawler: { type: "STRING" }, posicao: CASA }, required: ["brawler", "posicao"] } },
          setas: SETAS,
          marcadores: MARCADORES,
          paredesPartidas: { type: "ARRAY", items: CASA },
        },
        required: ["momento", "quando", "resumo", "seGanhar", "sePerder"],
      },
    },
    ameacas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { perigoso: { type: "STRING" }, alvo: { type: "STRING" }, texto: { type: "STRING" }, excecao: { type: "STRING" } },
        required: ["perigoso", "alvo", "texto"],
      },
    },
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
    setas: SETAS,
    trilhos: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { brawler: { type: "STRING" }, pontos: { type: "ARRAY", items: CASA } }, required: ["brawler", "pontos"] },
    },
    marcadores: MARCADORES,
  },
  required: ["resumo", "condicaoDeVitoria", "previsao", "momentos", "ordens", "setas", "marcadores"],
} as const;

/**
 * A mesma forma do esquema, escrita por extenso. Vai no fim do pedido quando
 * a Google falha com o formato estrito e se repete sem ele.
 */
export const FORMATO_DO_PLANO_EM_TEXTO = [
  "Responde só com um objeto JSON, sem texto antes nem depois, exatamente com estas chaves:",
  '{"resumo":"...","condicaoDeVitoria":"...","previsao":["..."],',
  '"inimigos":[{"brawler":"Nome","posicao":{"col":10,"linha":8}}],',
  '"momentos":[{"momento":"inicio","quando":"0:00–0:40","resumo":"...","seGanhar":"...","sePerder":"..."},',
  '{"momento":"meio","quando":"...","resumo":"...","seGanhar":"...","sePerder":"...","posicoes":[{"brawler":"Nome","posicao":{"col":10,"linha":16}}],"setas":[],"marcadores":[],"paredesPartidas":[{"col":9,"linha":15}]},',
  '{"momento":"fim","quando":"...","resumo":"...","seGanhar":"...","sePerder":"...","posicoes":[],"setas":[],"marcadores":[],"paredesPartidas":[]}],',
  '"ameacas":[{"perigoso":"Nome","alvo":"Nome","texto":"...","excecao":"..."}],',
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

function setasGuardadas(lista: unknown): SetaDoPlano[] {
  return (Array.isArray(lista) ? (lista as SetaDoPlano[]) : [])
    .filter((seta) => seta && typeof seta.de?.x === "number" && typeof seta.de?.y === "number" && typeof seta.para?.x === "number" && typeof seta.para?.y === "number" && TIPOS_DE_SETA.some((tipo) => tipo.id === seta.tipo))
    .map((seta) => ({ ...seta, nota: typeof seta.nota === "string" ? seta.nota.slice(0, 50) : undefined }))
    .slice(0, MAXIMO_DE_SETAS * 2);
}

function marcadoresGuardados(lista: unknown): MarcadorDoPlano[] {
  return (Array.isArray(lista) ? (lista as MarcadorDoPlano[]) : [])
    .filter((marcador) => marcador && typeof marcador.ponto?.x === "number" && typeof marcador.ponto?.y === "number" && TIPOS_DE_MARCADOR.some((tipo) => tipo.id === marcador.tipo))
    .slice(0, MAXIMO_DE_MARCADORES * 3);
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
    const setas = setasGuardadas(guardado.setas);
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
    const marcadores = marcadoresGuardados(guardado.marcadores);
    const quadros: NonNullable<PlanoDoGeneral["quadros"]> = {};
    for (const momento of ["meio", "fim"] as const) {
      const quadro = guardado.quadros?.[momento];
      if (!quadro || typeof quadro !== "object") continue;
      const posicoesDoQuadro = { ...posicoes };
      for (const chave of Object.keys(base.posicoes)) {
        const ponto = quadro.posicoes?.[chave];
        if (ponto && typeof ponto.x === "number" && typeof ponto.y === "number") posicoesDoQuadro[chave] = { x: limitarAoMapa(ponto.x), y: limitarAoMapa(ponto.y) };
      }
      quadros[momento] = {
        posicoes: posicoesDoQuadro,
        setas: setasGuardadas(quadro.setas),
        marcadores: marcadoresGuardados(quadro.marcadores),
        paredesPartidas: (Array.isArray(quadro.paredesPartidas) ? quadro.paredesPartidas : [])
          .filter((c) => c && Number.isInteger(c.coluna) && Number.isInteger(c.linha) && c.coluna >= 0 && c.coluna < COLUNAS_DO_MAPA && c.linha >= 0 && c.linha < LINHAS_DO_MAPA)
          .map((c) => ({ coluna: c.coluna, linha: c.linha }))
          .slice(0, MAXIMO_DE_PAREDES_PARTIDAS),
      };
    }
    const textoCurto = (valor: unknown, maximo: number) => (typeof valor === "string" ? valor.slice(0, maximo) : "");
    const momentos = (Array.isArray(guardado.momentos) ? guardado.momentos : [])
      .filter((m) => m && MOMENTOS.some((item) => item.id === m.momento))
      .map((m) => ({ momento: m.momento, quando: textoCurto(m.quando, 20), resumo: textoCurto(m.resumo, 110), seGanhar: textoCurto(m.seGanhar, 80), sePerder: textoCurto(m.sePerder, 80) }))
      .slice(0, 3);
    const ameacas = (Array.isArray(guardado.ameacas) ? guardado.ameacas : [])
      .filter((a) => a && nomesDoDraft.has(a.perigoso) && nomesDoDraft.has(a.alvo) && (a.ladoDoPerigoso === "nos" || a.ladoDoPerigoso === "eles") && typeof a.texto === "string")
      .map((a) => ({ id: textoCurto(a.id, 20) || "a", perigoso: a.perigoso, ladoDoPerigoso: a.ladoDoPerigoso, alvo: a.alvo, texto: a.texto.slice(0, 60), ...(typeof a.excecao === "string" && a.excecao ? { excecao: a.excecao.slice(0, 60) } : {}) }))
      .slice(0, MAXIMO_DE_AMEACAS);
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
      ...(momentos.length ? { momentos } : {}),
      ...(Object.keys(quadros).length ? { quadros } : {}),
      ...(ameacas.length ? { ameacas } : {}),
      fontes: Array.isArray(guardado.fontes)
        ? guardado.fontes.filter((f) => f && typeof f.titulo === "string" && typeof f.url === "string" && /^https:\/\//.test(f.url)).slice(0, 8)
        : undefined,
    };
  } catch {
    return base;
  }
}
