import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AnaliseApi } from "./AnaliseApi";
import { PainelDoMotorApi } from "./PainelDoMotorApi";
import { configDeFabrica } from "@shared/configDoMotorApi";
import type { ResultadoDaCalibracao } from "@shared/calibracaoDoMotorApi";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const calibracao = (extra: Partial<ResultadoDaCalibracao> = {}): ResultadoDaCalibracao => ({
  geradoEm: "2026-11-14T05:00:00Z", corteDeValidacao: 0,
  amostras: { treino: 900_000, ajuste: 300_000, validacao: 120_000 },
  pesos: { forca: 0.8, counter: 0.6, sinergia: 1.1 },
  qualidade: { logLoss: 0.68, referencia: Math.LN2, soForca: 0.686, acerto: 0.553 },
  curva: [], aprovada: true, ...extra,
});

const analise = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(AnaliseApi, { lanes: [], inimigos: [], aberta: false, onAlternar: () => {}, ...props } as never));

describe("chance da equipa na análise", () => {
  it("mostra a chance e de onde vem, quando a calibração está aprovada", () => {
    const html = analise({ chanceDaEquipa: { chance: 54.2 }, calibracao: calibracao() });
    expect(html).toContain("54.2%");
    expect(html).toContain("120");
    expect(html).toContain("55.3%");
    expect(html).toContain("ao acaso seria 50%");
  });

  it("não inventa uma chance sem calibração aprovada", () => {
    expect(analise({ chanceDaEquipa: { chance: 54.2 }, calibracao: calibracao({ aprovada: false, motivo: "x" }) })).not.toContain("Chance da equipa");
    expect(analise({ chanceDaEquipa: { chance: 54.2 }, calibracao: null })).not.toContain("Chance da equipa");
    expect(analise({ chanceDaEquipa: null, calibracao: calibracao() })).not.toContain("Chance da equipa");
  });
});

const painel = (c: ResultadoDaCalibracao | null | undefined) =>
  renderToStaticMarkup(createElement(PainelDoMotorApi, {
    config: configDeFabrica(), preset: "padrao", onCampo: vi.fn(), onPick: vi.fn(), onProporcao: vi.fn(), onPreset: vi.fn(), onRepor: vi.fn(),
    calibracao: c, onCalibrar: vi.fn(),
  }));

describe("calibração no painel", () => {
  it("mostra a qualidade medida, os pesos e o botão de aplicar", () => {
    const html = painel(calibracao());
    expect(html).toContain("acerta 55.3%");
    expect(html).toContain("counter 0.60");
    expect(html).toContain("Aplicar calibração");
  });

  it("não aprovada: diz porquê e não oferece aplicar", () => {
    const html = painel(calibracao({ aprovada: false, motivo: "O modelo não bate o acaso nas partidas mais recentes." }));
    expect(html).toContain("Não aprovada: O modelo não bate o acaso");
    expect(html).not.toContain("Aplicar calibração");
  });

  it("sem resultado ainda, explica quando chega", () => {
    expect(painel(null)).toContain("ainda sem resultado");
  });
});
