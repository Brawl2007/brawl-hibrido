import { describe, expect, it } from "vitest";
import { getObservedMatchup, getObservedMatchupRow, listObservedMaps, listObservedModes } from "../shared/observedMatchupMatrix";

const fixture = [
  { map: "Canal", mode: "gemGrab", brawler: "SHELLY", opponent: "NITA", wins: 12, losses: 8, samples: 20 },
  { map: "Ponte", mode: "gemGrab", brawler: "SHELLY", opponent: "NITA", wins: 9, losses: 6, samples: 15 },
  { map: "Canal", mode: "gemGrab", brawler: "NITA", opponent: "SHELLY", wins: 8, losses: 12, samples: 20 },
  { map: "Canal", mode: "brawlBall", brawler: "SHELLY", opponent: "COLT", wins: 3, losses: 1, samples: 4 },
] as const;

describe("matriz 1v1 observada", () => {
  it("agrega apenas as partidas reais do par, preservando a perspetiva do brawler", () => {
    const result = getObservedMatchup(fixture, "Shelly", "Nita");
    expect(result).toMatchObject({ wins: 21, losses: 14, samples: 35, hasSufficientSample: true });
    expect(result.winRate).toBe(60);
  });

  it("respeita o filtro de mapa e não completa resultados ausentes", () => {
    const result = getObservedMatchup(fixture, "SHELLY", "NITA", { map: "Canal" });
    expect(result).toMatchObject({ wins: 12, losses: 8, samples: 20, hasSufficientSample: false });
    expect(result.winRate).toBe(60);
  });

  it("isola o modo de jogo e nunca combina resultados entre modalidades", () => {
    const result = getObservedMatchup(fixture, "SHELLY", "NITA", { mode: "brawlBall" });
    expect(result).toMatchObject({ wins: 0, losses: 0, samples: 0, hasSufficientSample: false, winRate: null });
    expect(listObservedModes(fixture)).toEqual(["brawlBall", "gemGrab"]);
  });

  it("cria a linha da matriz com amostra insuficiente para pares não observados", () => {
    const row = getObservedMatchupRow(fixture, "SHELLY", ["SHELLY", "NITA", "COLT", "BROCK"]);
    expect(row).toHaveLength(3);
    expect(row.find((cell) => cell.opponent === "BROCK")).toMatchObject({ samples: 0, winRate: null, hasSufficientSample: false });
  });

  it("lista os mapas reais presentes no lote importado", () => {
    expect(listObservedMaps(fixture)).toEqual(["Canal", "Ponte"]);
  });
});
