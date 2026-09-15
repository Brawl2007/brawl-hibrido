/*
 * Faixas de alcance do ataque base publicadas pelo Brawl Planet.
 * Fonte: https://www.brawlplanet.com/tier-list/attack_range
 *
 * A fonte expõe faixas (em blocos), não um único valor por brawler. Esta
 * estrutura mantém deliberadamente essa granularidade para não inventar uma
 * precisão que a página pública não apresenta, sobretudo em ataques com modos.
 */

export const BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL = "https://www.brawlplanet.com/tier-list/attack_range";

export type AttackRangeBandId = "S" | "A" | "B" | "C" | "D" | "F";

export type AttackRangeBand = {
  id: AttackRangeBandId;
  label: string;
  minTiles: number;
  maxTiles: number;
  sourceUrl: typeof BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL;
};

export const attackRangeBands: Record<AttackRangeBandId, AttackRangeBand> = {
  S: { id: "S", label: "Muito longo", minTiles: 9.5, maxTiles: 10.9, sourceUrl: BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL },
  A: { id: "A", label: "Longo", minTiles: 8, maxTiles: 9.4, sourceUrl: BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL },
  B: { id: "B", label: "Médio-longo", minTiles: 6.5, maxTiles: 7.9, sourceUrl: BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL },
  C: { id: "C", label: "Médio", minTiles: 5, maxTiles: 6.4, sourceUrl: BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL },
  D: { id: "D", label: "Curto", minTiles: 3.5, maxTiles: 4.9, sourceUrl: BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL },
  F: { id: "F", label: "Muito curto", minTiles: 2, maxTiles: 3.4, sourceUrl: BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL },
};

export const attackRangeBandOrder: AttackRangeBandId[] = ["S", "A", "B", "C", "D", "F"];

const brawlersByAttackRangeBand: Record<AttackRangeBandId, readonly string[]> = {
  S: ["8-Bit", "Angelo", "Bea", "Belle", "Byron", "Leon", "Pierce", "Piper", "R-T", "Rico"],
  A: ["Amber", "Bo", "Bonnie", "Brock", "Carl", "Charlie", "Chester", "Colette", "Colt", "Crow", "Eve", "Finx", "Gale", "Gray", "Griff", "Gus", "Jae-Yong", "Jessie", "Lola", "Lou", "Lumi", "Maisie", "Mandy", "Max", "Meg", "Melodie", "Mina", "Nani", "Otis", "Pam", "Pearl", "Penny", "Ruffs", "Tara", "Tick", "Wendy"],
  B: ["Barley", "Chuck", "Clancy", "Dynamike", "Emz", "Glowy", "Grom", "Larry & Lawrie", "Meeple", "Mr. P", "Poco", "Shelly", "Sirius", "Spike", "Squeak", "Stu", "Surge", "Willow", "Ziggy"],
  C: ["Berry", "Bull", "Buster", "Cordelius", "Darryl", "Frank", "Gene", "Juju", "Moe", "Najia", "Nita", "Ollie", "Sandy", "Sprout", "Starr Nova"],
  D: ["Ash", "Bibi", "Draco", "Janet", "Kit", "Mico", "Nori", "Rosa", "Shade"],
  F: ["Alli", "Buzz", "Damian", "Doug", "Edgar", "El Primo", "Fang", "Gigi", "Hank", "Jacky", "Kaze", "Kenji", "Lily", "Mortis", "Sam", "Trunk"],
};

function rangeKey(value: string) {
  return value.toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
}

const attackRangeBandByBrawler = new Map<string, AttackRangeBandId>(
  attackRangeBandOrder.flatMap((bandId) => brawlersByAttackRangeBand[bandId].map((name) => [rangeKey(name), bandId] as const)),
);

export function getBrawlerAttackRangeBand(brawlerName: string): AttackRangeBand | null {
  const bandId = attackRangeBandByBrawler.get(rangeKey(brawlerName));
  return bandId ? attackRangeBands[bandId] : null;
}

export function getBrawlersWithAttackRangeBands() {
  return Array.from(attackRangeBandByBrawler.keys());
}
