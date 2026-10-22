import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resumirPartidas } from "@shared/partidasObservadas";

const mocks = vi.hoisted(() => ({ consulta: {} as Record<string, unknown>, recolha: {} as Record<string, unknown> }));
vi.mock("@/lib/trpc", () => ({ trpc: { observedMatches: {
  partidas: { useQuery: () => mocks.consulta }, status: { useQuery: () => mocks.recolha },
} } }));
vi.mock("@/hooks/useApiOficial", () => ({ useApiOficial: () => ({ dias: 1, rank: "", setDias: vi.fn(), setRank: vi.fn() }) }));
vi.mock("lucide-react", () => ({ ArrowDown: () => null, ArrowUp: () => null, Database: () => null, Handshake: () => null, Search: () => null, Swords: () => null, UserRound: () => null, Users: () => null }));
vi.mock("@/components/BarraDoSite", () => ({ BarraDoSite: () => null }));
vi.mock("@/components/MobileNav", () => ({ MobileNav: () => null }));
vi.mock("@/components/Retrato", () => ({ Retrato: () => null }));
vi.mock("@/components/SeletorDePeriodo", () => ({ SeletorDePeriodo: () => null }));
vi.mock("@/components/SeletorDeRank", () => ({ SeletorDeRank: () => null }));
vi.mock("@/lib/imagemDoMapa", () => ({ mapImageFor: () => null }));
vi.mock("@/lib/visualDasPartidas", () => ({ CORES_DOS_MODOS: {}, retratoDe: () => "" }));
import Partidas from "./Partidas";

beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.consulta = { isError: false, isLoading: false, isFetching: false };
  mocks.recolha = { data: { coverage: { battles: 752266 } } };
});

afterEach(() => vi.unstubAllGlobals());

describe("o painel distingue erros, carregamento e um filtro vazio", () => {
  it("mostra indisponível, sem anunciar zero partidas nem reutilizar dados após erro", () => {
    mocks.consulta = { isError: true, data: { ...resumirPartidas([]), partidas: 42 }, refetch: vi.fn() };
    const html = renderToStaticMarkup(React.createElement(Partidas));
    expect(html).toContain("<b>—</b>");
    expect(html).toContain("Isto não significa que existam zero partidas");
    expect(html).toContain("Tentar novamente");
    expect(html).not.toContain("<b>0</b>");
    expect(html).not.toContain("<b>42</b>");
  });

  it("um filtro vazio informa que existem partidas guardadas e permite limpar os filtros", () => {
    mocks.consulta.data = { ...resumirPartidas([]), mapas: [], modos: [] };
    const html = renderToStaticMarkup(React.createElement(Partidas));
    expect(html).toContain("partidas guardadas no total");
    expect(html).toContain("nenhuma corresponde a este filtro");
    expect(html).toContain("Ver todos os dados guardados");
    expect(html).toContain("<b>0</b>");
  });

  it("enquanto carrega não afirma que a base está vazia", () => {
    mocks.consulta.isLoading = true;
    const html = renderToStaticMarkup(React.createElement(Partidas));
    expect(html).toContain("A contar as partidas");
    expect(html).toContain("<b>—</b>");
    expect(html).not.toContain("<b>0</b>");
  });
});
