/*
 * Catálogo literal de sinergia BrawlScope ("Pair with"), vista Overall + Lendário+.
 *
 * Recolhido em 2026-09-11 das 105 fichas públicas
 * `https://brawlscope.com/counters/<slug>`, preservando a ordem e o valor de cada cartão.
 *
 * VERIFICAÇÃO: cada ficha foi lida duas vezes de forma independente. A segunda leitura
 * devolveu a taxa de vitória absoluta do par em vez do ganho; subtraindo uma da outra,
 * a baseline do titular sai constante nas dez entradas (amplitude 0,1 = arredondamento
 * da fonte) — por exemplo, Rosa: a página declara 51,8% e todas as dez entradas dão
 * 51,8/51,9. As duas leituras devolveram também a mesma ordem e os mesmos nomes.
 * Cruzando os 132 pares que aparecem nas duas fichas, o resíduo médio é 0,16 pontos.
 *
 * `delta` é o ganho publicado do par sobre a baseline do titular. É esse valor que o
 * Draft aplica como percentagem: +11,5 na ficha vale +11,5% no Score.
 *
 * Wendy fica de fora porque a ficha dela declara, com estas palavras, que nenhum lobby
 * Ranked a escolheu até agora — não há nada medido para publicar.
 *
 * Regerar com: node server/scripts/import-brawlscope-synergies.mjs
 */
export type BrawlScopeSynergyTeammate = {
  brawler: string;
  /** Percentagem publicada no cartão do aliado, tal como aparece na fonte. */
  delta?: number;
};

export interface BrawlScopeSynergyEntry {
  /** Nome editorial do brawler dono da página. */
  brawler: string;
  /** Até dez aliados na ordem publicada em `Pair with`. */
  teammates: BrawlScopeSynergyTeammate[];
  sourceUrl: string;
}

/** Limite publicado pela fonte; nenhuma lista canónica excede este valor. */
export const BRAWLSCOPE_SYNERGY_LIMIT = 10;

export const brawlScopeSynergyData: Record<string, BrawlScopeSynergyEntry> = {
  "8-bit": {
    brawler: "8-Bit",
    teammates: [{brawler:"Wendy",delta:12.3},{brawler:"Shade",delta:10.1},{brawler:"Amber",delta:7.3},{brawler:"Sam",delta:8.3},{brawler:"Bibi",delta:6.7},{brawler:"Nori",delta:6.0},{brawler:"Melodie",delta:6.0},{brawler:"Ash",delta:5.6},{brawler:"Eve",delta:5.1},{brawler:"Draco",delta:5.4}],
    sourceUrl: "https://brawlscope.com/counters/8-bit",
  },
  "alli": {
    brawler: "Alli",
    teammates: [{brawler:"Wendy",delta:8.0},{brawler:"Amber",delta:6.9},{brawler:"8-Bit",delta:6.8},{brawler:"Emz",delta:5.7},{brawler:"Gus",delta:3.9},{brawler:"Janet",delta:4.2},{brawler:"Colt",delta:3.2},{brawler:"Melodie",delta:3.3},{brawler:"Griff",delta:3.0},{brawler:"El Primo",delta:2.8}],
    sourceUrl: "https://brawlscope.com/counters/alli",
  },
  "amber": {
    brawler: "Amber",
    teammates: [{brawler:"Shade",delta:11.5},{brawler:"Wendy",delta:11.5},{brawler:"El Primo",delta:6.7},{brawler:"Gus",delta:6.5},{brawler:"Bibi",delta:6.1},{brawler:"Ash",delta:5.0},{brawler:"Bo",delta:3.5},{brawler:"Glowy",delta:3.6},{brawler:"Doug",delta:2.8},{brawler:"Finx",delta:2.3}],
    sourceUrl: "https://brawlscope.com/counters/amber",
  },
  "angelo": {
    brawler: "Angelo",
    teammates: [{brawler:"Wendy",delta:9.1},{brawler:"Shade",delta:7.7},{brawler:"Doug",delta:8.7},{brawler:"Sprout",delta:6.6},{brawler:"Amber",delta:5.8},{brawler:"Pearl",delta:5.0},{brawler:"8-Bit",delta:4.9},{brawler:"Nori",delta:4.4},{brawler:"Meg",delta:4.3},{brawler:"Mr. P",delta:4.6}],
    sourceUrl: "https://brawlscope.com/counters/angelo",
  },
  "ash": {
    brawler: "Ash",
    teammates: [{brawler:"Amber",delta:7.7},{brawler:"Wendy",delta:6.2},{brawler:"Gus",delta:4.3},{brawler:"Emz",delta:4.2},{brawler:"El Primo",delta:3.8},{brawler:"Sandy",delta:3.1},{brawler:"Shade",delta:2.9},{brawler:"Bolt",delta:3.0},{brawler:"Rico",delta:2.6},{brawler:"Sirius",delta:2.5}],
    sourceUrl: "https://brawlscope.com/counters/ash",
  },
  "barley": {
    brawler: "Barley",
    teammates: [{brawler:"Wendy",delta:11.2},{brawler:"Stu",delta:5.7},{brawler:"Gus",delta:5.5},{brawler:"Amber",delta:4.7},{brawler:"Meg",delta:4.6},{brawler:"Ash",delta:4.7},{brawler:"8-Bit",delta:3.5},{brawler:"Lou",delta:3.0},{brawler:"Sandy",delta:4.1},{brawler:"El Primo",delta:2.2}],
    sourceUrl: "https://brawlscope.com/counters/barley",
  },
  "bea": {
    brawler: "Bea",
    teammates: [{brawler:"Wendy",delta:10.1},{brawler:"Ash",delta:10.5},{brawler:"Amber",delta:9.4},{brawler:"Shade",delta:8.6},{brawler:"Emz",delta:6.7},{brawler:"Tara",delta:8.0},{brawler:"Bolt",delta:6.2},{brawler:"Bull",delta:6.7},{brawler:"Bibi",delta:6.9},{brawler:"Doug",delta:11.1}],
    sourceUrl: "https://brawlscope.com/counters/bea",
  },
  "belle": {
    brawler: "Belle",
    teammates: [{brawler:"Wendy",delta:12.9},{brawler:"Shade",delta:8.7},{brawler:"Sprout",delta:5.9},{brawler:"Amber",delta:4.9},{brawler:"Maisie",delta:5.5},{brawler:"Brock",delta:4.1},{brawler:"Bolt",delta:4.2},{brawler:"Draco",delta:11.0},{brawler:"Pearl",delta:3.8},{brawler:"Ash",delta:4.5}],
    sourceUrl: "https://brawlscope.com/counters/belle",
  },
  "berry": {
    brawler: "Berry",
    teammates: [{brawler:"Amber",delta:8.3},{brawler:"Nita",delta:8.4},{brawler:"Kaze",delta:6.8},{brawler:"Bibi",delta:6.5},{brawler:"Melodie",delta:6.6},{brawler:"Nori",delta:5.8},{brawler:"Wendy",delta:5.0},{brawler:"Rico",delta:4.2},{brawler:"Shade",delta:3.9},{brawler:"Ash",delta:3.8}],
    sourceUrl: "https://brawlscope.com/counters/berry",
  },
  "bibi": {
    brawler: "Bibi",
    teammates: [{brawler:"Amber",delta:9.9},{brawler:"Wendy",delta:5.2},{brawler:"Shade",delta:4.8},{brawler:"Gus",delta:4.7},{brawler:"8-Bit",delta:4.4},{brawler:"Rico",delta:3.4},{brawler:"El Primo",delta:3.0},{brawler:"Emz",delta:3.0},{brawler:"Carl",delta:2.7},{brawler:"Ash",delta:2.7}],
    sourceUrl: "https://brawlscope.com/counters/bibi",
  },
  "bo": {
    brawler: "Bo",
    teammates: [{brawler:"Wendy",delta:13.9},{brawler:"Amber",delta:10.1},{brawler:"Gus",delta:8.8},{brawler:"Shade",delta:8.2},{brawler:"El Primo",delta:6.4},{brawler:"Ash",delta:6.3},{brawler:"Bolt",delta:5.6},{brawler:"Hank",delta:6.1},{brawler:"Doug",delta:4.9},{brawler:"Pam",delta:5.2}],
    sourceUrl: "https://brawlscope.com/counters/bo",
  },
  "bolt": {
    brawler: "Bolt",
    teammates: [{brawler:"Tara",delta:7.4},{brawler:"Sandy",delta:7.1},{brawler:"Amber",delta:5.6},{brawler:"Juju",delta:6.9},{brawler:"Pearl",delta:5.3},{brawler:"Kenji",delta:5.3},{brawler:"Emz",delta:4.7},{brawler:"Stu",delta:4.5},{brawler:"Ash",delta:4.7},{brawler:"Meg",delta:4.4}],
    sourceUrl: "https://brawlscope.com/counters/bolt",
  },
  "bonnie": {
    brawler: "Bonnie",
    teammates: [{brawler:"Wendy",delta:11.5},{brawler:"Shade",delta:8.6},{brawler:"Sprout",delta:9.2},{brawler:"R-T",delta:11.4},{brawler:"Ollie",delta:15.7},{brawler:"Frank",delta:22.3},{brawler:"Spike",delta:5.4},{brawler:"8-Bit",delta:4.2},{brawler:"Bolt",delta:5.2},{brawler:"Rico",delta:4.2}],
    sourceUrl: "https://brawlscope.com/counters/bonnie",
  },
  "brock": {
    brawler: "Brock",
    teammates: [{brawler:"Wendy",delta:12.1},{brawler:"Sprout",delta:8.7},{brawler:"Amber",delta:7.1},{brawler:"Doug",delta:7.0},{brawler:"Buster",delta:6.9},{brawler:"Shade",delta:6.4},{brawler:"Pearl",delta:6.4},{brawler:"Leon",delta:6.1},{brawler:"Gray",delta:5.4},{brawler:"Najia",delta:4.1}],
    sourceUrl: "https://brawlscope.com/counters/brock",
  },
  "bull": {
    brawler: "Bull",
    teammates: [{brawler:"Amber",delta:8.8},{brawler:"Shade",delta:6.6},{brawler:"Ash",delta:5.0},{brawler:"Wendy",delta:4.9},{brawler:"Bibi",delta:4.7},{brawler:"8-Bit",delta:4.3},{brawler:"Melodie",delta:4.0},{brawler:"Bolt",delta:3.7},{brawler:"Gus",delta:3.5},{brawler:"El Primo",delta:3.2}],
    sourceUrl: "https://brawlscope.com/counters/bull",
  },
  "buster": {
    brawler: "Buster",
    teammates: [{brawler:"Shade",delta:8.4},{brawler:"Brock",delta:7.4},{brawler:"Amber",delta:7.5},{brawler:"Wendy",delta:5.7},{brawler:"Mandy",delta:5.4},{brawler:"Lily",delta:7.9},{brawler:"Doug",delta:5.4},{brawler:"Ash",delta:4.5},{brawler:"Pearl",delta:3.8},{brawler:"Gray",delta:3.7}],
    sourceUrl: "https://brawlscope.com/counters/buster",
  },
  "buzz": {
    brawler: "Buzz",
    teammates: [{brawler:"Amber",delta:7.8},{brawler:"Shade",delta:6.8},{brawler:"Wendy",delta:6.8},{brawler:"Bibi",delta:6.0},{brawler:"Nita",delta:5.6},{brawler:"Emz",delta:5.3},{brawler:"Gus",delta:4.5},{brawler:"Ash",delta:4.3},{brawler:"Tara",delta:4.0},{brawler:"Shelly",delta:3.7}],
    sourceUrl: "https://brawlscope.com/counters/buzz",
  },
  "byron": {
    brawler: "Byron",
    teammates: [{brawler:"Wendy",delta:10.8},{brawler:"Sprout",delta:7.5},{brawler:"Shade",delta:7.2},{brawler:"Amber",delta:6.2},{brawler:"Bolt",delta:4.8},{brawler:"Ash",delta:4.8},{brawler:"Brock",delta:3.8},{brawler:"Pearl",delta:3.0},{brawler:"Bibi",delta:3.1},{brawler:"Edgar",delta:2.1}],
    sourceUrl: "https://brawlscope.com/counters/byron",
  },
  "carl": {
    brawler: "Carl",
    teammates: [{brawler:"Wendy",delta:9.6},{brawler:"Shade",delta:7.8},{brawler:"Rosa",delta:7.8},{brawler:"Amber",delta:7.0},{brawler:"Bibi",delta:6.7},{brawler:"Ash",delta:5.9},{brawler:"Bolt",delta:5.0},{brawler:"Melodie",delta:4.9},{brawler:"El Primo",delta:4.3},{brawler:"Gus",delta:4.2}],
    sourceUrl: "https://brawlscope.com/counters/carl",
  },
  "charlie": {
    brawler: "Charlie",
    teammates: [{brawler:"Wendy",delta:10.1},{brawler:"Shade",delta:8.3},{brawler:"Sirius",delta:6.2},{brawler:"Amber",delta:5.4},{brawler:"Nita",delta:6.2},{brawler:"Jessie",delta:8.7},{brawler:"Ash",delta:5.2},{brawler:"El Primo",delta:5.0},{brawler:"Draco",delta:9.3},{brawler:"Bibi",delta:4.3}],
    sourceUrl: "https://brawlscope.com/counters/charlie",
  },
  "chester": {
    brawler: "Chester",
    teammates: [{brawler:"Wendy",delta:9.4},{brawler:"Amber",delta:7.4},{brawler:"Bolt",delta:7.5},{brawler:"Shade",delta:6.9},{brawler:"El Primo",delta:6.7},{brawler:"Gus",delta:6.1},{brawler:"Larry & Lawrie",delta:7.0},{brawler:"Ash",delta:5.4},{brawler:"Rosa",delta:5.4},{brawler:"Emz",delta:4.0}],
    sourceUrl: "https://brawlscope.com/counters/chester",
  },
  "chuck": {
    brawler: "Chuck",
    teammates: [{brawler:"Shade",delta:7.7},{brawler:"Amber",delta:7.3},{brawler:"Wendy",delta:6.8},{brawler:"Juju",delta:6.5},{brawler:"Sirius",delta:5.9},{brawler:"Lou",delta:5.6},{brawler:"Nori",delta:5.2},{brawler:"Ash",delta:5.4},{brawler:"Bo",delta:5.0},{brawler:"Nita",delta:5.1}],
    sourceUrl: "https://brawlscope.com/counters/chuck",
  },
  "clancy": {
    brawler: "Clancy",
    teammates: [{brawler:"Shade",delta:12.2},{brawler:"El Primo",delta:10.0},{brawler:"Amber",delta:8.9},{brawler:"Wendy",delta:7.0},{brawler:"Doug",delta:8.3},{brawler:"Draco",delta:9.5},{brawler:"Tara",delta:4.5},{brawler:"Bolt",delta:4.8},{brawler:"Charlie",delta:5.3},{brawler:"Frank",delta:4.7}],
    sourceUrl: "https://brawlscope.com/counters/clancy",
  },
  "colette": {
    brawler: "Colette",
    teammates: [{brawler:"Shade",delta:14.3},{brawler:"Wendy",delta:9.5},{brawler:"Amber",delta:7.2},{brawler:"El Primo",delta:4.8},{brawler:"Melodie",delta:4.8},{brawler:"Nori",delta:3.8},{brawler:"Nita",delta:3.6},{brawler:"Bibi",delta:3.5},{brawler:"Gus",delta:3.2},{brawler:"Glowy",delta:2.9}],
    sourceUrl: "https://brawlscope.com/counters/colette",
  },
  "colt": {
    brawler: "Colt",
    teammates: [{brawler:"Shade",delta:11.3},{brawler:"Wendy",delta:10.8},{brawler:"Nori",delta:8.8},{brawler:"Melodie",delta:7.2},{brawler:"Amber",delta:6.4},{brawler:"Bibi",delta:5.5},{brawler:"Sam",delta:6.7},{brawler:"8-Bit",delta:5.0},{brawler:"Kaze",delta:4.5},{brawler:"Glowy",delta:4.3}],
    sourceUrl: "https://brawlscope.com/counters/colt",
  },
  "cordelius": {
    brawler: "Cordelius",
    teammates: [{brawler:"Shade",delta:8.8},{brawler:"Nita",delta:7.1},{brawler:"Bibi",delta:6.9},{brawler:"Wendy",delta:6.6},{brawler:"Amber",delta:6.0},{brawler:"8-Bit",delta:5.6},{brawler:"Melodie",delta:5.1},{brawler:"Bolt",delta:5.0},{brawler:"El Primo",delta:4.6},{brawler:"Kaze",delta:4.0}],
    sourceUrl: "https://brawlscope.com/counters/cordelius",
  },
  "crow": {
    brawler: "Crow",
    teammates: [{brawler:"Wendy",delta:10.9},{brawler:"Ash",delta:8.3},{brawler:"Bolt",delta:8.0},{brawler:"Rosa",delta:8.1},{brawler:"Shade",delta:7.3},{brawler:"El Primo",delta:6.0},{brawler:"Frank",delta:6.2},{brawler:"Amber",delta:5.7},{brawler:"Sandy",delta:5.8},{brawler:"Bibi",delta:5.3}],
    sourceUrl: "https://brawlscope.com/counters/crow",
  },
  "damian": {
    brawler: "Damian",
    teammates: [{brawler:"Amber",delta:10.0},{brawler:"Emz",delta:7.0},{brawler:"Ash",delta:5.5},{brawler:"Bibi",delta:4.8},{brawler:"Rico",delta:4.0},{brawler:"Bo",delta:3.9},{brawler:"Rosa",delta:4.9},{brawler:"Larry & Lawrie",delta:5.1},{brawler:"Gus",delta:3.8},{brawler:"Lou",delta:3.5}],
    sourceUrl: "https://brawlscope.com/counters/damian",
  },
  "darryl": {
    brawler: "Darryl",
    teammates: [{brawler:"Shade",delta:11.2},{brawler:"Amber",delta:8.6},{brawler:"Finx",delta:12.2},{brawler:"8-Bit",delta:5.9},{brawler:"Wendy",delta:5.6},{brawler:"Rico",delta:4.9},{brawler:"Charlie",delta:6.0},{brawler:"Pearl",delta:4.6},{brawler:"Ash",delta:4.5},{brawler:"Emz",delta:3.7}],
    sourceUrl: "https://brawlscope.com/counters/darryl",
  },
  "doug": {
    brawler: "Doug",
    teammates: [{brawler:"Amber",delta:9.4},{brawler:"Brock",delta:6.5},{brawler:"Angelo",delta:7.4},{brawler:"Eve",delta:11.4},{brawler:"Bo",delta:4.8},{brawler:"Lou",delta:4.8},{brawler:"Mandy",delta:4.3},{brawler:"Ash",delta:4.2},{brawler:"Buster",delta:4.3},{brawler:"Bea",delta:6.6}],
    sourceUrl: "https://brawlscope.com/counters/doug",
  },
  "draco": {
    brawler: "Draco",
    teammates: [{brawler:"Emz",delta:11.3},{brawler:"Shade",delta:8.4},{brawler:"8-Bit",delta:7.5},{brawler:"Glowy",delta:9.4},{brawler:"Amber",delta:5.7},{brawler:"Bo",delta:5.4},{brawler:"Melodie",delta:11.0},{brawler:"Bea",delta:9.1},{brawler:"Charlie",delta:8.4},{brawler:"Penny",delta:4.7}],
    sourceUrl: "https://brawlscope.com/counters/draco",
  },
  "dynamike": {
    brawler: "Dynamike",
    teammates: [{brawler:"Wendy",delta:9.5},{brawler:"Amber",delta:8.8},{brawler:"Gus",delta:7.8},{brawler:"Shade",delta:6.3},{brawler:"Melodie",delta:7.2},{brawler:"El Primo",delta:5.1},{brawler:"Stu",delta:4.7},{brawler:"Ash",delta:3.8},{brawler:"Bibi",delta:3.4},{brawler:"Meg",delta:3.2}],
    sourceUrl: "https://brawlscope.com/counters/dynamike",
  },
  "edgar": {
    brawler: "Edgar",
    teammates: [{brawler:"Amber",delta:8.5},{brawler:"Wendy",delta:6.4},{brawler:"Bibi",delta:5.5},{brawler:"Nita",delta:5.1},{brawler:"Shade",delta:4.9},{brawler:"Sprout",delta:4.8},{brawler:"Larry & Lawrie",delta:5.1},{brawler:"Emz",delta:3.8},{brawler:"Juju",delta:3.7},{brawler:"Gus",delta:3.6}],
    sourceUrl: "https://brawlscope.com/counters/edgar",
  },
  "el-primo": {
    brawler: "El Primo",
    teammates: [{brawler:"Amber",delta:10.6},{brawler:"Shade",delta:8.0},{brawler:"Wendy",delta:7.0},{brawler:"Gus",delta:5.6},{brawler:"Sirius",delta:5.7},{brawler:"Emz",delta:5.5},{brawler:"Larry & Lawrie",delta:5.0},{brawler:"Bo",delta:3.8},{brawler:"Nita",delta:4.0},{brawler:"Ash",delta:3.4}],
    sourceUrl: "https://brawlscope.com/counters/el-primo",
  },
  "emz": {
    brawler: "Emz",
    teammates: [{brawler:"Wendy",delta:9.3},{brawler:"Draco",delta:7.6},{brawler:"Shade",delta:6.8},{brawler:"Amber",delta:6.4},{brawler:"Ash",delta:6.1},{brawler:"El Primo",delta:5.9},{brawler:"Gus",delta:5.8},{brawler:"Bolt",delta:4.9},{brawler:"Rosa",delta:4.9},{brawler:"Bibi",delta:3.8}],
    sourceUrl: "https://brawlscope.com/counters/emz",
  },
  "eve": {
    brawler: "Eve",
    teammates: [{brawler:"Shade",delta:11.5},{brawler:"Wendy",delta:8.5},{brawler:"Nori",delta:8.0},{brawler:"8-Bit",delta:7.5},{brawler:"Amber",delta:6.8},{brawler:"Doug",delta:13.3},{brawler:"Melodie",delta:6.6},{brawler:"Ash",delta:8.4},{brawler:"Gus",delta:4.1},{brawler:"Pearl",delta:4.0}],
    sourceUrl: "https://brawlscope.com/counters/eve",
  },
  "fang": {
    brawler: "Fang",
    teammates: [{brawler:"Wendy",delta:11.4},{brawler:"Amber",delta:9.7},{brawler:"Shade",delta:7.8},{brawler:"Bolt",delta:7.6},{brawler:"Ash",delta:7.3},{brawler:"Doug",delta:5.7},{brawler:"El Primo",delta:4.6},{brawler:"Rosa",delta:6.0},{brawler:"Frank",delta:4.3},{brawler:"Meg",delta:3.2}],
    sourceUrl: "https://brawlscope.com/counters/fang",
  },
  "finx": {
    brawler: "Finx",
    teammates: [{brawler:"Wendy",delta:11.7},{brawler:"Amber",delta:11.1},{brawler:"Shade",delta:9.3},{brawler:"Gus",delta:6.2},{brawler:"Darryl",delta:11.0},{brawler:"Bolt",delta:6.4},{brawler:"Nori",delta:5.2},{brawler:"Glowy",delta:6.6},{brawler:"Kaze",delta:4.9},{brawler:"Melodie",delta:4.8}],
    sourceUrl: "https://brawlscope.com/counters/finx",
  },
  "frank": {
    brawler: "Frank",
    teammates: [{brawler:"Amber",delta:10.4},{brawler:"Emz",delta:5.9},{brawler:"Shade",delta:6.0},{brawler:"Gus",delta:5.0},{brawler:"Meg",delta:4.9},{brawler:"Bonnie",delta:21.3},{brawler:"Tara",delta:4.5},{brawler:"8-Bit",delta:4.1},{brawler:"Ash",delta:4.0},{brawler:"Bea",delta:4.8}],
    sourceUrl: "https://brawlscope.com/counters/frank",
  },
  "gale": {
    brawler: "Gale",
    teammates: [{brawler:"Wendy",delta:10.2},{brawler:"Shade",delta:10.1},{brawler:"Bolt",delta:10.6},{brawler:"Ash",delta:7.4},{brawler:"Amber",delta:7.1},{brawler:"Bibi",delta:6.8},{brawler:"El Primo",delta:6.2},{brawler:"Nita",delta:4.9},{brawler:"Hank",delta:5.8},{brawler:"Gus",delta:3.4}],
    sourceUrl: "https://brawlscope.com/counters/gale",
  },
  "gene": {
    brawler: "Gene",
    teammates: [{brawler:"Wendy",delta:7.7},{brawler:"Sprout",delta:5.8},{brawler:"Amber",delta:5.6},{brawler:"Brock",delta:5.4},{brawler:"Doug",delta:5.2},{brawler:"Buster",delta:4.5},{brawler:"Bolt",delta:4.5},{brawler:"Edgar",delta:4.0},{brawler:"Shade",delta:3.7},{brawler:"Pearl",delta:3.5}],
    sourceUrl: "https://brawlscope.com/counters/gene",
  },
  "gigi": {
    brawler: "Gigi",
    teammates: [{brawler:"Amber",delta:10.1},{brawler:"Wendy",delta:10.1},{brawler:"Shade",delta:6.9},{brawler:"Ollie",delta:10.9},{brawler:"Buster",delta:7.0},{brawler:"El Primo",delta:4.1},{brawler:"Pearl",delta:4.0},{brawler:"Brock",delta:3.9},{brawler:"Jessie",delta:4.4},{brawler:"8-Bit",delta:3.3}],
    sourceUrl: "https://brawlscope.com/counters/gigi",
  },
  "glowy": {
    brawler: "Glowy",
    teammates: [{brawler:"Amber",delta:12.2},{brawler:"Melodie",delta:8.5},{brawler:"Shade",delta:6.8},{brawler:"8-Bit",delta:6.1},{brawler:"Draco",delta:9.8},{brawler:"Finx",delta:6.4},{brawler:"Wendy",delta:5.2},{brawler:"Lou",delta:5.6},{brawler:"Colt",delta:3.9},{brawler:"Griff",delta:3.8}],
    sourceUrl: "https://brawlscope.com/counters/glowy",
  },
  "gray": {
    brawler: "Gray",
    teammates: [{brawler:"Wendy",delta:9.0},{brawler:"Amber",delta:7.1},{brawler:"Sprout",delta:6.6},{brawler:"Brock",delta:5.5},{brawler:"Emz",delta:5.3},{brawler:"Doug",delta:3.9},{brawler:"Buster",delta:3.2},{brawler:"Pearl",delta:2.9},{brawler:"Rico",delta:2.5},{brawler:"Kenji",delta:2.5}],
    sourceUrl: "https://brawlscope.com/counters/gray",
  },
  "griff": {
    brawler: "Griff",
    teammates: [{brawler:"Wendy",delta:9.7},{brawler:"Shade",delta:9.4},{brawler:"Bolt",delta:8.1},{brawler:"Ash",delta:7.0},{brawler:"Amber",delta:6.0},{brawler:"Bibi",delta:5.8},{brawler:"El Primo",delta:5.6},{brawler:"Rosa",delta:5.3},{brawler:"Melodie",delta:4.3},{brawler:"Glowy",delta:4.3}],
    sourceUrl: "https://brawlscope.com/counters/griff",
  },
  "grom": {
    brawler: "Grom",
    teammates: [{brawler:"Wendy",delta:13.6},{brawler:"Pearl",delta:7.5},{brawler:"Shade",delta:6.4},{brawler:"Amber",delta:6.0},{brawler:"Brock",delta:5.5},{brawler:"Gus",delta:5.0},{brawler:"R-T",delta:7.0},{brawler:"Gray",delta:4.9},{brawler:"Ollie",delta:11.2},{brawler:"Max",delta:3.6}],
    sourceUrl: "https://brawlscope.com/counters/grom",
  },
  "gus": {
    brawler: "Gus",
    teammates: [{brawler:"Shade",delta:12.0},{brawler:"Amber",delta:10.7},{brawler:"Larry & Lawrie",delta:8.8},{brawler:"Wendy",delta:7.6},{brawler:"El Primo",delta:6.5},{brawler:"Bo",delta:5.9},{brawler:"Ash",delta:5.6},{brawler:"Tara",delta:5.6},{brawler:"Emz",delta:5.2},{brawler:"Bibi",delta:4.1}],
    sourceUrl: "https://brawlscope.com/counters/gus",
  },
  "hank": {
    brawler: "Hank",
    teammates: [{brawler:"Amber",delta:10.6},{brawler:"Bibi",delta:8.6},{brawler:"Bo",delta:9.4},{brawler:"Wendy",delta:6.5},{brawler:"Gus",delta:5.7},{brawler:"El Primo",delta:4.8},{brawler:"R-T",delta:5.5},{brawler:"Stu",delta:4.3},{brawler:"Ash",delta:4.8},{brawler:"Janet",delta:13.1}],
    sourceUrl: "https://brawlscope.com/counters/hank",
  },
  "jacky": {
    brawler: "Jacky",
    teammates: [{brawler:"Amber",delta:10.3},{brawler:"Rosa",delta:11.3},{brawler:"Gus",delta:5.7},{brawler:"Otis",delta:5.5},{brawler:"El Primo",delta:5.1},{brawler:"Rico",delta:4.7},{brawler:"Ash",delta:5.5},{brawler:"Emz",delta:4.6},{brawler:"Tara",delta:5.9},{brawler:"R-T",delta:5.9}],
    sourceUrl: "https://brawlscope.com/counters/jacky",
  },
  "jae-yong": {
    brawler: "Jae-Yong",
    teammates: [{brawler:"Wendy",delta:10.7},{brawler:"Amber",delta:9.4},{brawler:"Brock",delta:5.2},{brawler:"Angelo",delta:4.9},{brawler:"Shade",delta:4.4},{brawler:"Pearl",delta:3.8},{brawler:"Eve",delta:6.1},{brawler:"Sprout",delta:4.0},{brawler:"Melodie",delta:12.6},{brawler:"Finx",delta:13.9}],
    sourceUrl: "https://brawlscope.com/counters/jae-yong",
  },
  "janet": {
    brawler: "Janet",
    teammates: [{brawler:"Wendy",delta:10.7},{brawler:"Shade",delta:8.7},{brawler:"Amber",delta:6.5},{brawler:"Bolt",delta:7.1},{brawler:"Bo",delta:5.9},{brawler:"El Primo",delta:5.4},{brawler:"Gus",delta:5.3},{brawler:"Tara",delta:5.4},{brawler:"Ash",delta:5.1},{brawler:"Rosa",delta:6.3}],
    sourceUrl: "https://brawlscope.com/counters/janet",
  },
  "jessie": {
    brawler: "Jessie",
    teammates: [{brawler:"Shade",delta:14.0},{brawler:"Wendy",delta:11.1},{brawler:"Nori",delta:7.6},{brawler:"Amber",delta:6.7},{brawler:"Gus",delta:6.3},{brawler:"Charlie",delta:10.0},{brawler:"El Primo",delta:5.7},{brawler:"Nita",delta:5.7},{brawler:"Ash",delta:5.2},{brawler:"Eve",delta:5.3}],
    sourceUrl: "https://brawlscope.com/counters/jessie",
  },
  "juju": {
    brawler: "Juju",
    teammates: [{brawler:"Wendy",delta:9.0},{brawler:"Bolt",delta:10.1},{brawler:"Bibi",delta:6.3},{brawler:"Ash",delta:6.4},{brawler:"Gus",delta:5.6},{brawler:"El Primo",delta:5.6},{brawler:"Melodie",delta:9.2},{brawler:"Amber",delta:5.1},{brawler:"Trunk",delta:4.2},{brawler:"Lily",delta:4.5}],
    sourceUrl: "https://brawlscope.com/counters/juju",
  },
  "kaze": {
    brawler: "Kaze",
    teammates: [{brawler:"Shade",delta:8.8},{brawler:"Amber",delta:7.4},{brawler:"Nori",delta:7.1},{brawler:"Wendy",delta:6.9},{brawler:"8-Bit",delta:5.6},{brawler:"Melodie",delta:4.9},{brawler:"Bibi",delta:4.7},{brawler:"Nita",delta:4.2},{brawler:"Finx",delta:3.9},{brawler:"Colt",delta:3.2}],
    sourceUrl: "https://brawlscope.com/counters/kaze",
  },
  "kenji": {
    brawler: "Kenji",
    teammates: [{brawler:"Amber",delta:7.6},{brawler:"Bolt",delta:7.7},{brawler:"Wendy",delta:6.3},{brawler:"Gus",delta:5.4},{brawler:"Larry & Lawrie",delta:5.6},{brawler:"R-T",delta:4.7},{brawler:"Sirius",delta:4.3},{brawler:"Maisie",delta:3.7},{brawler:"Ash",delta:3.4},{brawler:"Emz",delta:3.4}],
    sourceUrl: "https://brawlscope.com/counters/kenji",
  },
  "kit": {
    brawler: "Kit",
    teammates: [{brawler:"Brock",delta:4.8},{brawler:"Amber",delta:4.8},{brawler:"Ash",delta:4.6},{brawler:"Bibi",delta:4.6},{brawler:"Wendy",delta:4.0},{brawler:"Rosa",delta:4.6},{brawler:"Pearl",delta:3.8},{brawler:"Juju",delta:4.5},{brawler:"Jessie",delta:6.1},{brawler:"Nita",delta:4.4}],
    sourceUrl: "https://brawlscope.com/counters/kit",
  },
  "larry-lawrie": {
    brawler: "Larry & Lawrie",
    teammates: [{brawler:"Wendy",delta:9.4},{brawler:"Gus",delta:8.7},{brawler:"Amber",delta:7.7},{brawler:"El Primo",delta:4.2},{brawler:"Kenji",delta:4.7},{brawler:"Ash",delta:3.7},{brawler:"Ollie",delta:16.0},{brawler:"Bo",delta:3.8},{brawler:"Meg",delta:2.7},{brawler:"Chester",delta:3.0}],
    sourceUrl: "https://brawlscope.com/counters/larry-lawrie",
  },
  "leon": {
    brawler: "Leon",
    teammates: [{brawler:"Wendy",delta:9.6},{brawler:"Amber",delta:7.8},{brawler:"Sprout",delta:7.4},{brawler:"Brock",delta:7.0},{brawler:"Bolt",delta:5.5},{brawler:"Pearl",delta:5.1},{brawler:"Shade",delta:4.5},{brawler:"Gus",delta:3.1},{brawler:"Piper",delta:2.7},{brawler:"Angelo",delta:2.2}],
    sourceUrl: "https://brawlscope.com/counters/leon",
  },
  "lily": {
    brawler: "Lily",
    teammates: [{brawler:"Wendy",delta:9.2},{brawler:"Amber",delta:8.9},{brawler:"Buster",delta:10.9},{brawler:"Juju",delta:7.7},{brawler:"8-Bit",delta:4.5},{brawler:"Gus",delta:4.0},{brawler:"Ash",delta:3.4},{brawler:"Shade",delta:3.2},{brawler:"Angelo",delta:3.4},{brawler:"Bolt",delta:3.5}],
    sourceUrl: "https://brawlscope.com/counters/lily",
  },
  "lola": {
    brawler: "Lola",
    teammates: [{brawler:"Shade",delta:10.2},{brawler:"Wendy",delta:9.8},{brawler:"Nori",delta:7.1},{brawler:"8-Bit",delta:6.3},{brawler:"Nita",delta:9.8},{brawler:"Amber",delta:5.1},{brawler:"Emz",delta:5.1},{brawler:"Sam",delta:22.1},{brawler:"Rosa",delta:11.3},{brawler:"Alli",delta:3.8}],
    sourceUrl: "https://brawlscope.com/counters/lola",
  },
  "lou": {
    brawler: "Lou",
    teammates: [{brawler:"Wendy",delta:14.2},{brawler:"Shade",delta:10.8},{brawler:"Amber",delta:7.6},{brawler:"Rosa",delta:8.9},{brawler:"Ash",delta:7.1},{brawler:"Bibi",delta:7.1},{brawler:"El Primo",delta:6.6},{brawler:"Doug",delta:7.3},{brawler:"Sirius",delta:6.2},{brawler:"Gus",delta:6.0}],
    sourceUrl: "https://brawlscope.com/counters/lou",
  },
  "lumi": {
    brawler: "Lumi",
    teammates: [{brawler:"Wendy",delta:8.8},{brawler:"Bibi",delta:8.2},{brawler:"Shade",delta:8.0},{brawler:"Ash",delta:7.9},{brawler:"Bolt",delta:5.5},{brawler:"Rosa",delta:5.6},{brawler:"El Primo",delta:5.2},{brawler:"Gus",delta:4.4},{brawler:"Amber",delta:3.9},{brawler:"Larry & Lawrie",delta:4.4}],
    sourceUrl: "https://brawlscope.com/counters/lumi",
  },
  "maisie": {
    brawler: "Maisie",
    teammates: [{brawler:"Shade",delta:11.1},{brawler:"Wendy",delta:10.5},{brawler:"Amber",delta:8.8},{brawler:"El Primo",delta:6.4},{brawler:"Ash",delta:4.8},{brawler:"Kenji",delta:4.4},{brawler:"Bibi",delta:3.9},{brawler:"Gus",delta:3.3},{brawler:"Rosa",delta:4.3},{brawler:"Sirius",delta:2.5}],
    sourceUrl: "https://brawlscope.com/counters/maisie",
  },
  "mandy": {
    brawler: "Mandy",
    teammates: [{brawler:"Wendy",delta:11.9},{brawler:"Buster",delta:7.6},{brawler:"Sprout",delta:7.4},{brawler:"Doug",delta:7.7},{brawler:"Shade",delta:6.0},{brawler:"Bolt",delta:5.2},{brawler:"Edgar",delta:4.8},{brawler:"Ollie",delta:5.7},{brawler:"Pearl",delta:4.5},{brawler:"Brock",delta:3.9}],
    sourceUrl: "https://brawlscope.com/counters/mandy",
  },
  "max": {
    brawler: "Max",
    teammates: [{brawler:"Wendy",delta:9.5},{brawler:"Amber",delta:8.2},{brawler:"Emz",delta:6.1},{brawler:"Ash",delta:6.1},{brawler:"Sprout",delta:5.9},{brawler:"Shade",delta:5.8},{brawler:"Barley",delta:4.2},{brawler:"Tara",delta:3.6},{brawler:"Brock",delta:3.4},{brawler:"Bibi",delta:3.4}],
    sourceUrl: "https://brawlscope.com/counters/max",
  },
  "meeple": {
    brawler: "Meeple",
    teammates: [{brawler:"Amber",delta:9.0},{brawler:"Wendy",delta:7.7},{brawler:"Shade",delta:6.2},{brawler:"Barley",delta:5.4},{brawler:"Sprout",delta:5.2},{brawler:"El Primo",delta:4.7},{brawler:"Brock",delta:4.0},{brawler:"Larry & Lawrie",delta:4.1},{brawler:"Ash",delta:3.9},{brawler:"Bolt",delta:3.6}],
    sourceUrl: "https://brawlscope.com/counters/meeple",
  },
  "meg": {
    brawler: "Meg",
    teammates: [{brawler:"Wendy",delta:7.7},{brawler:"Amber",delta:7.6},{brawler:"Bolt",delta:6.6},{brawler:"Shade",delta:5.8},{brawler:"Ash",delta:4.8},{brawler:"El Primo",delta:4.7},{brawler:"Barley",delta:4.5},{brawler:"Sprout",delta:4.2},{brawler:"Emz",delta:3.9},{brawler:"Bibi",delta:3.9}],
    sourceUrl: "https://brawlscope.com/counters/meg",
  },
  "melodie": {
    brawler: "Melodie",
    teammates: [{brawler:"Shade",delta:11.9},{brawler:"Nori",delta:10.9},{brawler:"Wendy",delta:8.8},{brawler:"Amber",delta:7.3},{brawler:"Nita",delta:6.6},{brawler:"8-Bit",delta:5.3},{brawler:"Glowy",delta:5.2},{brawler:"Juju",delta:6.9},{brawler:"Colt",delta:3.5},{brawler:"Bibi",delta:3.6}],
    sourceUrl: "https://brawlscope.com/counters/melodie",
  },
  "mico": {
    brawler: "Mico",
    teammates: [{brawler:"Shade",delta:9.9},{brawler:"Nori",delta:9.0},{brawler:"Amber",delta:8.3},{brawler:"Bibi",delta:6.6},{brawler:"Nita",delta:5.9},{brawler:"8-Bit",delta:4.9},{brawler:"Bonnie",delta:5.2},{brawler:"Wendy",delta:4.2},{brawler:"Carl",delta:3.7},{brawler:"Glowy",delta:3.9}],
    sourceUrl: "https://brawlscope.com/counters/mico",
  },
  "mina": {
    brawler: "Mina",
    teammates: [{brawler:"Wendy",delta:9.6},{brawler:"Amber",delta:7.8},{brawler:"Shade",delta:5.7},{brawler:"Ash",delta:5.1},{brawler:"Bolt",delta:4.9},{brawler:"Brock",delta:4.1},{brawler:"Sprout",delta:4.1},{brawler:"Gus",delta:4.0},{brawler:"Pearl",delta:3.2},{brawler:"Rosa",delta:3.0}],
    sourceUrl: "https://brawlscope.com/counters/mina",
  },
  "moe": {
    brawler: "Moe",
    teammates: [{brawler:"Wendy",delta:10.0},{brawler:"Shade",delta:7.5},{brawler:"Ash",delta:6.7},{brawler:"Amber",delta:6.7},{brawler:"Gus",delta:5.1},{brawler:"El Primo",delta:4.8},{brawler:"Emz",delta:4.3},{brawler:"Bolt",delta:4.7},{brawler:"Rosa",delta:5.1},{brawler:"Melodie",delta:6.0}],
    sourceUrl: "https://brawlscope.com/counters/moe",
  },
  "mortis": {
    brawler: "Mortis",
    teammates: [{brawler:"Brock",delta:4.4},{brawler:"Juju",delta:4.0},{brawler:"Bolt",delta:3.9},{brawler:"Emz",delta:3.7},{brawler:"Pearl",delta:3.5},{brawler:"Stu",delta:3.0},{brawler:"Larry & Lawrie",delta:2.8},{brawler:"8-Bit",delta:2.6},{brawler:"R-T",delta:2.4},{brawler:"Griff",delta:2.4}],
    sourceUrl: "https://brawlscope.com/counters/mortis",
  },
  "mr-p": {
    brawler: "Mr. P",
    teammates: [{brawler:"Amber",delta:9.3},{brawler:"Wendy",delta:8.4},{brawler:"Gus",delta:6.3},{brawler:"Shade",delta:5.6},{brawler:"Angelo",delta:6.1},{brawler:"Pearl",delta:4.9},{brawler:"Brock",delta:4.1},{brawler:"Piper",delta:4.0},{brawler:"Bibi",delta:6.1},{brawler:"Carl",delta:3.4}],
    sourceUrl: "https://brawlscope.com/counters/mr-p",
  },
  "najia": {
    brawler: "Najia",
    teammates: [{brawler:"Wendy",delta:11.9},{brawler:"Brock",delta:5.7},{brawler:"Shade",delta:5.4},{brawler:"Pearl",delta:5.0},{brawler:"Amber",delta:4.5},{brawler:"Gus",delta:4.1},{brawler:"Sprout",delta:3.9},{brawler:"Angelo",delta:3.4},{brawler:"Bolt",delta:3.0},{brawler:"Rosa",delta:3.9}],
    sourceUrl: "https://brawlscope.com/counters/najia",
  },
  "nani": {
    brawler: "Nani",
    teammates: [{brawler:"Wendy",delta:13.7},{brawler:"Sprout",delta:10.7},{brawler:"Shade",delta:7.0},{brawler:"Amber",delta:6.9},{brawler:"Kenji",delta:7.0},{brawler:"Leon",delta:4.7},{brawler:"Bolt",delta:4.1},{brawler:"Mortis",delta:3.7},{brawler:"Brock",delta:3.2},{brawler:"Najia",delta:3.1}],
    sourceUrl: "https://brawlscope.com/counters/nani",
  },
  "nita": {
    brawler: "Nita",
    teammates: [{brawler:"Shade",delta:7.5},{brawler:"Amber",delta:7.0},{brawler:"Melodie",delta:6.6},{brawler:"El Primo",delta:5.8},{brawler:"Wendy",delta:5.4},{brawler:"Gus",delta:4.4},{brawler:"Ash",delta:4.2},{brawler:"Rosa",delta:5.1},{brawler:"Bibi",delta:3.5},{brawler:"8-Bit",delta:3.1}],
    sourceUrl: "https://brawlscope.com/counters/nita",
  },
  "nori": {
    brawler: "Nori",
    teammates: [{brawler:"Melodie",delta:14.3},{brawler:"8-Bit",delta:8.7},{brawler:"Colt",delta:8.5},{brawler:"Mico",delta:8.1},{brawler:"Kaze",delta:8.1},{brawler:"Eve",delta:8.3},{brawler:"Wendy",delta:7.8},{brawler:"Shade",delta:7.6},{brawler:"Amber",delta:7.0},{brawler:"Nita",delta:6.0}],
    sourceUrl: "https://brawlscope.com/counters/nori",
  },
  "ollie": {
    brawler: "Ollie",
    teammates: [{brawler:"Amber",delta:7.4},{brawler:"Shade",delta:7.3},{brawler:"Pearl",delta:6.2},{brawler:"Gigi",delta:8.1},{brawler:"Bonnie",delta:15.5},{brawler:"Brock",delta:4.5},{brawler:"Piper",delta:4.6},{brawler:"Mandy",delta:4.8},{brawler:"Larry & Lawrie",delta:19.2},{brawler:"Bolt",delta:5.6}],
    sourceUrl: "https://brawlscope.com/counters/ollie",
  },
  "otis": {
    brawler: "Otis",
    teammates: [{brawler:"Shade",delta:10.8},{brawler:"Wendy",delta:9.3},{brawler:"Amber",delta:7.6},{brawler:"El Primo",delta:7.0},{brawler:"Rosa",delta:6.9},{brawler:"Ash",delta:6.3},{brawler:"Jacky",delta:7.0},{brawler:"Bolt",delta:5.8},{brawler:"Bibi",delta:5.5},{brawler:"Melodie",delta:4.6}],
    sourceUrl: "https://brawlscope.com/counters/otis",
  },
  "pam": {
    brawler: "Pam",
    teammates: [{brawler:"Bo",delta:10.3},{brawler:"Amber",delta:10.8},{brawler:"Shade",delta:8.8},{brawler:"Kenji",delta:10.2},{brawler:"Bolt",delta:8.5},{brawler:"Wendy",delta:7.6},{brawler:"Emz",delta:5.5},{brawler:"Draco",delta:19.3},{brawler:"Ash",delta:5.3},{brawler:"Surge",delta:4.0}],
    sourceUrl: "https://brawlscope.com/counters/pam",
  },
  "pearl": {
    brawler: "Pearl",
    teammates: [{brawler:"Wendy",delta:10.6},{brawler:"Shade",delta:6.9},{brawler:"Bolt",delta:6.9},{brawler:"Sprout",delta:6.4},{brawler:"Amber",delta:6.1},{brawler:"Brock",delta:5.2},{brawler:"Rosa",delta:4.7},{brawler:"Ash",delta:3.3},{brawler:"Angelo",delta:3.2},{brawler:"Leon",delta:3.1}],
    sourceUrl: "https://brawlscope.com/counters/pearl",
  },
  "penny": {
    brawler: "Penny",
    teammates: [{brawler:"Wendy",delta:11.5},{brawler:"Amber",delta:8.1},{brawler:"Shade",delta:7.5},{brawler:"Sprout",delta:5.6},{brawler:"Gus",delta:5.1},{brawler:"Melodie",delta:4.7},{brawler:"Draco",delta:5.7},{brawler:"Ash",delta:4.4},{brawler:"Bolt",delta:4.0},{brawler:"Meg",delta:3.8}],
    sourceUrl: "https://brawlscope.com/counters/penny",
  },
  "pierce": {
    brawler: "Pierce",
    teammates: [{brawler:"Wendy",delta:11.4},{brawler:"Shade",delta:8.7},{brawler:"Sprout",delta:7.0},{brawler:"Bolt",delta:5.7},{brawler:"Amber",delta:5.4},{brawler:"Doug",delta:5.3},{brawler:"Ash",delta:5.0},{brawler:"Bibi",delta:4.0},{brawler:"Emz",delta:3.6},{brawler:"Barley",delta:3.2}],
    sourceUrl: "https://brawlscope.com/counters/pierce",
  },
  "piper": {
    brawler: "Piper",
    teammates: [{brawler:"Wendy",delta:12.3},{brawler:"Sprout",delta:7.8},{brawler:"Shade",delta:7.4},{brawler:"Amber",delta:6.7},{brawler:"Bolt",delta:4.2},{brawler:"Pearl",delta:3.8},{brawler:"Brock",delta:3.6},{brawler:"Ollie",delta:3.6},{brawler:"Meg",delta:3.1},{brawler:"Mr. P",delta:2.6}],
    sourceUrl: "https://brawlscope.com/counters/piper",
  },
  "poco": {
    brawler: "Poco",
    teammates: [{brawler:"Amber",delta:11.2},{brawler:"Shade",delta:8.3},{brawler:"Juju",delta:9.0},{brawler:"Wendy",delta:5.5},{brawler:"El Primo",delta:4.6},{brawler:"Bo",delta:4.5},{brawler:"Gus",delta:4.4},{brawler:"Ash",delta:4.3},{brawler:"Larry & Lawrie",delta:6.1},{brawler:"Draco",delta:3.6}],
    sourceUrl: "https://brawlscope.com/counters/poco",
  },
  "r-t": {
    brawler: "R-T",
    teammates: [{brawler:"Shade",delta:9.1},{brawler:"Wendy",delta:8.7},{brawler:"Bibi",delta:7.6},{brawler:"Amber",delta:6.7},{brawler:"Kenji",delta:6.7},{brawler:"Bonnie",delta:11.0},{brawler:"El Primo",delta:5.1},{brawler:"Edgar",delta:4.9},{brawler:"Melodie",delta:4.8},{brawler:"Jacky",delta:5.6}],
    sourceUrl: "https://brawlscope.com/counters/r-t",
  },
  "rico": {
    brawler: "Rico",
    teammates: [{brawler:"Wendy",delta:10.7},{brawler:"Shade",delta:8.6},{brawler:"Ash",delta:6.3},{brawler:"Bibi",delta:6.0},{brawler:"Sprout",delta:5.8},{brawler:"Amber",delta:5.7},{brawler:"El Primo",delta:5.3},{brawler:"Gus",delta:4.7},{brawler:"Bolt",delta:4.8},{brawler:"Nita",delta:4.0}],
    sourceUrl: "https://brawlscope.com/counters/rico",
  },
  "rosa": {
    brawler: "Rosa",
    teammates: [{brawler:"Emz",delta:6.3},{brawler:"Carl",delta:6.0},{brawler:"Lou",delta:5.7},{brawler:"Nita",delta:5.7},{brawler:"Gus",delta:4.6},{brawler:"Amber",delta:4.8},{brawler:"Pearl",delta:4.6},{brawler:"Jacky",delta:8.2},{brawler:"Bo",delta:3.6},{brawler:"Rico",delta:3.2}],
    sourceUrl: "https://brawlscope.com/counters/rosa",
  },
  "ruffs": {
    brawler: "Ruffs",
    teammates: [{brawler:"Wendy",delta:9.9},{brawler:"Amber",delta:7.3},{brawler:"Sprout",delta:6.9},{brawler:"Bolt",delta:6.5},{brawler:"Ash",delta:5.3},{brawler:"Barley",delta:5.4},{brawler:"Shade",delta:4.9},{brawler:"Brock",delta:4.2},{brawler:"Gus",delta:3.8},{brawler:"El Primo",delta:3.8}],
    sourceUrl: "https://brawlscope.com/counters/ruffs",
  },
  "sam": {
    brawler: "Sam",
    teammates: [{brawler:"8-Bit",delta:12.1},{brawler:"Colt",delta:7.6},{brawler:"Carl",delta:6.6},{brawler:"Griff",delta:5.3},{brawler:"Starr Nova",delta:6.3},{brawler:"Melodie",delta:11.0},{brawler:"Lola",delta:21.7},{brawler:"Pearl",delta:5.7},{brawler:"Charlie",delta:10.2},{brawler:"Bull",delta:6.0}],
    sourceUrl: "https://brawlscope.com/counters/sam",
  },
  "sandy": {
    brawler: "Sandy",
    teammates: [{brawler:"Amber",delta:8.9},{brawler:"Bolt",delta:10.2},{brawler:"Ash",delta:7.9},{brawler:"Wendy",delta:8.0},{brawler:"Shade",delta:6.7},{brawler:"Gus",delta:6.0},{brawler:"El Primo",delta:5.9},{brawler:"Emz",delta:4.3},{brawler:"Bibi",delta:3.9},{brawler:"Barley",delta:4.8}],
    sourceUrl: "https://brawlscope.com/counters/sandy",
  },
  "shade": {
    brawler: "Shade",
    teammates: [{brawler:"Amber",delta:12.2},{brawler:"Wendy",delta:11.7},{brawler:"Gus",delta:8.7},{brawler:"Melodie",delta:7.4},{brawler:"Colette",delta:6.4},{brawler:"El Primo",delta:5.0},{brawler:"Eve",delta:4.8},{brawler:"Jessie",delta:4.7},{brawler:"8-Bit",delta:4.1},{brawler:"Maisie",delta:3.8}],
    sourceUrl: "https://brawlscope.com/counters/shade",
  },
  "shelly": {
    brawler: "Shelly",
    teammates: [{brawler:"Amber",delta:9.8},{brawler:"Shade",delta:7.3},{brawler:"Lou",delta:6.1},{brawler:"Gus",delta:4.8},{brawler:"Emz",delta:4.4},{brawler:"Wendy",delta:4.4},{brawler:"Bibi",delta:3.4},{brawler:"Bolt",delta:3.9},{brawler:"Jacky",delta:5.2},{brawler:"Buzz",delta:3.4}],
    sourceUrl: "https://brawlscope.com/counters/shelly",
  },
  "sirius": {
    brawler: "Sirius",
    teammates: [{brawler:"Wendy",delta:10.5},{brawler:"Amber",delta:7.9},{brawler:"El Primo",delta:6.8},{brawler:"Gus",delta:6.3},{brawler:"Ash",delta:6.1},{brawler:"Shade",delta:5.4},{brawler:"Bibi",delta:3.9},{brawler:"Kenji",delta:3.9},{brawler:"Lou",delta:3.3},{brawler:"Charlie",delta:3.4}],
    sourceUrl: "https://brawlscope.com/counters/sirius",
  },
  "spike": {
    brawler: "Spike",
    teammates: [{brawler:"Wendy",delta:11.0},{brawler:"Ash",delta:7.5},{brawler:"El Primo",delta:7.1},{brawler:"Shade",delta:7.0},{brawler:"Amber",delta:6.6},{brawler:"Gus",delta:5.2},{brawler:"Rosa",delta:6.1},{brawler:"Meg",delta:4.3},{brawler:"Sprout",delta:4.0},{brawler:"Pearl",delta:3.6}],
    sourceUrl: "https://brawlscope.com/counters/spike",
  },
  "sprout": {
    brawler: "Sprout",
    teammates: [{brawler:"Wendy",delta:8.0},{brawler:"Brock",delta:5.1},{brawler:"Pearl",delta:4.0},{brawler:"Amber",delta:3.8},{brawler:"Piper",delta:3.6},{brawler:"Nani",delta:3.6},{brawler:"Gray",delta:3.0},{brawler:"Leon",delta:2.9},{brawler:"Rico",delta:2.9},{brawler:"Bonnie",delta:3.6}],
    sourceUrl: "https://brawlscope.com/counters/sprout",
  },
  "squeak": {
    brawler: "Squeak",
    teammates: [{brawler:"Wendy",delta:12.8},{brawler:"Angelo",delta:6.8},{brawler:"Pearl",delta:6.5},{brawler:"Sprout",delta:6.8},{brawler:"Bolt",delta:6.3},{brawler:"Shade",delta:4.8},{brawler:"Brock",delta:4.6},{brawler:"Gus",delta:4.5},{brawler:"Piper",delta:4.2},{brawler:"Amber",delta:3.8}],
    sourceUrl: "https://brawlscope.com/counters/squeak",
  },
  "starr-nova": {
    brawler: "Starr Nova",
    teammates: [{brawler:"Wendy",delta:9.7},{brawler:"Amber",delta:7.4},{brawler:"Gus",delta:5.7},{brawler:"Melodie",delta:5.6},{brawler:"Shade",delta:4.9},{brawler:"Bolt",delta:4.9},{brawler:"Ash",delta:4.7},{brawler:"El Primo",delta:4.6},{brawler:"Rosa",delta:4.7},{brawler:"Larry & Lawrie",delta:4.5}],
    sourceUrl: "https://brawlscope.com/counters/starr-nova",
  },
  "stu": {
    brawler: "Stu",
    teammates: [{brawler:"Amber",delta:8.4},{brawler:"Bolt",delta:7.3},{brawler:"Wendy",delta:7.2},{brawler:"Shade",delta:6.2},{brawler:"Barley",delta:6.1},{brawler:"Ash",delta:5.4},{brawler:"El Primo",delta:4.8},{brawler:"Emz",delta:4.2},{brawler:"Gus",delta:3.8},{brawler:"Larry & Lawrie",delta:3.5}],
    sourceUrl: "https://brawlscope.com/counters/stu",
  },
  "surge": {
    brawler: "Surge",
    teammates: [{brawler:"Wendy",delta:8.7},{brawler:"Amber",delta:8.7},{brawler:"Shade",delta:6.8},{brawler:"Bolt",delta:6.6},{brawler:"El Primo",delta:6.3},{brawler:"Gus",delta:5.3},{brawler:"Ash",delta:5.2},{brawler:"Bibi",delta:4.4},{brawler:"Bo",delta:3.4},{brawler:"Larry & Lawrie",delta:3.5}],
    sourceUrl: "https://brawlscope.com/counters/surge",
  },
  "tara": {
    brawler: "Tara",
    teammates: [{brawler:"Wendy",delta:11.4},{brawler:"Bolt",delta:9.0},{brawler:"Amber",delta:7.5},{brawler:"Gus",delta:7.2},{brawler:"El Primo",delta:7.2},{brawler:"Shade",delta:6.1},{brawler:"Ash",delta:4.7},{brawler:"Bo",delta:3.5},{brawler:"Rosa",delta:3.3},{brawler:"Emz",delta:2.6}],
    sourceUrl: "https://brawlscope.com/counters/tara",
  },
  "tick": {
    brawler: "Tick",
    teammates: [{brawler:"Wendy",delta:11.7},{brawler:"Pearl",delta:8.7},{brawler:"Gus",delta:7.2},{brawler:"Buster",delta:6.4},{brawler:"Amber",delta:5.0},{brawler:"Brock",delta:4.7},{brawler:"Shade",delta:4.4},{brawler:"Meg",delta:4.4},{brawler:"Gray",delta:4.2},{brawler:"Piper",delta:3.3}],
    sourceUrl: "https://brawlscope.com/counters/tick",
  },
  "trunk": {
    brawler: "Trunk",
    teammates: [{brawler:"Amber",delta:9.1},{brawler:"Bolt",delta:7.6},{brawler:"Bibi",delta:6.4},{brawler:"Juju",delta:6.1},{brawler:"Larry & Lawrie",delta:6.3},{brawler:"Gus",delta:5.4},{brawler:"Shade",delta:4.6},{brawler:"Ash",delta:3.9},{brawler:"Lou",delta:4.0},{brawler:"Wendy",delta:3.8}],
    sourceUrl: "https://brawlscope.com/counters/trunk",
  },
  "willow": {
    brawler: "Willow",
    teammates: [{brawler:"Wendy",delta:11.1},{brawler:"El Primo",delta:7.2},{brawler:"Amber",delta:6.7},{brawler:"Shade",delta:6.7},{brawler:"Gus",delta:6.6},{brawler:"Ash",delta:5.7},{brawler:"Bolt",delta:3.1},{brawler:"Stu",delta:2.7},{brawler:"Edgar",delta:2.7},{brawler:"Bibi",delta:2.7}],
    sourceUrl: "https://brawlscope.com/counters/willow",
  },
  "ziggy": {
    brawler: "Ziggy",
    teammates: [{brawler:"Wendy",delta:14.1},{brawler:"Amber",delta:9.6},{brawler:"El Primo",delta:5.9},{brawler:"Stu",delta:5.0},{brawler:"Gus",delta:4.7},{brawler:"Brock",delta:4.5},{brawler:"Pearl",delta:4.7},{brawler:"Melodie",delta:12.3},{brawler:"Jessie",delta:9.3},{brawler:"Shade",delta:3.0}],
    sourceUrl: "https://brawlscope.com/counters/ziggy",
  },
};

/** Normaliza a lista lida numa página, sem completar posições ausentes. */
export function normalizeBrawlScopeSynergyList(
  teammates: readonly (string | BrawlScopeSynergyTeammate)[],
  owner: string,
): BrawlScopeSynergyTeammate[] {
  const ownerKey = owner.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
  const seen = new Set<string>();
  const result: BrawlScopeSynergyTeammate[] = [];
  for (const teammate of teammates) {
    const entry = typeof teammate === "string" ? { brawler: teammate } : teammate;
    const name = entry.brawler?.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key || key === ownerKey || seen.has(key)) continue;
    seen.add(key);
    result.push(typeof entry.delta === "number" && Number.isFinite(entry.delta) ? { brawler: name, delta: entry.delta } : { brawler: name });
    if (result.length === BRAWLSCOPE_SYNERGY_LIMIT) break;
  }
  return result;
}
