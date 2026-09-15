import { describe, expect, it } from "vitest";
import {
  BRAWL_PLANET_MAP_TEAM_LIMIT,
  findBrawlPlanetMapTeam,
  getBrawlPlanetMapTeamBoard,
  getBrawlPlanetMapTeamsForBrawler,
  type BrawlPlanetMapTeam,
} from "@shared/brawlPlanetMapTeams";
import { parseBrawlPlanetTeams } from "./rankedSync";

const sourceUrl = "https://www.brawlplanet.com/maps/flaringphoenix_knockout";

const teams: BrawlPlanetMapTeam[] = [
  { map: "Flaring Phoenix", brawlers: ["Brock", "Pearl", "Bolt"], winRate: 62.5, sourceUrl },
  { map: "Flaring Phoenix", brawlers: ["Nori", "Gus", "Pearl"], winRate: 58.1, sourceUrl },
  { map: "Flaring Phoenix", brawlers: ["Brock", "Pearl", "Bolt"], winRate: 62.5, sourceUrl },
  { map: "Flaring Phoenix", brawlers: ["Pearl", "Bolt"], winRate: 99, sourceUrl },
  { map: "Crystal Arcade", brawlers: ["Gus", "Chester", "Spike"], winRate: 60, sourceUrl: "https://www.brawlplanet.com/maps/crystalarcade_gemgrab" },
];

describe("quadro literal de equipas Brawl Planet por mapa", () => {
  it("ordena pelo Win Rate publicado, remove repetições e exige trios completos", () => {
    const board = getBrawlPlanetMapTeamBoard(teams, "Flaring Phoenix");

    expect(board).toHaveLength(2);
    expect(board[0]).toMatchObject({ rank: 1, winRate: 62.5, brawlers: ["Brock", "Pearl", "Bolt"] });
    expect(board[1]).toMatchObject({ rank: 2, winRate: 58.1 });
    expect(board.every((team) => team.sourceUrl === sourceUrl)).toBe(true);
  });

  it("marca os Picks aliados já presentes em cada composição", () => {
    const board = getBrawlPlanetMapTeamBoard(teams, "Flaring Phoenix", ["Pearl", "Shelly"]);

    expect(board[0].matchedAllies).toEqual(["Pearl"]);
    expect(board[1].matchedAllies).toEqual(["Pearl"]);
  });

  it("limita o quadro às dez composições publicadas", () => {
    const many = Array.from({ length: 14 }, (_, index) => ({
      map: "Flaring Phoenix",
      brawlers: [`A${index}`, `B${index}`, `C${index}`],
      winRate: 50 + index,
      sourceUrl,
    }));
    const board = getBrawlPlanetMapTeamBoard(many, "Flaring Phoenix");

    expect(board).toHaveLength(BRAWL_PLANET_MAP_TEAM_LIMIT);
    expect(board[0].winRate).toBe(63);
    expect(board.at(-1)?.winRate).toBe(54);
  });

  it("isola o quadro por mapa e devolve as composições de um candidato", () => {
    expect(getBrawlPlanetMapTeamBoard(teams, "Crystal Arcade").map((team) => team.brawlers)).toEqual([["Gus", "Chester", "Spike"]]);
    expect(getBrawlPlanetMapTeamsForBrawler("Nori", teams, "Flaring Phoenix", ["Gus"])).toMatchObject([
      { rank: 2, matchedAllies: ["Gus"] },
    ]);
    expect(getBrawlPlanetMapTeamsForBrawler("Shelly", teams, "Flaring Phoenix")).toEqual([]);
    expect(getBrawlPlanetMapTeamBoard([], "Flaring Phoenix")).toEqual([]);
  });

  it("mantém o bónus de composição ligado à melhor correspondência do quadro", () => {
    expect(findBrawlPlanetMapTeam("Pearl", ["Brock"], teams)).toMatchObject({ winRate: 62.5 });
  });

  it("lê no máximo dez composições literais da tabela publicada", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      `<tr><td>${index + 1}</td><td>Brock · Pearl · Bolt${index}</td><td>${(62 - index).toFixed(1)}%</td></tr>`,
    ).join("");
    const html = `<table><tr><th>Team</th><th>Win Rate</th></tr>${rows}</table>`;
    const parsed = parseBrawlPlanetTeams(html, "Flaring Phoenix", sourceUrl);

    expect(parsed).toHaveLength(BRAWL_PLANET_MAP_TEAM_LIMIT);
    expect(parsed[0]).toMatchObject({ map: "Flaring Phoenix", brawlers: ["Brock", "Pearl", "Bolt0"], winRate: 62 });
  });
});
