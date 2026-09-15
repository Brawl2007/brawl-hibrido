export const EXPERIMENTAL_DRAFT_WEIGHTS_STORAGE_KEY = "brawl-lab-draft-weights";
export const EXPERIMENTAL_DRAFT_WEIGHTS_EVENT = "brawl-hibrido:experimental-draft-weights";

export type ExperimentalDraftWeightsPreference = {
  active: boolean;
  brawlPlanet: number;
  topBrawl: number;
};

function normalizeBrawlPlanetWeight(value: unknown) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : 80;
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

export function readExperimentalDraftWeights(): ExperimentalDraftWeightsPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(EXPERIMENTAL_DRAFT_WEIGHTS_STORAGE_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return null;
    const candidate = stored as Partial<ExperimentalDraftWeightsPreference>;
    if (typeof candidate.active !== "boolean" || typeof candidate.brawlPlanet !== "number") return null;
    const brawlPlanet = normalizeBrawlPlanetWeight(candidate.brawlPlanet);
    return { active: candidate.active, brawlPlanet, topBrawl: 100 - brawlPlanet };
  } catch {
    return null;
  }
}

export function writeExperimentalDraftWeights(preference: ExperimentalDraftWeightsPreference) {
  const brawlPlanet = normalizeBrawlPlanetWeight(preference.brawlPlanet);
  const normalized: ExperimentalDraftWeightsPreference = {
    active: Boolean(preference.active),
    brawlPlanet,
    topBrawl: 100 - brawlPlanet,
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(EXPERIMENTAL_DRAFT_WEIGHTS_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(EXPERIMENTAL_DRAFT_WEIGHTS_EVENT));
  }
  return normalized;
}
