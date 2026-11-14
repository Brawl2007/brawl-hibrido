import { beforeEach, describe, expect, it, vi } from "vitest";

const mundo = vi.hoisted(() => ({
  definicoes: new Map<string, string>(),
  /** Histórico antigo: ids de 1 a N. */
  antigas: [] as Array<{ id: number; mapId: string; mode: string; battleTime: Date; winningTeam: string; losingTeam: string; rankMedio: number | null; todosNivel11: number | null }>,
  gravacoes: [] as Array<{ ids: number; modo: string }>,
  empacotadas: 0,
  falharAposGravar: false,
}));

vi.mock("./appSettings", () => ({
  getSettingFresh: vi.fn(async (chave: string) => mundo.definicoes.get(chave) ?? null),
  setSetting: vi.fn(async (chave: string, valor: string | null) => { if (valor === null) mundo.definicoes.delete(chave); else mundo.definicoes.set(chave, valor); }),
}));
vi.mock("./pacotesDePartidas", () => ({
  maiorIdDasPartidasAntigas: vi.fn(async () => mundo.antigas.at(-1)?.id ?? 0),
  lerLoteDasPartidasAntigas: vi.fn(async (depois: number, ate: number, limite: number) => {
    const linhas = mundo.antigas.filter((l) => l.id > depois && l.id <= ate).slice(0, limite);
    return { linhas, ultimoId: linhas.at(-1)?.id ?? depois };
  }),
  gravarEmPacotes: vi.fn(async (partidas: unknown[], modo = "descartar") => {
    mundo.gravacoes.push({ ids: partidas.length, modo });
    mundo.empacotadas += partidas.length;
    if (mundo.falharAposGravar) { mundo.falharAposGravar = false; throw new Error("falha a meio"); }
    return { novas: partidas.length, grupos: 1 };
  }),
  contarPartidasAntigasDesde: vi.fn(async () => mundo.antigas.length),
  contarPartidasEmPacotes: vi.fn(async () => mundo.empacotadas),
}));

const { avancarMigracao, converterPartidaAntiga, lerArmazenamento, LOTE_DA_MIGRACAO, CHAVE_DA_MIGRACAO } = await import("./migracaoCompacta");

const AGORA = new Date("2026-11-14T12:00:00Z");
const linha = (id: number, extra: Partial<(typeof mundo.antigas)[number]> = {}) => ({
  id, mapId: "15000001", mode: "gemgrab", battleTime: new Date(AGORA.getTime() - id * 1000),
  winningTeam: JSON.stringify(["COLT", "NITA", "POCO"]), losingTeam: JSON.stringify(["BULL", "SHELLY", "PIPER"]),
  rankMedio: 17, todosNivel11: 1, ...extra,
});
const historico = (n: number) => { mundo.antigas = Array.from({ length: n }, (_, i) => linha(i + 1)); };
const prazoLongo = () => Date.now() + 60_000;

beforeEach(() => {
  mundo.definicoes.clear(); mundo.antigas = []; mundo.gravacoes = []; mundo.empacotadas = 0; mundo.falharAposGravar = false;
});

describe("converter uma partida antiga", () => {
  it("passa rank e nível, e usa 0 quando o rank não se conhece", () => {
    const ok = converterPartidaAntiga(linha(1, { rankMedio: null, todosNivel11: null }));
    expect(ok?.batalha).toMatchObject({ rank: 0, nivel11: false, vencedores: ["COLT", "NITA", "POCO"] });
    expect(ok?.batalha.t).toBe(Math.floor(linha(1).battleTime.getTime() / 1000));
  });

  it("não inventa partidas: equipas estragadas ficam de fora", () => {
    expect(converterPartidaAntiga(linha(1, { winningTeam: "xx" }))).toBeNull();
    expect(converterPartidaAntiga(linha(1, { losingTeam: "[]" }))).toBeNull();
  });
});

describe("migração para pacotes", () => {
  it("começa a migrar, copia tudo e só então passa a compacto", async () => {
    historico(LOTE_DA_MIGRACAO * 2 + 10);
    const r = await avancarMigracao(AGORA, prazoLongo());
    expect(r.armazenamento).toBe("compacto");
    expect(mundo.empacotadas).toBe(LOTE_DA_MIGRACAO * 2 + 10);
    expect(mundo.gravacoes.map((g) => g.modo)).toEqual(["ignorar", "ignorar", "ignorar"]);
    expect(await lerArmazenamento()).toBe("compacto");
  });

  it("com pouco tempo, copia só uma parte e retoma na volta seguinte", async () => {
    historico(LOTE_DA_MIGRACAO * 3);
    const primeira = await avancarMigracao(AGORA, Date.now() - 1);
    expect(primeira.armazenamento).toBe("a_migrar");
    expect(mundo.empacotadas).toBe(0);
    // Um prazo que dá para um lote: o relógio avança entre as verificações.
    let chamadas = 0;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => (chamadas++ < 1 ? 0 : 10));
    const segunda = await avancarMigracao(AGORA, 5);
    dateNow.mockRestore();
    expect(segunda.armazenamento).toBe("a_migrar");
    expect(mundo.empacotadas).toBe(LOTE_DA_MIGRACAO);
    const terceira = await avancarMigracao(AGORA, prazoLongo());
    expect(terceira.armazenamento).toBe("compacto");
    expect(mundo.empacotadas).toBe(LOTE_DA_MIGRACAO * 3);
  });

  it("um lote interrompido a meio é refeito com deduplicação", async () => {
    historico(LOTE_DA_MIGRACAO + 5);
    mundo.falharAposGravar = true;
    await expect(avancarMigracao(AGORA, prazoLongo())).rejects.toThrow("falha a meio");
    expect(JSON.parse(mundo.definicoes.get(CHAVE_DA_MIGRACAO)!).pendenteAte).toBe(LOTE_DA_MIGRACAO);
    mundo.empacotadas = 0; // o que ficou gravado conta-se de novo pelo dedupe real; aqui só se vê o modo
    await avancarMigracao(AGORA, prazoLongo());
    expect(mundo.gravacoes.map((g) => g.modo)).toEqual(["ignorar", "descartar", "ignorar"]);
    expect(await lerArmazenamento()).toBe("compacto");
  });

  it("não passa a compacto se as contagens não baterem", async () => {
    historico(50);
    const real = mundo.antigas.length;
    mundo.antigas.push(linha(real + 1)); // existe no histórico, mas vamos fingir que a cópia perdeu uma
    mundo.empacotadas = -1;
    const r = await avancarMigracao(AGORA, prazoLongo());
    expect(r.armazenamento).toBe("a_migrar");
    expect(JSON.parse(mundo.definicoes.get(CHAVE_DA_MIGRACAO)!).diferenca).not.toBe(0);
    expect(await lerArmazenamento()).toBe("a_migrar");
  });

  it("partidas com equipas estragadas contam como ignoradas e não bloqueiam a passagem", async () => {
    historico(20);
    mundo.antigas[3] = linha(4, { winningTeam: "lixo" });
    const r = await avancarMigracao(AGORA, prazoLongo());
    expect(r.armazenamento).toBe("compacto");
    expect(mundo.empacotadas).toBe(19);
  });

  it("já compacto, não faz nada", async () => {
    mundo.definicoes.set("armazenamentoDasPartidas", "compacto");
    historico(10);
    expect(await avancarMigracao(AGORA, prazoLongo())).toMatchObject({ armazenamento: "compacto", convertidas: 0 });
    expect(mundo.gravacoes).toHaveLength(0);
  });

  it("sem histórico antigo (instalação nova), passa logo a compacto", async () => {
    const r = await avancarMigracao(AGORA, prazoLongo());
    expect(r.armazenamento).toBe("compacto");
  });
});
