import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { AnaliseApi } from "./AnaliseApi";
import { RecomendacaoApi } from "./RecomendacaoApi";
import {
  ranquearCandidatosApiPerfeito,
  type ResultadoRecomendacaoApi,
} from "@shared/motorApiPerfeito";
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const neutro = () =>
  ranquearCandidatosApiPerfeito({
    disponiveisIds: ["Colt", "Bull"],
    aliadosIds: [],
    inimigosIds: [],
    modoDeJogo: "heist",
    estatisticasMapa: {},
    obterConfronto: () => undefined,
    obterSinergia: () => undefined,
    perfisTaticos: {},
  })[0];
const renderizar = (resultado: ResultadoRecomendacaoApi) =>
  renderToStaticMarkup(
    React.createElement(RecomendacaoApi, {
      nome: resultado.brawlerId,
      imagem: null,
      resultado,
      index: 0,
      expanded: true,
      locked: false,
      onSelect: () => {},
    })
  );

it("oculta fatores neutros e termos internos sem inventar uma chance acima de 50%", () => {
  const html = renderizar(neutro());
  expect(html).toContain("50.0%");
  expect(html).toContain("CHANCE ESTIMADA");
  expect(html).not.toMatch(/logit|log-odds|0\.000|<dt>/i);
  expect(html).toContain("Sem vantagem clara");
});

it("mostra impactos percentuais não nulos e tags distintas para aliados, counter e riscos", () => {
  const r = neutro();
  r.fatoresPercentuais = {
    ...r.fatores,
    counterLiquidoLogit: 5.8,
    sinergiaRealLogit: 3.2,
    penalidadeHardCounterLogit: -3.4,
  };
  r.melhorAlvoInimigo = "Brock";
  r.melhorAliado = "Gus";
  r.alertaHardCounter = ["Mortis"];
  r.piorRespostaFuturaInimiga = "Edgar";
  const html = renderizar(r);
  expect(html.match(/<dt>/g)).toHaveLength(3);
  expect(html).toContain("+5.8%");
  expect(html).toContain("−3.4%");
  expect(html).toContain("Counter contra Brock");
  expect(html).toContain("Sinergia com Gus");
  expect(html).toContain('class="api-tag api-veto"');
  expect(html).toContain('class="api-tag api-risco"');
  expect(html).not.toMatch(/logit|log-odds/i);
});

it("mostra a visão inimiga apenas quando aberta e três rotas com vantagens percentuais", () => {
  const props = {
    lanes: [
      {
        aliadoId: "Gus",
        inimigoId: "Brock",
        posicaoSugerida: "Mid" as const,
        vantagemLogit: 0.2,
        vantagemPercentualEstimada: 55,
      },
    ],
    inimigos: [],
    onAlternar: () => {},
  };
  const aberta = renderToStaticMarkup(
    React.createElement(AnaliseApi, { ...props, aberta: true })
  );
  const fechada = renderToStaticMarkup(
    React.createElement(AnaliseApi, { ...props, aberta: false })
  );
  expect(aberta).toContain("Visão do Inimigo");
  expect(aberta).toContain("Gus");
  expect(aberta).toContain("contra Brock");
  for (const nome of ["Lateral Esquerda", "Meio (Mid)", "Lateral Direita"])
    expect(aberta).toContain(nome);
  expect(aberta).toContain("+5.0%");
  expect(aberta).not.toContain("0.200");
  expect(aberta).toContain("Possíveis escolhas do adversário");
  expect(fechada).not.toContain("Possíveis escolhas do adversário");
});
