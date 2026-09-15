export const brawlScopeModes = [
  { id: "gemGrab", label: "Pique-Gema", modeId: "gem-grab" },
  { id: "brawlBall", label: "Fute-Brawl", modeId: "brawl-ball" },
  { id: "knockout", label: "Nocaute", modeId: "knockout" },
  { id: "heist", label: "Roubo", modeId: "heist" },
  { id: "hotZone", label: "Zona Estratégica", modeId: "hot-zone" },
  { id: "bounty", label: "Caça-Estrelas", modeId: "bounty" },
] as const;

export type BrawlScopeModeId = (typeof brawlScopeModes)[number]["id"];
export type RankedModeId = (typeof brawlScopeModes)[number]["modeId"];

export function brawlScopeModeForId(modeId: string | null | undefined) {
  return brawlScopeModes.find((mode) => mode.id === modeId);
}

export function brawlScopeModeForRankedMode(modeId: string | null | undefined) {
  return brawlScopeModes.find((mode) => mode.modeId === modeId);
}

/** Aceita tanto o id editorial do BrawlScope quanto o id kebab-case do Ranked/Draft. */
export function normalizeBrawlScopeModeId(modeId: string | null | undefined): BrawlScopeModeId | undefined {
  if (!modeId) return undefined;
  return brawlScopeModeForId(modeId)?.id ?? brawlScopeModeForRankedMode(modeId)?.id;
}
