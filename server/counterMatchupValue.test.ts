import { afterEach, describe, expect, it } from 'vitest';
import { calculateMatchupValue, getMatchupValue, describeMatchupValue } from '../shared/counterMatchupValue';
import { setCounterSyncSnapshot } from '../shared/counterSourceRelations';
import { calculateDraftSignal, getCounterMatchup, calculateLaneMatchup } from '../shared/draft';
import type { CounterSyncSnapshotPayload, SyncedCounterRelation } from '../shared/counterSyncSnapshot';

function relation(source: SyncedCounterRelation['source'], direction: SyncedCounterRelation['direction'], foe = 'Griff', delta?: number): SyncedCounterRelation {
  return { owner: 'Bea', source, direction, attacker: direction === 'targets' ? 'Bea' : foe, defender: direction === 'targets' ? foe : 'Bea', delta, sourceUrl: 'https://example.test' };
}
/**
 * O delta é guardado na orientação em que a fonte o publica: positivo quando o
 * ADVERSÁRIO leva vantagem sobre o titular da ficha. Um `targets` — o titular
 * pune — tem por isso delta publicado NEGATIVO, e é essa inversão que o motor
 * aplica para ler o confronto na perspetiva do candidato. Os fixtures abaixo
 * estavam a guardar deltas positivos em relações `targets`, o que é dado
 * impossível na fonte e invertia o sinal esperado.
 */
const publishedDelta = (direction: SyncedCounterRelation['direction'], magnitude: number) =>
  direction === 'targets' ? -magnitude : magnitude;

function snapshot(relations: SyncedCounterRelation[]) {
  const state = { status: 'success' as const, complete: true, fetchedAt: '2026-09-09', brawlers: [], relationCount: 0 };
  const payload: CounterSyncSnapshotPayload = { schemaVersion: 2, capturedAt: state.fetchedAt, sourceStates: { brawlscope: state, planet: state, prodigy: state, calculator: state }, relations, absenceStreaks: {} };
  setCounterSyncSnapshot(payload);
}
afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }));
const row = (brawler: string) => ({ brawler, score: 100, tier: 'A' as const });

describe('fórmula solicitada de counters', () => {
  it.each([[0,0,4.9],[1,0,6.9],[0,1,6.9],[1,1,8.9],[-1,1,6.9],[-1,-1,4.9]])('positivo confirmações %s/%s → %s', (pl, planet, total) => {
    expect(calculateMatchupValue(4.9, pl, planet).total).toBe(total);
  });
  it('negativo confirmado pelas duas fontes', () => expect(calculateMatchupValue(-4.9,-1,-1).total).toBe(-8.9));
  it('sem delta não inventa um percentual', () => expect(calculateMatchupValue(null,1,1).total).toBe(0));
  it('zero não recebe confirmações', () => expect(calculateMatchupValue(0,1,1).total).toBe(0));
  it.each(['targets','counteredBy'] as const)('mesmo sinal em Draft, duelo e cálculo: %s', direction => {
    snapshot([relation('brawlscope',direction,'Griff',publishedDelta(direction,4.9)),relation('prodigy',direction),relation('planet',direction)]);
    const expected = direction === 'targets' ? 8.9 : -8.9;
    expect(getMatchupValue('Bea','Griff').total).toBe(expected);
    expect(getCounterMatchup('Bea','Griff')?.counterDelta).toBe(expected);
    expect(calculateLaneMatchup(row('Bea'),row('Griff')).score).toBeCloseTo(50+expected);
    const signal = calculateDraftSignal(row('Bea'), { enemyRows: [row('Griff')], ruleSettings: { counterPickMultiplier: 2 } });
    // Base 100 pts × delta/100 × ajuste 2 — o multiplicador entra nos pontos, não no delta.
    expect(signal.scoreBreakdown.counterPoints).toBeCloseTo(expected * 2);
    expect(signal.counterMatchups[0].counterDelta).toBe(expected);
    expect(signal.counterMatchups[0].note).toContain('PL Prodigy');
  });
  it('Calculator nunca altera resultado nem composição', () => {
    snapshot([relation('brawlscope','targets','Griff',4.9)]);
    const before = getMatchupValue('Bea','Griff');
    snapshot([relation('brawlscope','targets','Griff',4.9),relation('calculator','counteredBy','Griff',99)]);
    expect(getMatchupValue('Bea','Griff')).toEqual(before);
    expect(describeMatchupValue(before)).not.toContain('Calculator');
  });
  it('confirmação repetida só soma 2%', () => {
    snapshot([relation('brawlscope','targets','Griff',publishedDelta('targets',4.9)),relation('planet','targets'),relation('planet','targets')]);
    expect(getMatchupValue('Bea','Griff').total).toBe(6.9);
  });
  it('bônus ban exige counter literal Top 10 E Top 25 mapa, incluindo limites', () => {
    // A lista publicada do brawler é a autoridade: o motor aceita o Top 10 tal
    // como a fonte o publica e não impõe um corte próprio no 11.º nome. Quem fica
    // de fora do bónus é quem NÃO consta da lista — aqui, o nome nunca publicado.
    const names = Array.from({length: 10}, (_,i) => `TestOpponent${i}`);
    const neverPublished = 'TestOpponentFora';
    snapshot(names.map((name,i) => relation('brawlscope','counteredBy',name,100-i)));
    const signal = (ban: string, top25: string[]) => calculateDraftSignal(row('Bea'), { bannedNames: new Set([ban]), baseHybridTop25Names: new Set(top25), pickNumber: 2 });
    expect(signal(names[0],names).bannedCounterCount).toBe(1);
    expect(signal(names[9],names).bannedCounterCount).toBe(1);
    expect(signal(neverPublished,[...names, neverPublished]).bannedCounterCount).toBe(0);
    expect(signal(names[0],[]).bannedCounterCount).toBe(0);
    expect(signal(neverPublished,[...names, neverPublished]).scoreBreakdown.banPoints).toBe(0);
    expect(signal(names[0],[]).scoreBreakdown.banPoints).toBe(0);
  });
  it('confirmações respeitam filtro de modo', () => {
    snapshot([relation('brawlscope','targets','Griff',publishedDelta('targets',4.9)), {...relation('planet','targets'),modeId:'heist'}]);
    expect(getMatchupValue('Bea','Griff','heist').total).toBe(6.9);
    expect(getMatchupValue('Bea','Griff','brawlBall').total).toBe(4.9);
  });
});
