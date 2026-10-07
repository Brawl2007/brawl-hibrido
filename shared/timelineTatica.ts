/**
 * A estratégia tática em passos: o que o motor 3D mostra ao carregar em
 * «Simular estratégia».
 *
 * O Jev decide (lanes, confrontos, abertura, rotação, alvo, condições); aqui
 * só se traduz cada decisão em posições, setas, símbolos, ataques e câmara,
 * passo a passo. Funções puras: a mesma estratégia dá sempre a mesma
 * timeline, e o leitor (tocar, pausar, reiniciar, velocidade) é um redutor
 * que se testa sem ecrã.
 *
 * O QUE NÃO SE INVENTA
 *
 * Os ataques são representações táticas genéricas (um tiro, uma área, um
 * dash), não as habilidades de cada brawler: o site não tem os dados de cada
 * animação. O dash só aparece em quem é Assassino ou Tank, pela classe que o
 * Draft já usa.
 */
import { getBrawlerClass } from "./draft";
import { ABERTURAS, ESTILOS, NOME_DA_LANE, PLANOS, RESPOSTAS_AO_RECUO, RESPOSTAS_A_VANTAGEM, ROTACOES, nomeDe, type AcaoDaTimeline, type EstrategiaTatica, type Lane } from "./estrategiaTatica";
import { chaveDaFicha, limitarAoMapa, type MarcadorDoPlano, type PontoNoMapa, type SetaDoPlano, type TipoDeMarcador, type TipoDeSeta } from "./quadroDoGeneral";
import { caminhoLivre, centroDaCasa, pontoLivre, tipoDaCasa, type TerrenoDoMapa } from "./terrenoDoMapa";

export type EfeitoDaTimeline = { id: string; tipo: "ataque" | "super" | "dash"; de: string; para: string };
export type AcaoNaTimeline = { brawler: string; lado: "nos" | "eles"; acao: AcaoDaTimeline; alvo?: string; destino?: PontoNoMapa; motivo: string };
export type FaseDaTimeline = "posicoes" | "abertura" | "confrontos" | "ameaca" | "rotacao" | "perde-esquerda" | "vantagem" | "fim";

export type PassoDaTimeline = {
  id: string;
  fase: FaseDaTimeline;
  inicioS: number;
  fimS: number;
  titulo: string;
  legenda: string;
  acoes: AcaoNaTimeline[];
  /** Onde cada ficha está no fim deste passo (chave `chaveDaFicha`). */
  posicoes: Record<string, PontoNoMapa>;
  setas: SetaDoPlano[];
  marcadores: MarcadorDoPlano[];
  efeitos: EfeitoDaTimeline[];
  /** Os pontos que a câmara enquadra; vazio é a visão geral. */
  camara: PontoNoMapa[];
  /** As fichas em destaque (o brawler ativo). */
  destaque: string[];
  /** As fichas que chegam em dash (movimento rápido). */
  rapidos: string[];
};
export type TimelineTatica = { passos: PassoDaTimeline[]; duracaoS: number };

const X_DA_LANE: Record<Lane, number> = { esquerda: 0.2, mid: 0.5, direita: 0.8 };
const Y_INICIAL = { nos: 0.84, eles: 0.16 } as const;
/** Quanto dura cada passo a 1×, em segundos. */
const DURACOES: Record<FaseDaTimeline, number> = { posicoes: 3, abertura: 2.5, confrontos: 2.5, ameaca: 2.5, rotacao: 2.5, "perde-esquerda": 2, vantagem: 2.5, fim: 2.5 };

type Contexto = { terreno?: TerrenoDoMapa | null; modoId?: string; classeDe?: (brawler: string) => string };

/** Onde fica o objetivo do modo: a casa "objetivo" mais perto do sítio onde o modo se joga. */
export function pontoDoObjetivo(terreno: TerrenoDoMapa | null | undefined, modoId?: string): PontoNoMapa {
  const referencia = modoId === "heist" ? { x: 0.5, y: 0.1 } : { x: 0.5, y: 0.5 };
  if (!terreno) return referencia;
  let melhor: PontoNoMapa | null = null;
  let distancia = Infinity;
  for (let linha = 0; linha < terreno.linhas; linha++) {
    for (let coluna = 0; coluna < terreno.colunas; coluna++) {
      if (tipoDaCasa(terreno, coluna, linha) !== "objetivo") continue;
      const centro = centroDaCasa(terreno, coluna, linha);
      const d = Math.hypot(centro.x - referencia.x, centro.y - referencia.y);
      if (d < distancia) { distancia = d; melhor = centro; }
    }
  }
  return melhor ?? referencia;
}

export function montarTimeline(estrategia: EstrategiaTatica, contexto: Contexto = {}): TimelineTatica {
  const { terreno = null, modoId } = contexto;
  const classeDe = contexto.classeDe ?? getBrawlerClass;
  const livre = (x: number, y: number) => pontoLivre(terreno, { x: limitarAoMapa(x), y: limitarAoMapa(y) });
  const nos = (brawler: string) => chaveDaFicha("nos", brawler);
  const eles = (brawler: string) => chaveDaFicha("eles", brawler);
  const faz = (brawler: string) => ["Assassino", "Tank"].includes(classeDe(brawler));
  const confrontoDe = (nosso: string) => estrategia.confrontos.find((c) => c.nosso === nosso)!;
  const confrontoContra = (deles: string) => estrategia.confrontos.find((c) => c.deles === deles)!;
  const nossos = [estrategia.lanes.esquerda, estrategia.lanes.mid, estrategia.lanes.direita];

  const passos: PassoDaTimeline[] = [];
  let posicoes: Record<string, PontoNoMapa> = {};
  let relogio = 0;
  let contador = 0;
  const id = (prefixo: string) => `${prefixo}${++contador}`;

  const seta = (brawler: string, de: PontoNoMapa, para: PontoNoMapa, tipo: TipoDeSeta, nota: string): SetaDoPlano | null => {
    if (Math.hypot(para.x - de.x, para.y - de.y) < 0.03) return null;
    const rota = caminhoLivre(terreno, de, para) ?? [de, para];
    const caminho = rota.slice(1, -1).slice(0, 10);
    return { id: id("t-s"), de: rota[0], para: rota[rota.length - 1], tipo, brawler, nota, ...(caminho.length ? { caminho } : {}) };
  };
  const marcador = (tipo: TipoDeMarcador, ponto: PontoNoMapa, nota: string, brawler?: string): MarcadorDoPlano => ({ id: id("t-m"), tipo, ponto, nota, ...(brawler ? { brawler } : {}) });
  const efeito = (tipo: EfeitoDaTimeline["tipo"], de: string, para: string): EfeitoDaTimeline => ({ id: id("t-e"), tipo, de, para });

  const passo = (fase: FaseDaTimeline, titulo: string, legenda: string, mudar: (p: PassoDaTimeline) => void) => {
    const novo: PassoDaTimeline = {
      id: `passo-${passos.length}`,
      fase,
      inicioS: relogio,
      fimS: relogio + DURACOES[fase],
      titulo,
      legenda,
      acoes: [],
      posicoes: { ...posicoes },
      setas: [],
      marcadores: [],
      efeitos: [],
      camara: [],
      destaque: [],
      rapidos: [],
    };
    mudar(novo);
    posicoes = novo.posicoes;
    relogio = novo.fimS;
    passos.push(novo);
  };
  /** Move uma ficha nesta etapa: nova posição, seta (nossos) e a ação. */
  const mover = (p: PassoDaTimeline, lado: "nos" | "eles", brawler: string, para: PontoNoMapa, acao: AcaoDaTimeline, motivo: string, tipoDeSeta?: TipoDeSeta) => {
    const chave = lado === "nos" ? nos(brawler) : eles(brawler);
    const de = p.posicoes[chave];
    p.posicoes[chave] = para;
    p.acoes.push({ brawler, lado, acao, destino: para, motivo });
    if (tipoDeSeta && de) {
      const s = seta(brawler, de, para, tipoDeSeta, motivo.slice(0, 50));
      if (s) p.setas.push(s);
    }
  };

  /* 0 · Posições: cada um na sua lane, cada adversário à frente de quem o enfrenta. */
  passo("posicoes", "Posições", `Plano ${estrategia.plano}: ${nomeDe(PLANOS, estrategia.plano)} · ${nomeDe(ESTILOS, estrategia.estilo)}`, (p) => {
    for (const lane of ["esquerda", "mid", "direita"] as const) {
      const nosso = estrategia.lanes[lane];
      const deles = confrontoDe(nosso).deles;
      p.posicoes[nos(nosso)] = livre(X_DA_LANE[lane], Y_INICIAL.nos);
      p.posicoes[eles(deles)] = livre(X_DA_LANE[lane], Y_INICIAL.eles);
      p.acoes.push({ brawler: nosso, lado: "nos", acao: "mover", destino: p.posicoes[nos(nosso)], motivo: `${NOME_DA_LANE[lane]}` });
    }
  });

  /* 1 · Abertura. */
  const laneDaAbertura: Lane | null = estrategia.abertura === "esquerda" ? "esquerda" : estrategia.abertura === "direita" ? "direita" : estrategia.abertura === "centro" ? "mid" : null;
  passo("abertura", "Abertura", nomeDe(ABERTURAS, estrategia.abertura), (p) => {
    for (const lane of ["esquerda", "mid", "direita"] as const) {
      const nosso = estrategia.lanes[lane];
      const abre = laneDaAbertura === lane;
      const apoia = laneDaAbertura && laneDaAbertura !== "mid" && lane === "mid";
      const x = apoia ? (X_DA_LANE.mid + X_DA_LANE[laneDaAbertura!]) / 2 : X_DA_LANE[lane];
      const y = laneDaAbertura === null ? 0.66 : abre ? 0.58 : apoia ? 0.64 : 0.72;
      mover(p, "nos", nosso, livre(x, y), abre ? "avancar" : apoia ? "cobrir" : "mover", abre ? "abre a partida" : apoia ? "apoia a abertura" : "segura a lane", abre || apoia ? "avanco" : undefined);
      if (abre) { p.destaque.push(nos(nosso)); p.camara.push(p.posicoes[nos(nosso)]); }
      const deles = confrontoDe(nosso).deles;
      const pd = p.posicoes[eles(deles)];
      mover(p, "eles", deles, livre(pd.x, 0.3), "avancar", "sobe na lane");
      if (abre) p.camara.push(p.posicoes[eles(deles)]);
    }
  });

  /* 2 · Confrontos: o que cada um faz contra o seu adversário. */
  const importante = confrontoContra(estrategia.alvoPrioritario);
  passo("confrontos", "Confrontos", estrategia.confrontos.map((c) => `${c.nosso} ${c.acao === "enfrentar" ? "enfrenta" : c.acao === "evitar" ? "evita" : c.acao === "segurar" ? "segura" : "pressiona"} ${c.deles}`).join(" · "), (p) => {
    for (const c of estrategia.confrontos) {
      const pd = p.posicoes[eles(c.deles)];
      const pn = p.posicoes[nos(c.nosso)];
      if (c.acao === "enfrentar") {
        const rapido = faz(c.nosso);
        mover(p, "nos", c.nosso, livre(pd.x, pd.y + 0.12), rapido ? "dash" : "atacar", `enfrenta ${c.deles}`, "avanco");
        p.efeitos.push(efeito(rapido ? "dash" : "ataque", nos(c.nosso), eles(c.deles)), efeito("ataque", eles(c.deles), nos(c.nosso)));
        if (rapido) p.rapidos.push(nos(c.nosso));
      } else if (c.acao === "pressionar") {
        mover(p, "nos", c.nosso, livre(pn.x, Math.max(pd.y + 0.24, pn.y - 0.08)), "pressionar", `dano de longe em ${c.deles}`, "avanco");
        p.efeitos.push(efeito("ataque", nos(c.nosso), eles(c.deles)));
      } else if (c.acao === "segurar") {
        p.acoes.push({ brawler: c.nosso, lado: "nos", acao: "segurar", motivo: `não deixa ${c.deles} passar` });
        p.marcadores.push(marcador("defesa", pn, `segura contra ${c.deles}`.slice(0, 60), c.nosso));
      } else {
        mover(p, "nos", c.nosso, livre(pn.x, Math.min(0.8, pn.y + 0.1)), "recuar", `evita ${c.deles}`, "recuo");
        mover(p, "eles", c.deles, livre(pd.x, pd.y + 0.08), "avancar", "ganha espaço");
      }
    }
    p.destaque.push(nos(importante.nosso));
    p.camara.push(p.posicoes[nos(importante.nosso)], p.posicoes[eles(importante.deles)]);
  });

  /* 3 · A maior ameaça avança; quem ajuda. */
  const ameaca = estrategia.maiorAmeaca;
  const ajuda = estrategia.condicoes.ameacaAvanca;
  passo("ameaca", `Se ${ameaca} avançar`, `${ajuda} ajuda · alvo prioritário: ${estrategia.alvoPrioritario}`, (p) => {
    const vitima = confrontoContra(ameaca).nosso;
    const pv = p.posicoes[nos(vitima)];
    const rapido = faz(ameaca);
    mover(p, "eles", ameaca, livre(pv.x, pv.y - 0.08), rapido ? "dash" : "avancar", `entra em ${vitima}`);
    if (rapido) p.rapidos.push(eles(ameaca));
    p.efeitos.push(efeito(rapido ? "dash" : "ataque", eles(ameaca), nos(vitima)));
    const pa = p.posicoes[eles(ameaca)];
    if (ajuda !== vitima) {
      const ph = p.posicoes[nos(ajuda)];
      mover(p, "nos", ajuda, livre((ph.x + pa.x) / 2, (ph.y + pa.y) / 2 + 0.06), "rodar", `ajuda ${vitima}`, "rotacao");
    }
    p.efeitos.push(efeito("super", nos(ajuda), eles(ameaca)));
    p.marcadores.push(marcador("perigo", pa, "maior ameaça", undefined));
    p.marcadores.push(marcador("foco", p.posicoes[eles(estrategia.alvoPrioritario)], "alvo prioritário"));
    p.destaque.push(nos(ajuda));
    p.camara.push(pa, p.posicoes[nos(ajuda)]);
  });

  /* 4 · Rotação. */
  passo("rotacao", "Rotação", nomeDe(ROTACOES, estrategia.rotacao), (p) => {
    const aqui = (brawler: string) => p.posicoes[nos(brawler)];
    const { esquerda, mid, direita } = estrategia.lanes;
    const rodar = (brawler: string, para: PontoNoMapa, motivo: string) => {
      const de = aqui(brawler);
      mover(p, "nos", brawler, para, "rodar", motivo, "rotacao");
      p.destaque.push(nos(brawler));
      p.camara.push(de, para);
    };
    switch (estrategia.rotacao) {
      case "manter":
        for (const nosso of nossos) p.marcadores.push(marcador("controlo", aqui(nosso), "mantém a lane", nosso));
        break;
      case "trocar-com-mid": {
        const fraca = estrategia.confrontos.find((c) => c.lane !== "mid" && c.acao === "evitar")?.nosso ?? esquerda;
        const pm = aqui(mid), pf = aqui(fraca);
        rodar(mid, pf, `troca com ${fraca}`);
        rodar(fraca, pm, `troca com ${mid}`);
        break;
      }
      case "esquerda-centro": rodar(esquerda, livre(0.4, aqui(esquerda).y - 0.04), "fecha para o meio"); break;
      case "direita-centro": rodar(direita, livre(0.6, aqui(direita).y - 0.04), "fecha para o meio"); break;
      case "centro-esquerda": rodar(mid, livre(0.28, aqui(esquerda).y + 0.04), `ajuda ${esquerda}`); break;
      case "centro-direita": rodar(mid, livre(0.72, aqui(direita).y + 0.04), `ajuda ${direita}`); break;
      case "recuar":
        for (const nosso of nossos) mover(p, "nos", nosso, livre(aqui(nosso).x, Math.min(0.84, aqui(nosso).y + 0.12)), "recuar", "reagrupa atrás", "recuo");
        break;
      case "avancar":
        for (const nosso of nossos) mover(p, "nos", nosso, livre(aqui(nosso).x, aqui(nosso).y - 0.1), "avancar", "sobe junto", "avanco");
        break;
    }
  });

  /* 5 · Se perdermos a lane esquerda. */
  const roda = estrategia.condicoes.perdeEsquerda;
  passo("perde-esquerda", "Se perdermos a esquerda", roda === "recuar" ? "A equipa recua e reagrupa" : `${roda} roda para a esquerda`, (p) => {
    const pe = p.posicoes[nos(estrategia.lanes.esquerda)];
    if (roda === "recuar") {
      for (const nosso of nossos) mover(p, "nos", nosso, livre(p.posicoes[nos(nosso)].x, Math.min(0.84, p.posicoes[nos(nosso)].y + 0.1)), "recuar", "perdemos a esquerda", "recuo");
    } else {
      const de = p.posicoes[nos(roda)];
      mover(p, "nos", roda, livre((pe.x + X_DA_LANE.esquerda) / 2 + 0.06, pe.y + 0.04), "rodar", "tapa a esquerda", "rotacao");
      p.destaque.push(nos(roda));
      p.camara.push(de, p.posicoes[nos(roda)]);
    }
    p.marcadores.push(marcador("perigo", pe, "lane esquerda caiu"));
  });

  /* 6 · Se ganharmos vantagem (e se eles recuarem). */
  const objetivo = pontoDoObjetivo(terreno, modoId);
  passo("vantagem", "Se ganharmos vantagem", `${nomeDe(RESPOSTAS_A_VANTAGEM, estrategia.condicoes.ganhaVantagem)} · se recuarem: ${nomeDe(RESPOSTAS_AO_RECUO, estrategia.condicoes.inimigoRecua).toLowerCase()}`, (p) => {
    const alvo = estrategia.alvoPrioritario;
    const quemMata = confrontoContra(alvo).nosso;
    if (estrategia.condicoes.ganhaVantagem === "pressionar") {
      for (const nosso of nossos) mover(p, "nos", nosso, livre(p.posicoes[nos(nosso)].x, Math.max(0.4, p.posicoes[nos(nosso)].y - 0.12)), "pressionar", "aproveita a vantagem", "avanco");
    } else {
      for (const nosso of nossos) p.marcadores.push(marcador("defesa", p.posicoes[nos(nosso)], "guarda a vantagem", nosso));
    }
    if (estrategia.condicoes.inimigoRecua === "objetivo") p.marcadores.push(marcador("controlo", objetivo, "objetivo do modo"));
    if (estrategia.condicoes.inimigoRecua === "avancar") p.marcadores.push(marcador("abertura", livre(0.5, 0.3), "sobe atrás deles"));
    p.efeitos.push(efeito("super", nos(quemMata), eles(alvo)));
    p.marcadores.push(marcador("foco", p.posicoes[eles(alvo)], "alvo prioritário"));
    p.destaque.push(nos(quemMata));
    p.camara.push(p.posicoes[nos(quemMata)], p.posicoes[eles(alvo)], ...(estrategia.condicoes.inimigoRecua === "objetivo" ? [objetivo] : []));
  });

  /* 7 · Fim: a condição de vitória e o plano de recurso. */
  passo("fim", "Condição de vitória", `${estrategia.condicaoDeVitoria}${estrategia.planoDeRecurso !== estrategia.plano ? ` Plano de recurso: ${estrategia.planoDeRecurso} (${nomeDe(PLANOS, estrategia.planoDeRecurso)}).` : ""}`, (p) => {
    p.marcadores.push(marcador("controlo", objetivo, "objetivo"));
  });

  return { passos, duracaoS: relogio };
}

/* ---------------------------------------------------------------------------
 * O leitor: tocar, pausar, reiniciar, velocidade. Um redutor puro.
 * ------------------------------------------------------------------------- */
export const VELOCIDADES = [0.5, 1, 1.5, 2] as const;
export type Velocidade = (typeof VELOCIDADES)[number];
export type EstadoDoLeitor = { tocando: boolean; tempoS: number; velocidade: Velocidade; terminou: boolean };
export type ComandoDoLeitor =
  | { tipo: "tocar" }
  | { tipo: "pausar" }
  | { tipo: "reiniciar" }
  | { tipo: "velocidade"; valor: Velocidade }
  | { tipo: "avancar"; dtS: number; duracaoS: number };

export const leitorParado = (velocidade: Velocidade = 1): EstadoDoLeitor => ({ tocando: false, tempoS: 0, velocidade, terminou: false });

export function comandarLeitor(estado: EstadoDoLeitor, comando: ComandoDoLeitor): EstadoDoLeitor {
  switch (comando.tipo) {
    case "tocar":
      // Tocar depois do fim recomeça do princípio.
      return estado.terminou ? { ...estado, tocando: true, tempoS: 0, terminou: false } : { ...estado, tocando: true };
    case "pausar":
      return { ...estado, tocando: false };
    case "reiniciar":
      return { ...estado, tocando: true, tempoS: 0, terminou: false };
    case "velocidade":
      return VELOCIDADES.includes(comando.valor) ? { ...estado, velocidade: comando.valor } : estado;
    case "avancar": {
      if (!estado.tocando || !(comando.dtS > 0)) return estado;
      // Um separador escondido pode devolver um salto enorme: nunca mais de meio segundo de cada vez.
      const tempoS = estado.tempoS + Math.min(0.5, comando.dtS) * estado.velocidade;
      return tempoS >= comando.duracaoS ? { ...estado, tempoS: comando.duracaoS, tocando: false, terminou: true } : { ...estado, tempoS };
    }
  }
}

/** O passo que está no ecrã num instante. */
export function passoNoInstante(timeline: TimelineTatica, tempoS: number) {
  let indice = 0;
  for (let i = 0; i < timeline.passos.length; i++) if (timeline.passos[i].inicioS <= tempoS + 1e-9) indice = i;
  return indice;
}
