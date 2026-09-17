/**
 * Os mapas da rotação Ranked conhecidos pelo projeto.
 *
 * POR QUE VIVE AQUI
 *
 * Estava dentro do `server/rankedSync.ts`, que arrasta base de dados e meio
 * servidor atrás. Passou a ser preciso fora dele: a recolha do TopBrawl mudou-se
 * para outra rede — daqui o site leva 403 — e quem a corre precisa da lista sem
 * ter de arrancar um servidor inteiro para a ler.
 *
 * Duas listas seriam duas rotações, e a que ficasse para trás produziria mapas
 * em falta sem ninguém perceber porquê.
 */
export const RANKED_MAP_SOURCES = [
  ["Hard Rock Mine", "15000007", "hardrockmine_gemgrab"],
  ["Gem Fort", "15000010", "gemfort_gemgrab"],
  ["Hideout", "15000022", "hideout_bounty"],
  ["Hot Potato", "15000053", "hotpotato_heist"],
  ["Bridge Too Far", "15000072", "bridgetoofar_heist"],
  ["Layer Cake", "15000082", "layercake_bounty"],
  ["Dry Season", "15000083", "dryseason_bounty"],
  ["Double Swoosh", "15000115", "doubleswoosh_gemgrab"],
  ["Pinball Dreams", "15000118", "pinballdreams_brawlball"],
  ["Center Stage", "15000132", "centerstage_brawlball"],
  ["Open Business", "15000292", "openbusiness_hotzone"],
  ["Parallel Plays", "15000293", "parallelplays_hotzone"],
  ["Dueling Beetles", "15000306", "duelingbeetles_hotzone"],
  ["Belle's Rock", "15000368", "bellesrock_knockout"],
  ["Flaring Phoenix", "15000440", "flaringphoenix_knockout"],
  ["Out in the Open", "15000548", "outintheopen_knockout"],
  ["Undermine", "15000011", "undermine_gemgrab"],
  ["Kaboom Canyon", "15000018", "kaboomcanyon_heist"],
  ["Safe Zone", "15000019", "safezone_heist"],
  ["Shooting Star", "15000005", "shootingstar_bounty"],
  ["Sneaky Fields", "15000050", "sneakyfields_brawlball"],
  ["Spiraling Out", "15001021", "spiralingout_brawlball"],
  ["Triple Dribble", "15000025", "tripledribble_brawlball"],
  ["Ring of Fire", "15000300", "ringoffire_hotzone"],
  ["New Horizons", "15000703", "newhorizons_knockout"],
  ["Beach Ball", "15000143", "beachball_brawlball"],
] as const;
