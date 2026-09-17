import { describe, expect, it } from "vitest";
import { idInserido } from "./db";

/**
 * As execuções da sincronização apareciam no painel como "a correr" e nunca
 * fechavam, mesmo quando corriam bem. A causa era esta leitura: o driver do
 * MySQL devolve `[ResultSetHeader, campos]`, e `result.insertId` sobre o array
 * dá `undefined`. Isso virava `0`, e o `0` era descartado em silêncio pelos
 * `updateXSyncRun`, que começam por `if (!db || !id) return`.
 */
describe("id da linha inserida", () => {
  it("lê o id do formato que o driver devolve", () => {
    expect(idInserido([{ insertId: 189, affectedRows: 1 }, []])).toBe(189);
  });

  it("aceita também o cabeçalho sem array", () => {
    // Se o driver mudar de forma, isto continua a funcionar.
    expect(idInserido({ insertId: 42 })).toBe(42);
  });

  it("devolve zero quando não há id, em vez de NaN", () => {
    // Zero é o valor que as escritas já sabem recusar; NaN atravessaria.
    for (const semId of [undefined, null, [], [{}], {}, [{ insertId: undefined }]]) {
      expect(idInserido(semId)).toBe(0);
    }
  });
});
