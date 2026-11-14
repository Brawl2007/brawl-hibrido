import { describe, expect, it } from "vitest";
import {
  LIMITES_DO_RITMO,
  PASSO_DE_SUBIDA,
  RITMO_INICIAL,
  ajustarRitmoDaRecolha,
  lerRitmo,
  lugaresDaListaNaVolta,
  normalizarRitmo,
} from "./ritmoDaRecolha";

const limpa = (pedidos = 240) => ({ pedidos, limitados: 0, falhas: 0, completa: true });

describe("ritmo da recolha", () => {
  it("começa nos 240 jogadores e sobe 60 por volta limpa, até ao teto", () => {
    let ritmo = { ...RITMO_INICIAL };
    ritmo = ajustarRitmoDaRecolha(ritmo, limpa());
    expect(ritmo.jogadores).toBe(240 + PASSO_DE_SUBIDA);
    for (let i = 0; i < 20; i++) ritmo = ajustarRitmoDaRecolha(ritmo, limpa());
    expect(ritmo).toEqual({ jogadores: LIMITES_DO_RITMO.jogadoresMax, concorrencia: LIMITES_DO_RITMO.concorrenciaMax });
  });

  it("com respostas 429, corta para metade e reduz os pedidos em simultâneo", () => {
    const depois = ajustarRitmoDaRecolha({ jogadores: 600, concorrencia: 12 }, { pedidos: 600, limitados: 5, falhas: 0, completa: true });
    expect(depois).toEqual({ jogadores: 300, concorrencia: 10 });
    // Até ao mínimo, nunca abaixo.
    let ritmo = { jogadores: 600, concorrencia: 12 };
    for (let i = 0; i < 10; i++) ritmo = ajustarRitmoDaRecolha(ritmo, { pedidos: 100, limitados: 50, falhas: 0, completa: true });
    expect(ritmo).toEqual({ jogadores: LIMITES_DO_RITMO.jogadoresMin, concorrencia: LIMITES_DO_RITMO.concorrenciaMin });
  });

  it("um único 429 em muitos pedidos não corta, mas também não deixa subir se for >= 2%", () => {
    expect(ajustarRitmoDaRecolha({ jogadores: 600, concorrencia: 12 }, { pedidos: 600, limitados: 2, falhas: 0, completa: true }).jogadores).toBe(660);
    expect(ajustarRitmoDaRecolha({ jogadores: 600, concorrencia: 12 }, { pedidos: 100, limitados: 2, falhas: 0, completa: true }).jogadores).toBe(300);
  });

  it("se o tempo acabou antes de ler todos, pede menos; com muitas falhas, mantém", () => {
    expect(ajustarRitmoDaRecolha({ jogadores: 600, concorrencia: 10 }, { pedidos: 400, limitados: 0, falhas: 0, completa: false })).toEqual({ jogadores: 480, concorrencia: 10 });
    expect(ajustarRitmoDaRecolha({ jogadores: 600, concorrencia: 10 }, { pedidos: 600, limitados: 0, falhas: 100, completa: true })).toEqual({ jogadores: 600, concorrencia: 10 });
  });

  it("enquanto a migração não acaba, não sobe; mas corta na mesma com 429", () => {
    expect(ajustarRitmoDaRecolha({ jogadores: 240, concorrencia: 10 }, { ...limpa(), podeSubir: false })).toEqual({ jogadores: 240, concorrencia: 10 });
    expect(ajustarRitmoDaRecolha({ jogadores: 240, concorrencia: 10 }, { pedidos: 100, limitados: 5, falhas: 0, completa: true, podeSubir: false }).jogadores).toBe(120);
  });

  it("uma volta sem pedidos não muda nada", () => {
    expect(ajustarRitmoDaRecolha({ jogadores: 300, concorrencia: 8 }, { pedidos: 0, limitados: 0, falhas: 0, completa: true })).toEqual({ jogadores: 300, concorrencia: 8 });
  });

  it("lê o estado guardado e recupera de lixo", () => {
    expect(lerRitmo(JSON.stringify({ jogadores: 400, concorrencia: 6 }))).toEqual({ jogadores: 400, concorrencia: 6 });
    expect(lerRitmo(null)).toEqual(RITMO_INICIAL);
    expect(lerRitmo("{lixo")).toEqual(RITMO_INICIAL);
    expect(normalizarRitmo({ jogadores: 99999, concorrencia: -3 })).toEqual({ jogadores: LIMITES_DO_RITMO.jogadoresMax, concorrencia: LIMITES_DO_RITMO.concorrenciaMin });
  });

  it("os rankings guardam sempre uma fatia para descobrir jogadores", () => {
    expect(lugaresDaListaNaVolta(240)).toBe(240 - 29);
    expect(lugaresDaListaNaVolta(720)).toBe(720 - 87);
    expect(lugaresDaListaNaVolta(120)).toBe(105);
  });
});
