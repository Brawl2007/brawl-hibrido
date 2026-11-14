import { describe, expect, it } from "vitest";
import {
  ajustarLogistica,
  configCalibrada,
  criarCalibracao,
  type BatalhaParaCalibrar,
} from "@shared/calibracaoDoMotorApi";
import { CONFIG_PADRAO } from "@shared/configDoMotorApi";

/** Gerador repetível. */
function mulberry32(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const NOMES = Array.from({ length: 14 }, (_, i) => `B${i}`);
const DIA = 86_400;

/** Partidas de um mundo em que força, counters e sinergias existem de verdade — ou não. */
function mundo(opcoes: { partidas: number; sinal: boolean; semente?: number }) {
  const rand = mulberry32(opcoes.semente ?? 7);
  const forca = NOMES.map(() => (opcoes.sinal ? 0.3 * normal(rand) : 0));
  const counter = NOMES.map(() => NOMES.map(() => 0));
  const sinergia = NOMES.map(() => NOMES.map(() => 0));
  for (let i = 0; i < NOMES.length; i++) for (let j = i + 1; j < NOMES.length; j++) {
    const c = opcoes.sinal ? 0.25 * normal(rand) : 0;
    counter[i][j] = c; counter[j][i] = -c;
    sinergia[i][j] = sinergia[j][i] = opcoes.sinal ? 0.15 * normal(rand) : 0;
  }
  const fim = 1_800_000_000, batalhas: BatalhaParaCalibrar[] = [];
  for (let k = 0; k < opcoes.partidas; k++) {
    const ordem = NOMES.map((_, i) => i).sort(() => rand() - 0.5).slice(0, 6);
    const A = ordem.slice(0, 3), B = ordem.slice(3);
    let z = A.reduce((s, i) => s + forca[i], 0) - B.reduce((s, i) => s + forca[i], 0);
    for (const a of A) for (const b of B) z += counter[a][b];
    for (const [E, sinal] of [[A, 1], [B, -1]] as const) for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) z += sinal * sinergia[E[x]][E[y]];
    const aGanha = rand() < 1 / (1 + Math.exp(-z));
    const [venc, derr] = aGanha ? [A, B] : [B, A];
    batalhas.push({ mapa: "m1", t: fim - Math.floor(rand() * 30 * DIA), vencedores: venc.map((i) => NOMES[i]), derrotados: derr.map((i) => NOMES[i]) });
  }
  return { batalhas, corte: fim - 7 * DIA };
}

function calibrar(w: ReturnType<typeof mundo>, minimo = 2000, taxaDasEstatisticas = 1) {
  const c = criarCalibracao({ corteDeValidacao: w.corte, minimoDeValidacao: minimo, taxaDasEstatisticas });
  for (const b of w.batalhas) c.passagem1(b);
  c.iniciarPassagem2();
  for (const b of w.batalhas) c.passagem2(b);
  return c.terminar(new Date("2026-11-14T12:00:00Z"));
}

describe("regressão logística", () => {
  it("recupera os pesos de dados gerados por eles", () => {
    const rand = mulberry32(3), x0: number[] = [], x1: number[] = [], y: number[] = [];
    for (let i = 0; i < 20_000; i++) {
      const a = normal(rand), b = normal(rand);
      x0.push(a); x1.push(b);
      y.push(rand() < 1 / (1 + Math.exp(-(0.8 * a - 0.4 * b))) ? 1 : 0);
    }
    const [w0, w1] = ajustarLogistica([x0, x1], y);
    expect(w0).toBeCloseTo(0.8, 1);
    expect(w1).toBeCloseTo(-0.4, 1);
  });
});

describe("calibração nas partidas", () => {
  it("num mundo com força e counters verdadeiros, bate o acaso nas partidas mais recentes e aprova", () => {
    const r = calibrar(mundo({ partidas: 60_000, sinal: true }));
    expect(r.aprovada, r.motivo).toBe(true);
    expect(r.qualidade.logLoss).toBeLessThan(r.qualidade.referencia - 0.01);
    expect(r.qualidade.acerto).toBeGreaterThan(0.55);
    expect(r.pesos.forca).toBeGreaterThan(0.3);
    expect(r.pesos.counter).toBeGreaterThan(0.2);
    // Os counters acrescentam algo à força sozinha.
    expect(r.qualidade.logLoss).toBeLessThan(r.qualidade.soForca);
    expect(r.amostras.validacao).toBeGreaterThan(2000);
    expect(r.curva.length).toBeGreaterThan(3);
    // Calibrada: o previsto e o observado de cada faixa não se afastam.
    for (const faixa of r.curva.filter((f) => f.n > 500)) expect(Math.abs(faixa.previsto - faixa.observado)).toBeLessThan(0.06);
  });

  it("num mundo sem sinal nenhum, não vê vantagem onde não há (sem vazamento) e não aprova", () => {
    const r = calibrar(mundo({ partidas: 60_000, sinal: false }));
    expect(r.aprovada).toBe(false);
    // Sem o deixar-um-de-fora, as partidas raras «preveriam-se» a si mesmas e os pesos saíam inflacionados.
    expect(r.pesos.counter).toBeLessThan(0.5);
    expect(r.pesos.sinergia).toBeLessThan(0.5);
    expect(Math.abs(r.qualidade.logLoss - r.qualidade.referencia)).toBeLessThan(0.01);
    expect(r.motivo).toMatch(/acaso/);
  });

  it("com uma amostra das estatísticas (volumes grandes) continua sem vazamento e continua a aprovar quando há sinal", () => {
    const comSinal = calibrar(mundo({ partidas: 60_000, sinal: true }), 2000, 0.5);
    expect(comSinal.aprovada, comSinal.motivo).toBe(true);
    expect(comSinal.amostras.estatisticas).toBeLessThan(comSinal.amostras.treino * 0.6);
    const semSinal = calibrar(mundo({ partidas: 60_000, sinal: false }), 2000, 0.5);
    expect(semSinal.aprovada).toBe(false);
    expect(semSinal.pesos.counter).toBeLessThan(0.5);
  });

  it("com poucas partidas de validação, não aprova mesmo que o modelo seja bom", () => {
    const r = calibrar(mundo({ partidas: 12_000, sinal: true }), 20_000);
    expect(r.aprovada).toBe(false);
    expect(r.motivo).toMatch(/Poucas partidas de validação/);
  });

  it("o resultado é repetível", () => {
    const w = mundo({ partidas: 8000, sinal: true });
    expect(calibrar(w, 500)).toEqual(calibrar(w, 500));
  });
});

describe("o preset «Calibrado»", () => {
  it("corrige a força de counters e sinergias pelos pesos medidos, dentro de limites", () => {
    const c = configCalibrada({ forca: 0.7, counter: 0.6, sinergia: 1.4 });
    expect(c.forcas).toMatchObject({ counter: 0.6, counterado: 0.6, sinergia: 1.4, antiSinergia: 1.4 });
    expect(c.forcas.hardCounter).toBe(1);
    expect(c.picks).toEqual(CONFIG_PADRAO.picks);
    const extremo = configCalibrada({ forca: 1, counter: 0, sinergia: 99 });
    expect(extremo.forcas.counter).toBe(0.25);
    expect(extremo.forcas.sinergia).toBe(4);
  });
});
