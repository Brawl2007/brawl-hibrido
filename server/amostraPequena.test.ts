import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DISCORDANCIA_GRITANTE, USO_MINIMO_CONFIAVEL, avaliarConfianca, explicarConfianca } from "@shared/amostraPequena";

/**
 * Uma taxa de vitória de meia dúzia de jogos não pode ter a cara de uma de
 * milhares.
 *
 * POR QUE ISTO EXISTE
 *
 * As duas fontes foram comparadas sobre o mesmo par mapa/brawler, agrupadas por
 * uso, na snapshot `live-20260918174340`: abaixo de 1 % de uso discordam 7 a 10
 * pontos; acima de 5 % discordam 2. Cinco vezes mais ruído em baixo.
 *
 * Os casos deste ficheiro são REAIS, copiados dessa snapshot — não inventados.
 * É o que faltou ao primeiro teste do `rankedStatus`, que passou a validar uma
 * suposição minha enquanto a regra não marcava ninguém.
 */
describe("linhas que assentam em poucos jogos", () => {
  /** Casos reais da snapshot `live-20260918174340`. */
  const sam = { topBrawlWinRate: 18.18, brawlPlanetWinRate: 60.00, topBrawlUseRate: 0.1, brawlPlanetPickRate: 0.2 };
  const bonnie = { topBrawlWinRate: 9.68, brawlPlanetWinRate: 48.80, topBrawlUseRate: 0.3, brawlPlanetPickRate: 0.4 };
  const jogado = { topBrawlWinRate: 51.4, brawlPlanetWinRate: 52.1, topBrawlUseRate: 14.9, brawlPlanetPickRate: 15.4 };

  it("assinala o pior caso da produção: 42 pontos entre as fontes", () => {
    const confianca = avaliarConfianca(sam);
    expect(confianca.poucosJogos).toBe(true);
    expect(confianca.fontesDiscordam).toBe(true);
    expect(confianca.diferencaEntreFontes).toBeCloseTo(41.82, 2);
    expect(explicarConfianca(confianca)).toContain("ruído");
  });

  it("assinala uma taxa de 9,68% que é ruído, e não um brawler mau", () => {
    expect(avaliarConfianca(bonnie).poucosJogos).toBe(true);
  });

  it("não assinala quem é muito jogado e sobre quem as fontes concordam", () => {
    const confianca = avaliarConfianca(jogado);
    expect(confianca.poucosJogos).toBe(false);
    expect(confianca.fontesDiscordam).toBe(false);
    expect(explicarConfianca(confianca)).toBeNull();
  });

  /**
   * A regra que impede esta marca de se tornar uma mentira nova: uso
   * DESCONHECIDO não é uso baixo. Sem o número não se sabe, e responder na
   * mesma seria o erro que isto existe para corrigir.
   */
  it("uso desconhecido não conta como pouco jogado", () => {
    const confianca = avaliarConfianca({ topBrawlWinRate: 50, brawlPlanetWinRate: 50, topBrawlUseRate: null, brawlPlanetPickRate: null });
    expect(confianca.poucosJogos).toBe(false);
    expect(confianca.diferencaEntreFontes).toBe(0);
  });

  it("uma fonte só não inventa discordância nenhuma", () => {
    const confianca = avaliarConfianca({ topBrawlWinRate: 20, brawlPlanetWinRate: null, topBrawlUseRate: 8 });
    expect(confianca.diferencaEntreFontes).toBeNull();
    expect(confianca.fontesDiscordam).toBe(false);
    expect(confianca.poucosJogos).toBe(false);
  });

  it("o uso maior das duas fontes é o que manda", () => {
    // Uma fonte diz 0,2% e a outra 3%: houve jogos, e não se finge o contrário.
    expect(avaliarConfianca({ topBrawlUseRate: 0.2, brawlPlanetPickRate: 3 }).poucosJogos).toBe(false);
  });

  it("os limiares são os que a medição justifica", () => {
    expect(USO_MINIMO_CONFIAVEL).toBe(1);
    expect(DISCORDANCIA_GRITANTE).toBe(10);
  });

  /** O ecrã tem de usar isto, senão a medição fica num módulo que ninguém lê. */
  it("o Full Source Readout mostra a marca", () => {
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain("avaliarConfianca(row)");
    expect(home).toContain("marca-amostra");
  });
});
