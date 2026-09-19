import { describe, expect, it } from "vitest";
import {
  STAR_PLAYER_HYBRID_WEIGHT,
  aggregatePublishedStarPlayerRate,
  calculateHybridScoreForWinRateWeight,
  calculateHybridScoresByMap,
} from "@shared/hybridScore";
import {
  hybridWeightFractions,
  officialHybridWeights,
  readHybridWeights,
  writeHybridWeights,
  type HybridWeightsPreference,
} from "../client/src/lib/hybridWeights";

/**
 * O Star Player como terceira métrica opcional do Score Híbrido.
 *
 * O QUE ESTES TESTES PROTEGEM
 *
 * Uma métrica nova a entrar na fórmula principal tem duas formas de correr
 * mal, e nenhuma delas dá erro:
 *
 *  1. Ligada, não fazer o que a percentagem diz. Escolher 50/30/20 e receber
 *     outra divisão qualquer é pior do que não ter a opção — a pessoa ajusta
 *     os números e o site finge que a obedeceu.
 *  2. Desligada, não deixar tudo como estava. Se o simples acrescento mexer
 *     um milésimo no Score de quem nunca ligou o interruptor, a fórmula
 *     publicada no site passa a ser mentira para toda a gente.
 *
 * O terceiro risco é o valor em falta. Na snapshot de produção de 19/09/2026,
 * 55 das 2808 linhas não têm Star Player publicado, e são quase todas de
 * brawlers acabados de sair (Cosmo, Vince, Bolt, Glowy, Najia). Multiplicar
 * um valor ausente por zero apagava-os do ranking assim que alguém ligasse a
 * opção, e pareceria avaria do site em vez de lacuna da fonte.
 */

/** Uma linha do mapa, com as três métricas que a fórmula lê. */
function linha(brawler: string, tb: number, bp: number, uso: number, star: number | null) {
  return {
    map: "Gem Fort",
    brawler,
    topBrawlWinRate: tb,
    brawlPlanetWinRate: bp,
    topBrawlUseRate: uso,
    brawlPlanetPickRate: uso,
    brawlPlanetStarPlayer: star,
  };
}

/**
 * Quatro brawlers escolhidos para separar as métricas.
 *
 * O "Carregador" ganha pouco mas é eleito muito; o "Apoio" é o inverso. É
 * exatamente essa a diferença que o Star Player existe para captar, e se a
 * fórmula estiver errada estes dois trocam de lugar sem ninguém dar por isso.
 */
const MAPA = [
  linha("Carregador", 50, 50, 10, 30),
  linha("Apoio", 53, 53, 10, 10),
  linha("Popular", 50, 50, 20, 20),
  linha("Fraco", 45, 45, 5, 5),
];

const scoreDe = (linhas: ReturnType<typeof calculateHybridScoresByMap>, brawler: string) =>
  linhas.find((row) => row.brawler === brawler)?.score ?? null;

function pesos(over: Partial<HybridWeightsPreference>): HybridWeightsPreference {
  return { ...officialHybridWeights, ...over };
}

describe("Star Player no Score Híbrido", () => {
  it("entra desligado: a fatia oficial é zero", () => {
    expect(STAR_PLAYER_HYBRID_WEIGHT).toBe(0);
    expect(officialHybridWeights.starPlayerEnabled).toBe(false);
  });

  it("desligado, o Score é IDÊNTICO ao de antes — não aproximado", () => {
    const antes = calculateHybridScoresByMap(MAPA, 0.7, 0.5);
    const depois = calculateHybridScoresByMap(MAPA, 0.7, 0.5, 0);
    expect(depois.map((row) => row.score)).toEqual(antes.map((row) => row.score));
    expect(depois.map((row) => row.tier)).toEqual(antes.map((row) => row.tier));
  });

  it("a divisão pedida na interface é a que sai na conta: 50% Vitória + 30% Star Player + 20% Uso", () => {
    const { winRateWeight, starPlayerWeight } = hybridWeightFractions(pesos({ winRate: 50, usageRate: 20, starPlayer: 30, starPlayerEnabled: true }));
    // 100 de vitória, 0 de uso, 0 de Star Player tem de dar exatamente 50.
    expect(calculateHybridScoreForWinRateWeight(100, 0, winRateWeight, 0, starPlayerWeight)).toBeCloseTo(50, 10);
    // 0, 0, 100 tem de dar exatamente 30.
    expect(calculateHybridScoreForWinRateWeight(0, 0, winRateWeight, 100, starPlayerWeight)).toBeCloseTo(30, 10);
    // 0, 100, 0 tem de dar exatamente 20.
    expect(calculateHybridScoreForWinRateWeight(0, 100, winRateWeight, 0, starPlayerWeight)).toBeCloseTo(20, 10);
  });

  it("a soma das três fatias é sempre 100% do Score", () => {
    for (const [win, star] of [[50, 30], [70, 30], [0, 100], [90, 10], [33, 33]]) {
      const { winRateWeight, starPlayerWeight } = hybridWeightFractions(
        pesos({ winRate: win, usageRate: 100 - win - star, starPlayer: star, starPlayerEnabled: true }),
      );
      expect(calculateHybridScoreForWinRateWeight(100, 100, winRateWeight, 100, starPlayerWeight)).toBeCloseTo(100, 10);
    }
  });

  it("ligado, muda a ordem: o carregador passa à frente de quem só ganha", () => {
    const { winRateWeight, starPlayerWeight } = hybridWeightFractions(pesos({ winRate: 50, usageRate: 20, starPlayer: 30, starPlayerEnabled: true }));
    const desligado = calculateHybridScoresByMap(MAPA, 0.7, 0.5, 0);
    const ligado = calculateHybridScoresByMap(MAPA, winRateWeight, 0.5, starPlayerWeight);

    /*
     * As contas, para o dia em que alguém mexer nos números da fixture.
     *
     * Normalizado no mapa: Carregador tem 62,5 de vitória, 33,3 de uso e 100
     * de Star Player; o Apoio tem 100, 33,3 e 20.
     *
     *   70/30  →  Carregador 0,70×62,5 + 0,30×33,3 = 53,75
     *             Apoio      0,70×100  + 0,30×33,3 = 80,00   ← o Apoio ganha
     *   50/30/20 → Carregador 0,50×62,5 + 0,30×100 + 0,20×33,3 = 67,92
     *              Apoio      0,50×100  + 0,30×20  + 0,20×33,3 = 62,67  ← troca
     *
     * A primeira versão deste teste tinha o Apoio a 60% de vitória e falhava:
     * 66,7 pontos de vantagem na vitória a 50% valem 33,3, e 80 pontos de
     * vantagem no Star Player a 30% valem 24. A troca não acontecia — e ainda
     * bem, porque isso é a fórmula a funcionar. Foi a fixture que mudou, não o
     * cálculo: com 53% a vantagem de vitória encolhe para 37,5 pontos e o Star
     * Player passa a chegar para virar a ordem.
     */
    // Sem Star Player, o Apoio ganha ao Carregador por ter mais taxa de vitória.
    expect(scoreDe(desligado, "Apoio")!).toBeGreaterThan(scoreDe(desligado, "Carregador")!);
    // Com 30% de Star Player, o Carregador passa à frente.
    expect(scoreDe(ligado, "Carregador")!).toBeGreaterThan(scoreDe(ligado, "Apoio")!);
  });

  it("quem não tem Star Player publicado NÃO é penalizado: é pontuado como se estivesse desligado", () => {
    const semStar = [...MAPA, linha("Recem-chegado", 60, 60, 10, null)];
    const { winRateWeight, starPlayerWeight } = hybridWeightFractions(pesos({ winRate: 50, usageRate: 20, starPlayer: 30, starPlayerEnabled: true }));

    const ligado = calculateHybridScoresByMap(semStar, winRateWeight, 0.5, starPlayerWeight);
    const desligado = calculateHybridScoresByMap(semStar, winRateWeight, 0.5, 0);

    // Tem Score: não desapareceu do ranking.
    expect(scoreDe(ligado, "Recem-chegado")).not.toBeNull();
    // E é exatamente o mesmo que teria com a opção desligada: a fatia do Star
    // Player voltou para a vitória e o uso, na proporção que já tinham.
    expect(scoreDe(ligado, "Recem-chegado")).toBeCloseTo(scoreDe(desligado, "Recem-chegado")!, 10);
    // O Apoio tem os mesmos números de vitória e uso, mas TEM Star Player (baixo):
    // é por isso que fica abaixo. A diferença vem do dado, não da ausência dele.
    expect(scoreDe(ligado, "Apoio")!).toBeLessThan(scoreDe(ligado, "Recem-chegado")!);
  });

  it("o Star Player é normalizado no mapa, como a vitória e o uso", () => {
    // O mesmo brawler, com a mesma taxa bruta de Star Player, em dois mapas
    // com escalas diferentes. Se não houvesse normalização local, o Score
    // dele seria igual nos dois — e seria errado nos dois.
    const mapaBaixo = [
      { ...linha("Alvo", 50, 50, 10, 20), map: "Mapa Baixo" },
      { ...linha("Outro", 50, 50, 10, 5), map: "Mapa Baixo" },
    ];
    const mapaAlto = [
      { ...linha("Alvo", 50, 50, 10, 20), map: "Mapa Alto" },
      { ...linha("Outro", 50, 50, 10, 40), map: "Mapa Alto" },
    ];
    const { winRateWeight, starPlayerWeight } = hybridWeightFractions(pesos({ winRate: 50, usageRate: 20, starPlayer: 30, starPlayerEnabled: true }));
    const juntos = calculateHybridScoresByMap([...mapaBaixo, ...mapaAlto], winRateWeight, 0.5, starPlayerWeight);

    const noBaixo = juntos.find((row) => row.brawler === "Alvo" && row.map === "Mapa Baixo")!.score!;
    const noAlto = juntos.find((row) => row.brawler === "Alvo" && row.map === "Mapa Alto")!.score!;
    // 20% é o topo do mapa baixo e o fundo do mapa alto: 30 pontos de diferença.
    expect(noBaixo - noAlto).toBeCloseTo(30, 6);
  });

  it("um peso inválido vale zero em vez de contaminar o Score inteiro com NaN", () => {
    for (const invalido of [Number.NaN, Infinity, -1, 5]) {
      const resultado = calculateHybridScoreForWinRateWeight(80, 40, 0.7, 60, invalido);
      expect(Number.isFinite(resultado!)).toBe(true);
    }
    // NaN cai em zero, ou seja, na fórmula de sempre.
    expect(calculateHybridScoreForWinRateWeight(80, 40, 0.7, 60, Number.NaN))
      .toBeCloseTo(calculateHybridScoreForWinRateWeight(80, 40, 0.7), 10);
  });

  it("o agregador lê só o Brawl Planet, porque o TopBrawl não publica Star Player", () => {
    expect(aggregatePublishedStarPlayerRate({ map: "Gem Fort", brawlPlanetStarPlayer: 24.5 })).toBe(24.5);
    expect(aggregatePublishedStarPlayerRate({ map: "Gem Fort" })).toBeNull();
    expect(aggregatePublishedStarPlayerRate({ map: "Gem Fort", brawlPlanetStarPlayer: null })).toBeNull();
  });
});

/**
 * Um `localStorage` mínimo, para os testes do interruptor correrem sem
 * navegador. Guarda o que lhe dão e devolve o que guardou — é tudo o que
 * `readHybridWeights` e `writeHybridWeights` lhe pedem.
 */
function comArmazenamentoLocal(corpo: () => void) {
  const dados = new Map<string, string>();
  const anterior = globalThis.window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (chave: string) => dados.get(chave) ?? null,
      setItem: (chave: string, valor: string) => void dados.set(chave, valor),
    },
    dispatchEvent: () => true,
  };
  (globalThis as { CustomEvent?: unknown }).CustomEvent = class { constructor(public type: string) {} };
  try {
    corpo();
  } finally {
    (globalThis as { window?: unknown }).window = anterior;
  }
}

describe("o interruptor do Star Player", () => {
  it("ligar NÃO apaga a taxa de uso: a fatia sai dos dois pesos, em proporção", () => {
    comArmazenamentoLocal(() => {
      // Este foi o erro que apareceu no navegador. Ligar a 30% com a fórmula
      // oficial dava 70/30/0 — o uso desaparecia do Score sem ninguém pedir.
      const depois = writeHybridWeights({ starPlayerEnabled: true });
      expect(depois.usageRate).toBeGreaterThan(0);
      expect(depois).toMatchObject({ winRate: 49, starPlayer: 30, usageRate: 21 });
      // 49:21 é a mesma proporção que 70:30, agora dentro dos 70% que sobram.
      expect(depois.winRate / (depois.winRate + depois.usageRate)).toBeCloseTo(0.7, 2);
    });
  });

  it("desligar repõe exatamente a divisão de antes", () => {
    comArmazenamentoLocal(() => {
      writeHybridWeights({ starPlayerEnabled: true });
      const voltou = writeHybridWeights({ starPlayerEnabled: false });
      expect(voltou).toMatchObject({ winRate: 70, usageRate: 30, starPlayerEnabled: false });
      expect(hybridWeightFractions(voltou)).toEqual({ winRateWeight: 0.7, starPlayerWeight: 0 });
    });
  });

  it("arrastar os cursores manda por cima da repartição: 50/30/20 é 50/30/20", () => {
    comArmazenamentoLocal(() => {
      writeHybridWeights({ starPlayerEnabled: true });
      const escolhido = writeHybridWeights({ winRate: 50, starPlayer: 30 });
      expect(escolhido).toMatchObject({ winRate: 50, starPlayer: 30, usageRate: 20 });
    });
  });

  it("a divisão sobrevive a fechar e reabrir o site", () => {
    comArmazenamentoLocal(() => {
      writeHybridWeights({ winRate: 50, starPlayer: 30, starPlayerEnabled: true });
      expect(readHybridWeights()).toMatchObject({ winRate: 50, starPlayer: 30, usageRate: 20, starPlayerEnabled: true });
    });
  });
});

describe("a preferência guardada no navegador", () => {
  it("desligada, as frações são exatamente as de sempre", () => {
    expect(hybridWeightFractions(officialHybridWeights)).toEqual({ winRateWeight: 0.7, starPlayerWeight: 0 });
    expect(hybridWeightFractions(pesos({ winRate: 85, usageRate: 15 }))).toEqual({ winRateWeight: 0.85, starPlayerWeight: 0 });
  });

  it("a percentagem guardada não conta enquanto o interruptor estiver desligado", () => {
    // O valor fica guardado para o cursor não aparecer a zero quando se ligar,
    // mas não entra em conta nenhuma até isso acontecer.
    expect(hybridWeightFractions(pesos({ winRate: 70, usageRate: 30, starPlayer: 30, starPlayerEnabled: false })).starPlayerWeight).toBe(0);
  });
});
