import { describe, expect, it } from "vitest";
import { getActiveCounterSyncSnapshot as pelaRelacao, setCounterSyncSnapshot as porRelacao } from "../shared/counterSourceRelations";
import { getActiveCounterSyncSnapshot, setCounterSyncSnapshot } from "../shared/counterSyncEstado";
import { versaoDoMotor } from "../shared/versaoDoMotor";

/**
 * O estado da snapshot saiu de `counterSourceRelations` para um módulo leve
 * (v152). As duas portas têm de ser a mesma: o provider escreve por uma, o
 * Draft lê pela outra.
 */
describe("estado da snapshot dos counters", () => {
  it("o que se põe por um lado lê-se pelo outro", () => {
    const snapshot = { brawlers: [] } as never;
    setCounterSyncSnapshot(snapshot);
    expect(pelaRelacao()).toBe(snapshot);
    porRelacao(undefined);
    expect(getActiveCounterSyncSnapshot()).toBeUndefined();
  });

  it("cada snapshot nova avança a versão do motor", () => {
    const antes = versaoDoMotor();
    setCounterSyncSnapshot(undefined);
    expect(versaoDoMotor()).toBe(antes + 1);
  });
});
