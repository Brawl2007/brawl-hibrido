import { beforeEach, describe, expect, it, vi } from "vitest";
import { desempacotar, type BatalhaCompacta } from "@shared/partidasCompactas";

/** Uma base de brincar: um único mapa/modo/dia, o que basta para ver as partes. */
const base = vi.hoisted(() => ({
  linhas: [] as Array<{ id: number; partidas: number; dados: string }>,
  seq: 0,
  leituras: 0,
}));

vi.mock("./db", () => {
  const ligacao: any = {
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => { base.leituras += 1; return base.linhas.map((l) => ({ id: l.id, dados: l.dados })); } }) }) }),
    insert: () => ({ values: async (v: { partidas: number; dados: string }) => { base.linhas.push({ id: ++base.seq, partidas: v.partidas, dados: v.dados }); } }),
    delete: () => ({ where: async () => { base.linhas.length = 0; } }),
    transaction: async (fn: (tx: unknown) => Promise<void>) => fn(ligacao),
  };
  return { getDb: async () => ligacao };
});

const { gravarEmPacotes, MAXIMO_DE_PARTES } = await import("./pacotesDePartidas");

const T0 = Date.parse("2026-11-14T10:00:00Z") / 1000;
const batalha = (i: number): BatalhaCompacta => ({ t: T0 + i, vencedores: ["COLT", "NITA", "POCO"], derrotados: ["BULL", "SHELLY", "PIPER"], rank: 17, nivel11: true });
const gravar = (...is: number[]) => gravarEmPacotes(is.map((i) => ({ mapId: "15000001", mode: "gemgrab", batalha: batalha(i) })));
const guardadas = () => base.linhas.flatMap((l) => desempacotar(l.dados)).map((b) => b.t - T0).sort((a, b) => a - b);

beforeEach(() => { base.linhas.length = 0; base.seq = 0; base.leituras = 0; });

describe("gravar em pacotes", () => {
  it("guarda uma parte por gravação e ignora o que já lá está", async () => {
    expect(await gravar(1, 2, 3)).toMatchObject({ novas: 3 });
    expect(await gravar(2, 3)).toMatchObject({ novas: 0 });
    expect(base.linhas).toHaveLength(1);
    expect(await gravar(3, 4)).toMatchObject({ novas: 1 });
    expect(base.linhas).toHaveLength(2);
    expect(guardadas()).toEqual([1, 2, 3, 4]);
  });

  it("repetidas dentro da mesma gravação contam uma vez", async () => {
    expect(await gravar(5, 5, 5)).toMatchObject({ novas: 1 });
    expect(guardadas()).toEqual([5]);
  });

  it(`junta as partes numa só quando passam de ${MAXIMO_DE_PARTES}, sem perder partidas`, async () => {
    for (let i = 0; i < MAXIMO_DE_PARTES; i++) await gravar(i);
    expect(base.linhas).toHaveLength(MAXIMO_DE_PARTES);
    await gravar(100);
    expect(base.linhas).toHaveLength(1);
    expect(guardadas()).toEqual([0, 1, 2, 3, 4, 5, 100]);
    expect(base.linhas[0].partidas).toBe(7);
  });

  it("no modo «ignorar» (migração) não lê o que já existe", async () => {
    await gravar(1);
    base.leituras = 0;
    await gravarEmPacotes([{ mapId: "15000001", mode: "gemgrab", batalha: batalha(9) }], "ignorar");
    expect(base.leituras).toBe(0);
    expect(guardadas()).toEqual([1, 9]);
  });
});
