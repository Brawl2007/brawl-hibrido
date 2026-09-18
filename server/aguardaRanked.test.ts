import { describe, expect, it } from "vitest";
import { marcarQuemNaoEstaNoRanked } from "./rankedSync";
import type { RankedRow } from "../client/src/data/rankedData";

/**
 * Um brawler que ainda não entrou no Ranked não pode aparecer como elegível.
 *
 * POR QUE ISTO EXISTE
 *
 * O site marcava `active` toda a gente, e tinha a prova do contrário à frente.
 * Na produção de 18/09, o Cosmo e o Vince apareciam nos 26 mapas marcados
 * elegíveis, com `score`, `tier` e as quatro taxas das duas fontes todos a
 * `null` — 26 linhas cada, zero números. Não são elegíveis: ainda não foram
 * libertados para Ranked, e é por isso que nenhuma fonte os publica.
 *
 * A distinção importa porque o ecrã já sabe dizer "A aguardar Ranked". O que
 * estava errado não era a forma de o mostrar, era a classificação.
 */

/**
 * A linha de quem NÃO está no Ranked, copiada da produção — não inventada.
 *
 * Isto é o ponto todo deste ficheiro. A primeira versão da regra não marcava
 * ninguém, e passou nos testes na mesma, porque eu escrevi aqui
 * `topBrawlUseRate: null` a partir do que supunha. Os dados reais dizem outra
 * coisa: o TopBrawl publica `topBrawlUseRate: 0` para quem não está no Ranked.
 * Zero é um número, `0 != null` é verdade, e a regra aceitava-o como medição.
 *
 * Copiado da snapshot `live-20260918174340`, linha do Cosmo em Belle's Rock:
 *   score: null · tier: null · topBrawlWinRate: null · topBrawlUseRate: 0
 *   winRate: null · usage: 0 · brawlerId: 16000109
 */
const linha = (brawler: string, mapa: string, comNumeros: boolean): RankedRow => ({
  map: mapa, mode: "Fute-Brawl", modeId: "brawl-ball", brawler,
  score: comNumeros ? 50 : null, tier: comNumeros ? "B" : null,
  winRate: comNumeros ? 51 : null,
  usage: comNumeros ? 12 : 0,
  topBrawlWinRate: comNumeros ? 51 : null,
  // Zero, e não `null`: é isto que a fonte publica para quem não está no Ranked.
  topBrawlUseRate: comNumeros ? 12 : 0,
  brawlPlanetWinRate: null, brawlPlanetPickRate: null,
  rankedStatus: "active",
} as RankedRow);

/** Um plantel com `quantos` brawlers publicados e os nomes de `semNada` sem nada. */
function plantel(quantos: number, semNada: string[] = []) {
  const mapas = ["Hard Rock Mine", "Gem Fort"];
  const rows: RankedRow[] = [];
  for (let i = 0; i < quantos; i += 1) {
    for (const mapa of mapas) rows.push(linha(`Brawler ${i}`, mapa, true));
  }
  for (const nome of semNada) {
    for (const mapa of mapas) rows.push(linha(nome, mapa, false));
  }
  return rows;
}

describe("brawlers que ainda não entraram no Ranked", () => {
  it("quem não tem uma única linha das duas fontes fica a aguardar Ranked", () => {
    const saida = marcarQuemNaoEstaNoRanked(plantel(20, ["Cosmo", "Vince"]));
    const estado = (nome: string) => saida.filter((r) => r.brawler === nome).map((r) => r.rankedStatus);
    expect(estado("Cosmo")).toEqual(["unavailable", "unavailable"]);
    expect(estado("Vince")).toEqual(["unavailable", "unavailable"]);
    // E quem tem números continua elegível — em TODOS os mapas.
    expect(estado("Brawler 0")).toEqual(["active", "active"]);
  });

  it("um brawler sem números NUM mapa continua elegível, porque tem noutro", () => {
    const rows = [
      linha("Shelly", "Hard Rock Mine", true),
      linha("Shelly", "Gem Fort", false),
      ...plantel(10),
    ];
    const saida = marcarQuemNaoEstaNoRanked(rows);
    expect(saida.filter((r) => r.brawler === "Shelly").every((r) => r.rankedStatus === "active")).toBe(true);
  });

  /**
   * A guarda que impede o desastre. Sem ela, um dia em que as duas fontes
   * falhem esvaziaria o Ranked inteiro — uma leitura em falta passaria por
   * ausência, que é o erro que este projeto combate em todo o lado.
   */
  it("uma recolha falhada não esvazia o Ranked", () => {
    // Três com números, vinte sem: isto é uma recolha que correu mal.
    const semNada = Array.from({ length: 20 }, (_, i) => `Sem dados ${i}`);
    const saida = marcarQuemNaoEstaNoRanked(plantel(3, semNada));
    expect(saida.every((r) => r.rankedStatus === "active")).toBe(true);
  });

  it("não mexe em nada quando toda a gente tem números", () => {
    const entrada = plantel(12);
    expect(marcarQuemNaoEstaNoRanked(entrada)).toEqual(entrada);
  });
});
