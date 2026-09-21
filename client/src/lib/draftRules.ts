import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultDraftRuleSettings,
  draftRuleSettingKeys,
  isCounterMultiplierKey,
  normalizeDraftRuleSettings,
  COUNTER_PICK_MULTIPLIER_MAX,
  COUNTER_PICK_MULTIPLIER_MIN,
  type DraftRuleSettings,
} from "@shared/draftRules";

export const DRAFT_RULES_STORAGE_KEY = "brawl-hibrido:global-draft-rules:v1";
export const DRAFT_RULES_EVENT = "brawl-hibrido:global-draft-rules";

/** Valores em percentagem para a interface e o localStorage (5 significa 5%). */
export type DraftRulePreference = Record<keyof DraftRuleSettings, number>;

/**
 * Tira o lixo de vírgula flutuante de um número antes de ele chegar ao ecrã.
 *
 * `0.035 * 100` não dá 3,5 em JavaScript — dá 3,5000000000000004. O campo do
 * Enemy Counter mostrava esse número inteiro, cortado pela largura da caixa
 * como "3.500000", e quem o visse ficava convencido de que o site guardava
 * percentagens com seis casas decimais. Nenhuma regra precisa de mais do que
 * uma ou duas, por isso seis casas chegam de sobra para não perder nada que
 * alguém tenha escrito de propósito.
 *
 * É limpo à entrada E no valor de fábrica, de propósito: se só fosse num dos
 * lados, uma preferência já gravada passaria a ser diferente do padrão por
 * causa do lixo, e o painel anunciava "regras personalizadas" a quem nunca
 * mexeu em nada.
 */
function semLixoDecimal(value: number) {
  return Number(value.toFixed(6));
}

export const defaultDraftRulePreference: DraftRulePreference = draftRuleSettingKeys.reduce((preference, key) => {
  // Os multiplicadores guardam-se tal como são; as regras percentuais, em 0–100.
  preference[key] = isCounterMultiplierKey(key) ? defaultDraftRuleSettings[key] : semLixoDecimal(defaultDraftRuleSettings[key] * 100);
  return preference;
}, {} as DraftRulePreference);

function normalizePercentage(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return semLixoDecimal(Math.min(100, Math.max(0, value)));
}

/**
 * Aceita qualquer valor dentro do intervalo permitido, e não apenas os degraus
 * oferecidos nos botões: quem quiser 1,3× pode escrevê-lo.
 */
function normalizeMultiplier(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return semLixoDecimal(Math.min(COUNTER_PICK_MULTIPLIER_MAX, Math.max(COUNTER_PICK_MULTIPLIER_MIN, value)));
}

function normalizePreference(value: unknown): DraftRulePreference | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DraftRulePreference>;
  /**
   * Preferências gravadas antes do ajuste por pick trazem só o valor único.
   * Herdá-lo para os seis picks evita que quem tinha o Counter em 2× volte
   * silenciosamente a 1× ao atualizar o site.
   */
  const herdado = typeof candidate.counterPickMultiplier === "number" && Number.isFinite(candidate.counterPickMultiplier)
    ? candidate.counterPickMultiplier
    : undefined;

  return draftRuleSettingKeys.reduce((preference, key) => {
    if (!isCounterMultiplierKey(key)) {
      preference[key] = normalizePercentage(candidate[key], defaultDraftRulePreference[key]);
      return preference;
    }
    const proprio = candidate[key];
    const base = typeof proprio === "number" && Number.isFinite(proprio)
      ? proprio
      : key === "counterPickMultiplier" ? defaultDraftRulePreference[key] : herdado ?? defaultDraftRulePreference[key];
    preference[key] = normalizeMultiplier(base, defaultDraftRulePreference[key]);
    return preference;
  }, {} as DraftRulePreference);
}

export function readDraftRulePreference(): DraftRulePreference {
  if (typeof window === "undefined") return defaultDraftRulePreference;
  try {
    return normalizePreference(JSON.parse(window.localStorage.getItem(DRAFT_RULES_STORAGE_KEY) ?? "null"))
      ?? defaultDraftRulePreference;
  } catch {
    return defaultDraftRulePreference;
  }
}

export function toDraftRuleSettings(preference: DraftRulePreference): DraftRuleSettings {
  const rates = draftRuleSettingKeys.reduce((settings, key) => {
    settings[key] = isCounterMultiplierKey(key) ? preference[key] : preference[key] / 100;
    return settings;
  }, {} as DraftRuleSettings);
  return normalizeDraftRuleSettings(rates);
}

export function writeDraftRulePreference(preference: DraftRulePreference): DraftRulePreference {
  const normalized = normalizePreference(preference) ?? defaultDraftRulePreference;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DRAFT_RULES_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(DRAFT_RULES_EVENT));
  }
  return normalized;
}

export function useDraftRules() {
  const [preference, setPreference] = useState<DraftRulePreference>(readDraftRulePreference);

  useEffect(() => {
    const sync = () => setPreference(readDraftRulePreference());
    window.addEventListener("storage", sync);
    window.addEventListener(DRAFT_RULES_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(DRAFT_RULES_EVENT, sync);
    };
  }, []);

  const updatePreference = useCallback((next: DraftRulePreference) => {
    const normalized = writeDraftRulePreference(next);
    setPreference(normalized);
    return normalized;
  }, []);
  const resetPreference = useCallback(() => updatePreference(defaultDraftRulePreference), [updatePreference]);
  const rules = useMemo(() => toDraftRuleSettings(preference), [preference]);
  const hasCustomRules = draftRuleSettingKeys.some((key) => preference[key] !== defaultDraftRulePreference[key]);

  return { preference, rules, hasCustomRules, updatePreference, resetPreference };
}
