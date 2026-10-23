import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
import { AnaliseApi } from "./AnaliseApi";
import { RecomendacaoApi } from "./RecomendacaoApi";
import { ranquearCandidatosApiPerfeito } from "@shared/motorApiPerfeito";

it("apresenta sete fatores, chance estimada, alvo e resposta com a mesma recomendação calculada", () => {
  const resultado = ranquearCandidatosApiPerfeito({
    disponiveisIds: ["Colt", "Bull"],
    aliadosIds: [],
    inimigosIds: ["Brock"],
    modoDeJogo: "heist",
    estatisticasMapa: {},
    obterConfronto: () => undefined,
    obterSinergia: () => undefined,
    perfisTaticos: {},
  })[0];
  const html = renderToStaticMarkup(
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
  expect(html).toContain("CHANCE ESTIMADA");
  expect(html).toContain(`${resultado.winProbability.toFixed(1)}%`);
  expect(html.match(/<dt>/g)).toHaveLength(7);
  expect(html).toContain("Melhor alvo:");
  expect(html).toContain("Resposta possível:");
  expect(html).toContain("sem calibração empírica");
});

it("mostra a visão inimiga apenas quando aberta e mantém os pareamentos visíveis", () => {
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
  expect(aberta).toContain("Gus contra Brock");
  expect(aberta).toContain("Possíveis escolhas do adversário");
  expect(fechada).not.toContain("Possíveis escolhas do adversário");
});
