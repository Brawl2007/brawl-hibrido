import { describe, expect, it } from "vitest";
import { draftRuleSettingKeys, isCounterMultiplierKey } from "@shared/draftRules";
import { defaultDraftRulePreference, readDraftRulePreference, writeDraftRulePreference, DRAFT_RULES_STORAGE_KEY } from "../client/src/lib/draftRules";

/**
 * Os números que os campos das regras mostram.
 *
 * Nenhum destes testes é sobre o motor: é sobre o que aparece escrito. Mas um
 * campo que mostra outra coisa que não o valor guardado faz duvidar de todos
 * os outros números do painel, incluindo os que estão certos — e é por isso
 * que vale um teste.
 */

function comArmazenamentoLocal(corpo: (dados: Map<string, string>) => void) {
  const dados = new Map<string, string>();
  const anterior = globalThis.window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (chave: string) => dados.get(chave) ?? null,
      setItem: (chave: string, valor: string) => void dados.set(chave, valor),
    },
    dispatchEvent: () => true,
  };
  (globalThis as { CustomEvent?: unknown }).CustomEvent = class { constructor(public type: string) {} };
  try {
    corpo(dados);
  } finally {
    (globalThis as { window?: unknown }).window = anterior;
  }
}

describe("os campos das regras mostram números limpos", () => {
  it("nenhum valor de fábrica traz lixo de vírgula flutuante", () => {
    // `0.035 * 100` dá 3.5000000000000004 em JavaScript. O campo do Enemy
    // Counter mostrava isso, cortado pela caixa como "3.500000".
    for (const key of draftRuleSettingKeys) {
      const valor = defaultDraftRulePreference[key];
      expect(String(valor).length, `${key} = ${valor}`).toBeLessThanOrEqual(6);
      expect(String(valor), `${key}`).not.toMatch(/\d{7,}/);
    }
  });

  it("o Enemy Counter recalibrado mostra 12%", () => {
    expect(defaultDraftRulePreference.enemyCounterPenalty).toBe(12);
    // A ida e volta para o motor tem de continuar a dar a taxa original.
    expect(defaultDraftRulePreference.enemyCounterPenalty / 100).toBeCloseTo(0.12, 10);
  });

  it("uma preferência já gravada COM lixo não passa a contar como personalizada", () => {
    /*
     * Este é o risco de limpar só num dos lados. Quem gravou preferências antes
     * desta correção tem 3.5000000000000004 no armazenamento. Se o valor de
     * fábrica passasse a 3.5 e a leitura não limpasse, os dois deixavam de ser
     * iguais — e o painel anunciava "regras personalizadas ativas" a quem nunca
     * tocou em nada, com o botão de restaurar aceso sem haver o que restaurar.
     */
    comArmazenamentoLocal((dados) => {
      dados.set(DRAFT_RULES_STORAGE_KEY, JSON.stringify({
        ...defaultDraftRulePreference,
        enemyCounterPenalty: 12.000000000000002,
        sameClassPenalty: 9.999999999999998,
      }));
      const lido = readDraftRulePreference();
      const personalizadas = draftRuleSettingKeys.filter((key) => lido[key] !== defaultDraftRulePreference[key]);
      expect(personalizadas).toEqual([]);
    });
  });

  it("um valor escrito de propósito com decimais sobrevive", () => {
    // Limpar o lixo não pode arredondar o que alguém escreveu a sério.
    comArmazenamentoLocal(() => {
      const gravado = writeDraftRulePreference({ ...defaultDraftRulePreference, synergyPick1: 9.5, winRatePick1: 12.5 });
      expect(gravado.synergyPick1).toBe(9.5);
      expect(gravado.winRatePick1).toBe(12.5);
      expect(readDraftRulePreference().synergyPick1).toBe(9.5);
    });
  });

  it("os multiplicadores de Counter também entram limpos", () => {
    for (const key of draftRuleSettingKeys.filter(isCounterMultiplierKey)) {
      expect(String(defaultDraftRulePreference[key])).not.toMatch(/\d{7,}/);
    }
  });
});


describe("calibração da escada na v179", () => {
  const chaves = ["winRatePick1","winRatePick2","winRatePick3","winRatePick4","winRatePick5","winRatePick6"] as const;
  const anterior = Object.fromEntries(chaves.map((k,i)=>[k,[90,85,80,72,65,55][i]]));
  it("migra a escada antiga de fábrica preservando ajustes independentes", () => {
    comArmazenamentoLocal(dados => {
      dados.set(DRAFT_RULES_STORAGE_KEY,JSON.stringify({...defaultDraftRulePreference,...anterior,synergyPick4:9.5}));
      const lido=readDraftRulePreference();
      expect(chaves.map(k=>lido[k])).toEqual([70,75,80,85,90,95]);
      expect(lido.synergyPick4).toBe(9.5);
    });
  });
  it("preserva uma escada personalizada explicitamente guardada na v179", () => {
    comArmazenamentoLocal(() => {
      writeDraftRulePreference({...defaultDraftRulePreference,...anterior});
      expect(chaves.map(k=>readDraftRulePreference()[k])).toEqual([90,85,80,72,65,55]);
    });
  });
});
