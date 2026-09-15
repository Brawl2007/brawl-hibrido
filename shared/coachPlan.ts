import { formatMatchupPercent } from "./counterMatchupValue";
import { getBrawlerBuild, getCounterMatchup, getPositionRecommendation, getTacticalPlan, type CoachComposition, type DraftTeam, type DraftPosition } from "./draft";

export type CoachPlanRow = { brawler: string };
export type CoachPlanEstimate = { blueWinProbability: number; redWinProbability: number; advantageLabel: string };

const positionLabel = (position: DraftPosition) => position === "mid" ? "Mid" : position === "left" ? "Side esquerdo" : "Side direito";

export function buildGamePlanText(
  mapName: string | undefined,
  modeId: string | undefined,
  myTeam: DraftTeam,
  analysis: CoachComposition,
  picks: CoachPlanRow[],
  estimate?: CoachPlanEstimate,
  enemyPicks: CoachPlanRow[] = [],
) {
  const pickLines = picks.map((row) => {
    const plan = getTacticalPlan(row, modeId ?? "gem-grab");
    const build = getBrawlerBuild(row.brawler, modeId);
    const position = getPositionRecommendation(row.brawler, enemyPicks);
    const matchups = enemyPicks.map((enemy) => getCounterMatchup(row.brawler, enemy.brawler, undefined, modeId)).filter((matchup): matchup is NonNullable<ReturnType<typeof getCounterMatchup>> => matchup !== null);
    return [
      `${row.brawler}`,
      `Missão: ${plan.mission}`,
      `Ataque/Defesa: ${plan.action}`,
      `Posicionamento tático: ${positionLabel(position.position)} — ${position.advice}`,
      `Pressão/Alvos: ${plan.pressure}`,
      `Matchups: ${matchups.length ? matchups.map((matchup) => `${matchup.defender} (${formatMatchupPercent(matchup.counterDelta)} · ${matchup.note})`).join(", ") : "Sem counter direto identificado no catálogo"}`,
      `Build: Gadget ${build.gadget}; Star Power ${build.starPower}; Gears ${build.gears.join(", ")}`,
    ].join("\n");
  }).join("\n\n");

  return [
    "BRAWL HÍBRIDO — COACH GAME PLAN",
    `Mapa: ${mapName ?? "Não selecionado"}`,
    `Modo: ${modeId ?? "Não definido"}`,
    `Perspetiva: Equipa ${myTeam === "blue" ? "Azul" : "Vermelha"}`,
    `Confiança: ${analysis.confidence}% · Role coverage: ${analysis.roleCoverage}% · Objective fit: ${analysis.objectiveFit}%`,
    estimate ? `ESTIMATIVA FINAL: Azul ${estimate.blueWinProbability}% · Vermelha ${estimate.redWinProbability}% · ${estimate.advantageLabel}` : "ESTIMATIVA FINAL: disponível quando o draft estiver fechado.",
    "",
    `WIN CONDITION: ${analysis.winCondition}`,
    `ABERTURA: ${analysis.openingPlan}`,
    `MEIO DE JOGO: ${analysis.midGamePlan}`,
    `FECHO: ${analysis.closingPlan}`,
    "",
    "PICKS",
    pickLines || "Ainda sem picks aliados.",
  ].join("\n");
}
