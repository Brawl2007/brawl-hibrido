import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PainelDoMotorApi } from "./PainelDoMotorApi";
import { linhasDoCartao } from "./RecomendacaoApi";
import { configDeFabrica, configDoPreset } from "@shared/configDoMotorApi";

const painel = (config = configDeFabrica(), preset: "padrao" | "personalizado" = "padrao") =>
  renderToStaticMarkup(createElement(PainelDoMotorApi, {
    config, preset, onCampo: vi.fn(), onPick: vi.fn(), onProporcao: vi.fn(), onPreset: vi.fn(), onRepor: vi.fn(),
  }));

describe("painel da configuração do motor com API", () => {
  it("mostra a distribuição dos seis picks, os presets e todos os grupos de regras", () => {
    const html = painel();
    for (const n of [1, 2, 3, 4, 5, 6]) expect(html).toContain(`Counter % no pick ${n}`);
    for (const texto of ["Padrão (v181)", "Counter forte", "Mapa primeiro", "Bônus", "Desbônus", "Bans", "Quem pode ser recomendado", "Confiança e tetos"]) expect(html).toContain(texto);
  });

  it("inclui o desbônus de quando o counter já foi escolhido e os controlos novos", () => {
    const html = painel();
    for (const texto of ["Counterado", "Hard-counter", "Anti-sinergia", "Caminho livre pelos bans", "Função escassa após bans", "Counter já coberto", "Pressão por aliado", "Influência dos bans"]) expect(html).toContain(texto);
  });

  it("indica o valor de fábrica de um controlo alterado e deixa repor o padrão", () => {
    const alterada = configDoPreset("counterForte");
    const html = painel(alterada, "personalizado");
    expect(html).toContain("de fábrica: 1,35");
    expect(html).toMatch(/Restaurar padrão/);
    expect(painel()).toMatch(/<button[^>]*disabled[^>]*>.*Restaurar padrão/s);
  });
});

describe("linhas do cartão de recomendação", () => {
  const impactos = { forcaMapaLogit: 5, counterLiquidoLogit: 3, penalidadeHardCounterLogit: 0, sinergiaRealLogit: -1, riscoMinimaxLogit: 0, penalidadeTaticaLogit: 0, ajustePoucoUsoLogit: 0, alivioBanLogit: 0, escassezFuncaoLogit: 0, guardaCostasLogit: 0, respostaTaticaLogit: 0 };

  it("sem detalhes, mostra o counter e a sinergia somados, como antes", () => {
    expect(linhasDoCartao(impactos).map((l) => l.nome)).toEqual(["Força neste mapa", "Resposta aos inimigos", "Combinação com aliados"]);
  });

  it("com detalhes, separa counter e counterado, sinergia e anti-sinergia", () => {
    const linhas = linhasDoCartao(impactos, { counter: 4, counterado: -1, sinergia: 0.01, antiSinergia: -1 });
    expect(linhas.map((l) => [l.chave, l.valor])).toEqual([["forcaMapaLogit", 5], ["counter", 4], ["counterado", -1], ["antiSinergia", -1]]);
    expect(linhas.find((l) => l.chave === "counterado")!.nome).toMatch(/Counterado/);
  });
});
