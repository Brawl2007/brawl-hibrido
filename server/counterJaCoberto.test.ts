import { afterEach, describe, expect, it } from "vitest";
import { calculateDraftSignal } from "@shared/draft";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import type { CounterSyncSnapshotPayload } from "@shared/counterSyncSnapshot";

/**
 * A regra opcional "resposta já coberta".
 *
 * POR QUE ISTO EXISTE
 *
 * O cartão do Draft mostrava um chip a dizer "Counter unitário já coberto ·
 * sem bónus repetido". Não era verdade: o motor tinha deixado de suprimir esse
 * bónus e pagava-o na mesma, e o texto ficou para trás. Quem lia o cartão
 * concluía, com razão, que responder a um inimigo já respondido não valia nada.
 *
 * A regra que passa a existir não é a antiga de volta. Tem duas condições que a
 * antiga não tinha, e ambas vieram de quem usa o Draft:
 *
 *  1. só conta cobertura a sério — o aliado tem de ter o inimigo no Top 10 dos
 *     counters DELE. Um delta positivo residual não é responder;
 *  2. quem responde a DOIS ou mais inimigos mantém o bónus inteiro. Esse não
 *     está a repetir a resposta do aliado; está a cobrir uma frente que mais
 *     ninguém cobre.
 *
 * E está desligada por omissão, atrás de um interruptor nas regras do Draft:
 * é uma opinião sobre drafting, não um dado publicado.
 */

const capturedAt = "2026-09-18T00:00:00.000Z";
const estado = { status: "success" as const, complete: true, fetchedAt: capturedAt, brawlers: [], relationCount: 1 };
const mapa = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", tier: "S" as const, score: 70, winRate: 52, usage: 8 };

const candidato = { ...mapa, brawler: "Nori", score: 72, winRate: 55 };
const aliado = { ...mapa, brawler: "Gus" };
const inimigo = { ...mapa, brawler: "Pearl" };
const outroInimigo = { ...mapa, brawler: "Bibi" };

/**
 * O `delta` da snapshot é a vantagem do DEFENSOR, não a do atacante: uma
 * relação `targets` com `delta: -6` é o dono a ganhar 6% ao defensor. Descobri-o
 * a medir, depois de a primeira versão deste ficheiro dar counters negativos
 * onde eu esperava positivos.
 */
const LIGADA = { coveredCounterSuppression: 1 };
const DESLIGADA = { coveredCounterSuppression: 0 };

/**
 * `enchimento` empurra o inimigo para fora do Top 10 do aliado sem lhe tirar a
 * relação: é assim que se separa "o aliado responde-lhe" de "o aliado tem um
 * delta positivo contra ele".
 */
const NOMES_DE_ENCHIMENTO = ["Shelly", "Colt", "Bull", "Brock", "Jessie", "Nita", "Dynamike", "Bo", "Tick", "Barley", "Poco", "Rosa"];

function snapshot({ aliadoCounteraInimigo, enchimento = 0 }: { aliadoCounteraInimigo: boolean; enchimento?: number }): CounterSyncSnapshotPayload {
  const relations = [
    { owner: "Nori", direction: "targets" as const, attacker: "Nori", defender: "Pearl", source: "brawlscope" as const, sourceUrl: "https://brawlscope.test/nori", delta: -6 },
    { owner: "Nori", direction: "targets" as const, attacker: "Nori", defender: "Bibi", source: "brawlscope" as const, sourceUrl: "https://brawlscope.test/nori", delta: -5 },
  ];
  if (aliadoCounteraInimigo) {
    /**
     * Enchimento com brawlers REAIS, e antes da Pearl para ocuparem os
     * primeiros lugares. Com nomes inventados isto não funciona: o motor
     * descarta relações de brawlers que não existem no catálogo, e a Pearl
     * ficava em primeiro na mesma — foi o que a primeira versão deste teste fez.
     */
    for (const nome of NOMES_DE_ENCHIMENTO.slice(0, enchimento)) {
      relations.push({ owner: "Gus", direction: "targets" as const, attacker: "Gus", defender: nome, source: "brawlscope" as const, sourceUrl: "https://brawlscope.test/gus", delta: -9 });
    }
    relations.push({ owner: "Gus", direction: "targets" as const, attacker: "Gus", defender: "Pearl", source: "brawlscope" as const, sourceUrl: "https://brawlscope.test/gus", delta: -7 });
  }
  return {
    schemaVersion: 2,
    capturedAt,
    absenceStreaks: {},
    activeBrawlers: ["Nori", "Gus", "Pearl", "Bibi", ...NOMES_DE_ENCHIMENTO],
    sourceStates: { brawlscope: estado, calculator: estado, planet: estado, prodigy: estado },
    relations,
    synergies: [],
  };
}

const contexto = (extra: object) => ({ mapModeId: "knockout", mapName: "Flaring Phoenix", pickNumber: 4, ...extra });

describe("resposta já coberta", () => {
  afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));

  it("desligada por omissão: o bónus é pago mesmo com o aliado a cobrir", () => {
    setCounterSyncSnapshot(snapshot({ aliadoCounteraInimigo: true }));
    const sozinho = calculateDraftSignal(candidato, contexto({ allyRows: [], enemyRows: [inimigo] }) as never);
    const comAliado = calculateDraftSignal(candidato, contexto({ allyRows: [aliado], enemyRows: [inimigo] }) as never);

    expect(sozinho.scoreBreakdown.counterPoints).toBeGreaterThan(0);
    expect(comAliado.scoreBreakdown.counterPoints).toBeCloseTo(sozinho.scoreBreakdown.counterPoints, 6);
    expect(comAliado.bonusSources.suppressedCounterTargets).toEqual([]);
  });

  it("ligada: o bónus é retirado quando o aliado tem o inimigo no Top 10 dele", () => {
    setCounterSyncSnapshot(snapshot({ aliadoCounteraInimigo: true }));
    const sinal = calculateDraftSignal(candidato, contexto({ allyRows: [aliado], enemyRows: [inimigo], ruleSettings: LIGADA }) as never);

    expect(sinal.bonusSources.fullyCoveredTargets.map((c) => c.enemy)).toContain("Pearl");
    expect(sinal.bonusSources.suppressedCounterTargets).toEqual(["Pearl"]);
    expect(sinal.scoreBreakdown.counterPoints).toBe(0);
  });

  it("ligada, mas o aliado tem o inimigo fora do Top 10: o bónus mantém-se", () => {
    /**
     * A condição que separa esta regra da antiga. O Gus continua a ter um delta
     * positivo contra a Pearl — o que ele não tem é a Pearl entre os dez
     * primeiros da lista dele. Isso não é responder ao inimigo; é não perder
     * com ele, e não chega para dispensar a resposta do candidato.
     */
    setCounterSyncSnapshot(snapshot({ aliadoCounteraInimigo: true, enchimento: 12 }));
    const sinal = calculateDraftSignal(candidato, contexto({ allyRows: [aliado], enemyRows: [inimigo], ruleSettings: LIGADA }) as never);

    expect(sinal.bonusSources.coveredCounterTargets.map((c) => c.enemy)).toContain("Pearl");
    expect(sinal.bonusSources.fullyCoveredTargets).toEqual([]);
    expect(sinal.bonusSources.suppressedCounterTargets).toEqual([]);
    expect(sinal.scoreBreakdown.counterPoints).toBeGreaterThan(0);
  });

  it("ligada, mas o candidato responde a dois inimigos: mantém o bónus inteiro", () => {
    /**
     * A excepção que impede a regra de castigar a escolha mais útil do draft.
     * O Nori responde à Pearl (que o Gus já cobre) E à Bibi (que ninguém cobre).
     * Cortar-lhe a Pearl fazia dele um candidato pior do que quem não responde
     * a ninguém, o que é o contrário do que a regra quer.
     */
    setCounterSyncSnapshot(snapshot({ aliadoCounteraInimigo: true }));
    const umInimigo = calculateDraftSignal(candidato, contexto({ allyRows: [aliado], enemyRows: [inimigo], ruleSettings: LIGADA }) as never);
    const doisInimigos = calculateDraftSignal(candidato, contexto({ allyRows: [aliado], enemyRows: [inimigo, outroInimigo], ruleSettings: LIGADA }) as never);

    expect(umInimigo.scoreBreakdown.counterPoints).toBe(0);
    expect(doisInimigos.bonusSources.suppressedCounterTargets).toEqual([]);
    // Os dois deltas inteiros, incluindo o da Pearl que sozinha seria cortada.
    const semRegra = calculateDraftSignal(candidato, contexto({ allyRows: [aliado], enemyRows: [inimigo, outroInimigo], ruleSettings: DESLIGADA }) as never);
    expect(doisInimigos.scoreBreakdown.counterPoints).toBeCloseTo(semRegra.scoreBreakdown.counterPoints, 6);
  });

  it("sem aliado nenhum a cobrir, a regra ligada não muda nada", () => {
    setCounterSyncSnapshot(snapshot({ aliadoCounteraInimigo: false }));
    const ligada = calculateDraftSignal(candidato, contexto({ allyRows: [aliado], enemyRows: [inimigo], ruleSettings: LIGADA }) as never);
    const desligada = calculateDraftSignal(candidato, contexto({ allyRows: [aliado], enemyRows: [inimigo], ruleSettings: DESLIGADA }) as never);

    expect(ligada.bonusSources.suppressedCounterTargets).toEqual([]);
    expect(ligada.scoreBreakdown.counterPoints).toBeCloseTo(desligada.scoreBreakdown.counterPoints, 6);
  });
});
