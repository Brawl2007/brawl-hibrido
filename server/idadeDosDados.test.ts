import { describe, expect, it } from "vitest";
import {
  LIMITE_DE_CONFIANCA_MS,
  dadosVelhos,
  descreverFrescura,
  idadeEmPalavras,
  leituraMaisAntiga,
} from "@shared/idadeDosDados";

/**
 * O ecrã dizia "Dados agora mesmo" por cima de números lidos no dia anterior.
 *
 * A causa não era um erro de cálculo: era estar a medir a coisa errada. A
 * snapshot só tinha a hora em que a SINCRONIZAÇÃO correu, e a sincronização
 * automática volta a publicar as capturas do navegador com a hora de agora.
 * Dados frescos e dados velhos ficavam indistinguíveis — que é a pior forma de
 * os velhos ficarem, porque ninguém vai procurar um problema que o ecrã diz
 * não existir.
 */
describe("idade real dos dados", () => {
  const agora = new Date("2026-09-18T12:00:00.000Z").getTime();
  const horas = (n: number) => new Date(agora - n * 3600_000).toISOString();

  it("usa a leitura mais antiga, não a mais recente", () => {
    // Um mapa lido agora não rejuvenesce os outros vinte e cinco.
    expect(leituraMaisAntiga({ topBrawl: horas(30), brawlPlanet: horas(0) })).toBe(horas(30));
  });

  it("ignora a fonte que não trouxe nada, em vez de a contar como velha", () => {
    expect(leituraMaisAntiga({ topBrawl: null, brawlPlanet: horas(2) })).toBe(horas(2));
  });

  /** Sem leitura nenhuma a resposta honesta é "não sei", nunca "foi agora". */
  it.each([
    ["sem campo", undefined],
    ["com as duas fontes vazias", { topBrawl: null, brawlPlanet: null }],
    ["com uma data ilegível", { topBrawl: "ontem à tarde", brawlPlanet: null }],
  ])("não inventa uma data %s", (_, fontes) => {
    expect(leituraMaisAntiga(fontes)).toBeNull();
    expect(descreverFrescura(fontes, agora).idade).toBeNull();
    expect(descreverFrescura(fontes, agora).rotulo).toBe("Idade dos dados desconhecida");
    // E ausência de data não é dado velho: é dado sem idade conhecida.
    expect(descreverFrescura(fontes, agora).velho).toBe(false);
  });

  it.each([
    [0, "agora mesmo"],
    [0.5, "há 30 min"],
    [3, "há 3 h"],
    [26, "há 1 dia"],
    [72, "há 3 dias"],
  ])("diz a idade em palavras (%s h)", (h, esperado) => {
    expect(idadeEmPalavras(horas(h), agora)).toBe(esperado);
  });

  /**
   * O limite são dois dias porque a recolha automática corre uma vez por dia:
   * um dia sem leitura nova é o normal, dois já quer dizer que alguma coisa
   * parou — e é aí que o ecrã tem de falar em vez de continuar calado.
   */
  it("avisa a partir de dois dias sem leitura nova", () => {
    expect(LIMITE_DE_CONFIANCA_MS).toBe(48 * 3600_000);
    expect(dadosVelhos(horas(47), agora)).toBe(false);
    expect(dadosVelhos(horas(49), agora)).toBe(true);
    expect(descreverFrescura({ topBrawl: horas(49), brawlPlanet: horas(1) }, agora)).toMatchObject({
      velho: true,
      idade: "há 2 dias",
    });
  });
});
