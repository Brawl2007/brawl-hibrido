import { describe, expect, it } from "vitest";
import {
  chaveDaBatalha,
  desempacotar,
  diaDaBatalha,
  diaMenos,
  eloDoNivel,
  empacotar,
  inicioDoDia,
  semRepetidas,
  type BatalhaCompacta,
} from "@shared/partidasCompactas";

const batalha = (t: number, venc = ["Colt", "Nita", "Poco"], derr = ["Bull", "Shelly", "Piper"], rank = 17, nivel11 = true): BatalhaCompacta => ({
  t, vencedores: venc, derrotados: derr, rank, nivel11,
});

describe("partidas compactas", () => {
  it("devolve exatamente o que recebeu, com os nomes guardados uma só vez", () => {
    const original = [batalha(1_000), batalha(2_000, ["Colt", "Bull", "Piper"], ["Nita", "Poco", "Shelly"], 0, false)];
    const texto = empacotar(original);
    expect(desempacotar(texto)).toEqual(original);
    expect(texto.match(/Colt/g)).toHaveLength(1);
  });

  it("um pacote vazio é válido", () => {
    expect(desempacotar(empacotar([]))).toEqual([]);
  });

  it("recusa pacotes estragados em vez de devolver uma lista menor", () => {
    expect(() => desempacotar("{}")).toThrow(/formato desconhecido/);
    expect(() => desempacotar(JSON.stringify({ v: 1, n: ["Colt"], b: [[1, [0, 5], [0], 0, 0]] }))).toThrow(/índice/);
    expect(() => desempacotar("não é json")).toThrow();
  });

  it("a chave não depende da ordem dos brawlers", () => {
    const a = batalha(5, ["Colt", "Nita", "Poco"], ["Bull", "Shelly", "Piper"]);
    const b = batalha(5, ["Poco", "Colt", "Nita"], ["Piper", "Bull", "Shelly"]);
    expect(chaveDaBatalha(a)).toBe(chaveDaBatalha(b));
    expect(chaveDaBatalha(a)).not.toBe(chaveDaBatalha(batalha(6)));
  });

  it("descarta repetidas, dentro da lista e face ao que já existe", () => {
    const existente = chaveDaBatalha(batalha(1));
    const resultado = semRepetidas([batalha(1), batalha(2), batalha(2), batalha(3)], [existente]);
    expect(resultado.map((b) => b.t)).toEqual([2, 3]);
  });

  it("agrupa por dia UTC", () => {
    const t = Date.parse("2026-11-14T23:59:59.000Z") / 1000;
    expect(diaDaBatalha(t)).toBe("2026-11-14");
    expect(diaDaBatalha(t + 1)).toBe("2026-11-15");
    expect(inicioDoDia("2026-11-14")).toBe(Date.parse("2026-11-14T00:00:00.000Z") / 1000);
    expect(diaMenos("2026-11-14", 30)).toBe("2026-10-15");
  });

  it("converte o nível de rank na mesma faixa de peso de sempre", () => {
    expect(eloDoNivel(19)).toBe("mestre");
    expect(eloDoNivel(16)).toBe("lendario");
    expect(eloDoNivel(13)).toBe("mitico");
    expect(eloDoNivel(12)).toBe("abaixo");
    expect(eloDoNivel(0)).toBe("abaixo");
    expect(eloDoNivel(null)).toBe("abaixo");
  });
});
