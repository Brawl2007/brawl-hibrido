import { beforeEach, describe, expect, it, vi } from "vitest";
import { diaDaBatalha, empacotar, type BatalhaCompacta } from "@shared/partidasCompactas";
import { calcularChanceDaEquipa, type EstatisticasApiMapa } from "@shared/motorApiPerfeito";

const m = vi.hoisted(() => ({
  armazenamento: "compacto" as "legado" | "compacto",
  definicoes: new Map<string, string>(),
  pacotes: [] as Array<{ mapId: string; mode: string; dia: string; dados: string }>,
  passagens: 0,
}));

vi.mock("./appSettings", () => ({
  getSettingFresh: vi.fn(async (k: string) => m.definicoes.get(k) ?? null),
  setSetting: vi.fn(async (k: string, v: string) => { m.definicoes.set(k, v); }),
}));
vi.mock("./migracaoCompacta", () => ({ lerArmazenamento: vi.fn(async () => m.armazenamento) }));
vi.mock("./pacotesDePartidas", () => ({
  contarPartidasEmPacotes: vi.fn(async () => 300),
  percorrerPacotes: vi.fn(async (f: { desdeDia: string }, consumir: (l: unknown) => void) => {
    m.passagens += 1;
    for (const p of m.pacotes) if (p.dia >= f.desdeDia) consumir(p);
  }),
}));

const { calibrarSeForAltura, lerCalibracaoGuardada, CHAVE_DA_CALIBRACAO } = await import("./calibracaoPartidas");

const AGORA = new Date("2026-11-14T12:00:00Z");
const NOMES = ["A", "B", "C", "D", "E", "F"];
function popular(n: number) {
  const porDia = new Map<string, BatalhaCompacta[]>();
  for (let i = 0; i < n; i++) {
    const t = Math.floor(AGORA.getTime() / 1000) - (i % 20) * 86_400 - 60 * (i % 1000);
    const venc = NOMES.slice(i % 2 ? 0 : 3, i % 2 ? 3 : 6);
    const derr = NOMES.filter((x) => !venc.includes(x));
    const dia = diaDaBatalha(t);
    porDia.set(dia, [...(porDia.get(dia) ?? []), { t, vencedores: venc, derrotados: derr, rank: 17, nivel11: true }]);
  }
  m.pacotes = [...porDia].map(([dia, lista]) => ({ mapId: "15000001", mode: "gemgrab", dia, dados: empacotar(lista) }));
}

beforeEach(() => { m.armazenamento = "compacto"; m.definicoes.clear(); m.pacotes = []; m.passagens = 0; popular(300); });

describe("calibração diária", () => {
  it("só corre quando as partidas já estão nos pacotes", async () => {
    m.armazenamento = "legado";
    expect(await calibrarSeForAltura(AGORA, Date.now() + 120_000)).toEqual({ estado: "sem_pacotes" });
    expect(m.passagens).toBe(0);
  });

  it("lê os pacotes duas vezes, guarda o resultado e explica quando não aprova", async () => {
    const r = await calibrarSeForAltura(AGORA, Date.now() + 120_000);
    expect(r).toMatchObject({ estado: "feita", aprovada: false });
    expect(m.passagens).toBe(2);
    const guardada = lerCalibracaoGuardada(m.definicoes.get(CHAVE_DA_CALIBRACAO));
    expect(guardada?.motivo).toMatch(/Poucas partidas de validação/);
    expect(guardada?.amostras.treino).toBeGreaterThan(0);
  });

  it("não repete antes de passar um dia", async () => {
    await calibrarSeForAltura(AGORA, Date.now() + 120_000);
    m.passagens = 0;
    expect(await calibrarSeForAltura(new Date(AGORA.getTime() + 3_600_000), Date.now() + 120_000)).toEqual({ estado: "recente" });
    expect(m.passagens).toBe(0);
    expect(await calibrarSeForAltura(new Date(AGORA.getTime() + 25 * 3_600_000), Date.now() + 120_000)).toMatchObject({ estado: "feita" });
  });

  it("sem tempo que chegue, não começa", async () => {
    expect(await calibrarSeForAltura(AGORA, Date.now() + 10_000)).toEqual({ estado: "sem_tempo" });
    expect(m.definicoes.size).toBe(0);
  });

  it("um resultado guardado ilegível conta como não existir", () => {
    expect(lerCalibracaoGuardada("{lixo")).toBeNull();
    expect(lerCalibracaoGuardada(JSON.stringify({ a: 1 }))).toBeNull();
    expect(lerCalibracaoGuardada(null)).toBeNull();
  });
});

describe("chance da equipa", () => {
  const stats = (id: string, wr: number): EstatisticasApiMapa => ({ brawlerId: id, jogosMapa: 2000, vitoriasMapa: wr * 2000, jogosModo: 2000, vitoriasModo: wr * 2000, taxaUsoMapa: 0.1 });
  const base = {
    estatisticasMapa: { A: stats("A", 0.58), B: stats("B", 0.5), C: stats("C", 0.42), D: stats("D", 0.5) },
    obterConfronto: () => undefined,
    obterSinergia: () => undefined,
  };
  const pesos = { forca: 1, counter: 1, sinergia: 1 };

  it("sem picks, 50%; com um brawler forte, sobe; com um fraco, desce", () => {
    expect(calcularChanceDaEquipa({ ...base, aliadosIds: [], inimigosIds: [], pesos }).chance).toBe(50);
    const forte = calcularChanceDaEquipa({ ...base, aliadosIds: ["A"], inimigosIds: [], pesos }).chance;
    const fraco = calcularChanceDaEquipa({ ...base, aliadosIds: ["C"], inimigosIds: [], pesos }).chance;
    expect(forte).toBeGreaterThan(50);
    expect(fraco).toBeLessThan(50);
    expect(calcularChanceDaEquipa({ ...base, aliadosIds: [], inimigosIds: ["A"], pesos }).chance).toBeCloseTo(100 - forte, 0);
  });

  it("os pesos medidos escalam cada parte", () => {
    const inteiro = calcularChanceDaEquipa({ ...base, aliadosIds: ["A"], inimigosIds: ["C"], pesos }).chance;
    const metade = calcularChanceDaEquipa({ ...base, aliadosIds: ["A"], inimigosIds: ["C"], pesos: { ...pesos, forca: 0.5 } }).chance;
    const nenhum = calcularChanceDaEquipa({ ...base, aliadosIds: ["A"], inimigosIds: ["C"], pesos: { forca: 0, counter: 0, sinergia: 0 } }).chance;
    expect(inteiro).toBeGreaterThan(metade);
    expect(metade).toBeGreaterThan(50);
    expect(nenhum).toBe(50);
  });

  it("um counter observado favorece quem o tem", () => {
    const par = { jogosMapa: 200, vitoriasA: 160, jogosModo: 200, vitoriasAModo: 160 };
    const comCounter = calcularChanceDaEquipa({ ...base, obterConfronto: (a, b) => (a === "B" && b === "D" ? par : undefined), aliadosIds: ["B"], inimigosIds: ["D"], pesos }).chance;
    expect(comCounter).toBeGreaterThan(55);
  });
});
