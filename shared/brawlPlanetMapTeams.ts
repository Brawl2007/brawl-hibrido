export type BrawlPlanetMapTeam = {
  map: string;
  brawlers: string[];
  winRate: number;
  sourceUrl: string;
};

/** Uma composição do quadro do mapa, com a posição publicada preservada. */
export type BrawlPlanetMapTeamEntry = BrawlPlanetMapTeam & {
  /** 1 = melhor Win Rate publicado para o mapa. */
  rank: number;
  /** Membros da composição já escolhidos no draft atual. */
  matchedAllies: string[];
};

/** Número máximo de composições que o Brawl Planet publica por mapa. */
export const BRAWL_PLANET_MAP_TEAM_LIMIT = 10;

function teamKey(names: Iterable<string>) {
  return Array.from(names)
    .map((name) => name.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, ""))
    .sort()
    .join("|");
}

/**
 * Devolve somente uma composição literal publicada para o mapa ativo. O bónus
 * é acionado quando a recomendação e pelo menos um Pick aliado pertencem à
 * mesma equipa Brawl Planet; não cria relações a partir de inferência.
 */
export function findBrawlPlanetMapTeam(
  candidate: string,
  allies: Iterable<string>,
  teams: readonly BrawlPlanetMapTeam[] | undefined,
) {
  const allyKeys = new Set(Array.from(allies).map((ally) => teamKey([ally])));
  const candidateKey = teamKey([candidate]);
  if (!teams?.length || !allyKeys.size) return null;

  const matching = teams.filter((team) => {
    const memberKeys = new Set(team.brawlers.map((member) => teamKey([member])));
    return memberKeys.has(candidateKey) && Array.from(allyKeys).some((ally) => memberKeys.has(ally));
  });

  return matching.sort((left, right) => right.winRate - left.winRate)[0] ?? null;
}

/**
 * Quadro literal do mapa: as dez composições de três brawlers publicadas pelo
 * Brawl Planet, ordenadas pelo Win Rate da fonte e limitadas ao que a página
 * expõe. Composições incompletas (menos de três membros) não entram; nenhuma
 * equipa é criada a partir dos brawlers individuais mais fortes do mapa.
 */
export function getBrawlPlanetMapTeamBoard(
  teams: readonly BrawlPlanetMapTeam[] | undefined,
  mapName?: string,
  allies: Iterable<string> = [],
): BrawlPlanetMapTeamEntry[] {
  if (!teams?.length) return [];
  const mapKey = mapName ? teamKey([mapName]) : undefined;
  const allyNames = Array.from(allies);
  const seen = new Set<string>();

  return teams
    .filter((team) => team.brawlers.length === 3 && Number.isFinite(team.winRate))
    .filter((team) => !mapKey || teamKey([team.map]) === mapKey)
    .filter((team) => {
      const key = `${teamKey([team.map])}#${teamKey(team.brawlers)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.winRate - left.winRate)
    .slice(0, BRAWL_PLANET_MAP_TEAM_LIMIT)
    .map((team, index) => {
      const memberKeys = new Set(team.brawlers.map((member) => teamKey([member])));
      return {
        ...team,
        rank: index + 1,
        matchedAllies: allyNames.filter((ally) => memberKeys.has(teamKey([ally]))),
      };
    });
}

/** Composições do quadro do mapa em que o candidato aparece, na mesma ordem. */
export function getBrawlPlanetMapTeamsForBrawler(
  candidate: string,
  teams: readonly BrawlPlanetMapTeam[] | undefined,
  mapName?: string,
  allies: Iterable<string> = [],
): BrawlPlanetMapTeamEntry[] {
  const candidateKey = teamKey([candidate]);
  return getBrawlPlanetMapTeamBoard(teams, mapName, allies).filter((team) =>
    team.brawlers.some((member) => teamKey([member]) === candidateKey),
  );
}
