/*
 * Tabelas "Every matchup" por modo, recolhidas das fichas públicas do BrawlScope
 * na patente Lendário+ (`/counters/<slug>?mode=<modo>`).
 *
 * Cada delta está na perspetiva da FONTE: positivo significa que o adversário leva
 * vantagem sobre o titular da ficha, tal como no catálogo geral. A conversão para a
 * perspetiva do candidato continua em `toOwnerPerspective`.
 *
 * ESTADO: recolha parcial de demonstração — 4 fichas de Nocaute, validadas
 * pelo checksum impresso em cada linha (taxa do par − delta = média do adversário).
 * Os pares que um modo ainda não publica usam o catálogo geral; é por isso que a
 * leitura "Por modo" funciona mesmo com a tabela incompleta.
 *
 * Completar com: node server/scripts/import-brawlscope-matchups.mjs
 * Gerado em: 2026-09-11T18:10:52
 */
export type BrawlScopeModeMatchups = Record<string, { sourceUrl: string; deltas: Record<string, number> }>;

export const brawlScopeMatchupsByMode: Record<string, BrawlScopeModeMatchups> = {
  gemGrab: {},
  brawlBall: {},
  knockout: {
    "8-Bit": { sourceUrl: "https://brawlscope.com/counters/8-bit?mode=knockout", deltas: { "Grom": 9.0, "Jessie": 12.8, "Brock": 5.8, "Ziggy": 6.6, "Barley": 6.1, "Pam": 14.7, "Dynamike": 6.2, "Squeak": 4.5, "Tick": 4.2, "Lily": 4.9, "Sprout": 3.7, "Bonnie": 4.5, "Larry & Lawrie": 4.7, "Rico": 2.8, "Tara": 6.7, "Najia": 2.6, "Willow": 2.8, "Bo": 2.6, "Berry": 2.8, "Pierce": 2.2, "Gigi": 2.1, "Mandy": 2.1, "Meeple": 2.1, "Amber": 2.0, "Mr. P": 2.3, "El Primo": 1.9, "Bea": 1.7, "Piper": 1.4, "Penny": 1.4, "Belle": 1.3, "Colt": 1.1, "Melodie": 4.3, "Sirius": 1.3, "Kenji": 1.8, "Nori": 0.8, "Mina": 0.7, "Spike": 0.6, "Kit": 0.4, "Kaze": 0.4, "Juju": 0.4, "Byron": 0.1, "Alli": 0.2, "Emz": 0.1, "Surge": 0.0, "Stu": -0.1, "Bolt": -0.2, "Max": -0.2, "Gale": -0.8, "Moe": -0.9, "Lola": -1.0, "Nani": -0.7, "Shade": -0.7, "Finx": -1.5, "Edgar": -0.9, "Gene": -0.9, "Angelo": -1.0, "Ollie": -1.4, "Buster": -1.4, "Griff": -1.6, "Colette": -1.7, "Mortis": -1.9, "Carl": -1.9, "Gray": -1.9, "Lou": -2.1, "Starr Nova": -2.1, "Gus": -2.1, "Ash": -4.5, "Cordelius": -3.1, "Buzz": -3.5, "Ruffs": -2.5, "Darryl": -3.1, "Otis": -2.7, "Charlie": -2.8, "Trunk": -4.0, "Crow": -3.3, "Bibi": -4.8, "Frank": -5.2, "Chester": -4.4, "Maisie": -4.0, "Leon": -3.2, "Eve": -3.5, "Janet": -5.5, "Chuck": -4.4, "Meg": -3.5, "Jae-Yong": -4.1, "Pearl": -3.5, "Wendy": -3.7, "Sam": -12.8, "Shelly": -7.1, "R-T": -5.1, "Poco": -5.5, "Mico": -6.5, "Hank": -12.4, "Rosa": -7.5, "Damian": -6.2, "Bull": -7.9, "Glowy": -8.5, "Lumi": -8.8, "Doug": -8.7, "Fang": -10.8 } },
    "Alli": { sourceUrl: "https://brawlscope.com/counters/alli?mode=knockout", deltas: { "Pearl": 10.9, "Surge": 12.8, "Tick": 11.9, "Gus": 10.3, "Mortis": 15.6, "Starr Nova": 13.4, "Griff": 9.0, "Darryl": 26.9, "Bull": 17.6, "Amber": 9.8, "Mandy": 7.8, "Ruffs": 8.8, "Spike": 15.9, "Pierce": 5.4, "Gene": 5.2, "Nani": 8.4, "Gray": 5.9, "Fang": 9.6, "Doug": 13.0, "Crow": 12.3, "Shade": 5.8, "Penny": 9.0, "Belle": 5.6, "El Primo": 6.3, "Meg": 4.2, "Otis": 5.1, "Bea": 8.1, "Frank": 11.4, "Max": 2.6, "Bolt": 8.1, "Mr. P": 8.5, "Nori": 2.9, "Grom": 4.7, "8-Bit": 3.0, "Damian": 3.8, "Wendy": 3.0, "Kit": 4.0, "Byron": 1.9, "Leon": 2.6, "Edgar": 2.0, "Buster": 2.6, "Brock": 1.4, "Meeple": 1.6, "Willow": 2.9, "R-T": 3.7, "Charlie": 2.8, "Carl": 1.5, "Eve": 2.0, "Angelo": 0.8, "Buzz": 1.1, "Lily": -0.8, "Gigi": -0.6, "Stu": -1.1, "Jae-Yong": -2.3, "Mico": -2.9, "Bo": -4.4, "Cordelius": -6.0, "Squeak": -2.8, "Piper": -1.9, "Colt": -3.6, "Sprout": -2.8, "Colette": -7.9, "Rico": -4.6, "Mina": -3.9, "Najia": -4.2, "Kaze": -22.0 } },
    "Amber": { sourceUrl: "https://brawlscope.com/counters/amber?mode=knockout", deltas: { "Jessie": 5.5, "Sprout": 2.0, "Jacky": 1.1, "Gigi": 0.2, "Janet": 0.2, "Hank": 0.2, "Grom": -0.1, "Berry": -1.2, "Clancy": -3.3, "Willow": -1.1, "Ollie": -1.4, "Edgar": -1.5, "Piper": -1.6, "Mandy": -1.6, "Frank": -3.1, "Mico": -2.4, "Bonnie": -2.6, "Bo": -2.5, "Byron": -2.5, "Ziggy": -3.0, "Rico": -2.7, "Pierce": -2.8, "Lily": -3.3, "El Primo": -2.9, "Lou": -3.5, "Dynamike": -3.4, "Carl": -3.2, "Jae-Yong": -3.5, "Colt": -3.3, "Melodie": -8.2, "Spike": -3.7, "Moe": -6.4, "Najia": -3.6, "Sirius": -4.4, "Sam": -8.9, "Pam": -12.7, "Glowy": -4.5, "Barley": -4.6, "Belle": -3.8, "Finx": -7.1, "Brock": -3.9, "Meeple": -3.9, "Nani": -4.1, "Nori": -4.1, "Angelo": -4.1, "Crow": -4.6, "Larry & Lawrie": -6.0, "Gus": -4.3, "Lola": -6.7, "Tara": -13.6, "Otis": -4.8, "Squeak": -4.8, "Tick": -4.9, "Chester": -7.0, "Bea": -5.4, "Gray": -4.8, "Colette": -5.0, "Starr Nova": -5.1, "Meg": -5.0, "Poco": -5.0, "Gale": -8.8, "Surge": -5.2, "Penny": -5.4, "Maisie": -5.5, "Juju": -6.9, "Mr. P": -6.1, "Pearl": -5.3, "Mina": -5.3, "Kaze": -6.1, "Chuck": -6.0, "Gene": -5.4, "Leon": -5.6, "Buzz": -6.4, "Max": -5.6, "Rosa": -9.9, "8-Bit": -5.8, "Wendy": -5.9, "R-T": -7.0, "Mortis": -6.1, "Stu": -6.5, "Alli": -10.1, "Lumi": -7.3, "Cordelius": -7.9, "Shade": -6.8, "Eve": -7.5, "Darryl": -8.1, "Fang": -7.5, "Kenji": -11.3, "Ruffs": -7.5, "Shelly": -12.4, "Bibi": -12.3, "Griff": -7.6, "Buster": -8.6, "Charlie": -9.8, "Bolt": -9.5, "Ash": -16.7, "Kit": -9.5, "Trunk": -13.8, "Emz": -12.7, "Bull": -13.5, "Doug": -12.0, "Damian": -13.4 } },
    "Angelo": { sourceUrl: "https://brawlscope.com/counters/angelo?mode=knockout", deltas: { "Ash": 10.2, "Bibi": 6.7, "Bolt": 3.5, "Jessie": 6.8, "Bonnie": 3.6, "Melodie": 9.8, "Wendy": 2.8, "Chester": 4.2, "Tara": 8.9, "Trunk": 4.6, "Shelly": 5.6, "Darryl": 2.5, "Pam": 6.6, "Moe": 4.4, "Glowy": 2.0, "Kit": 1.6, "Mr. P": 1.7, "Sam": 3.6, "Otis": 1.1, "Alli": 1.3, "Rosa": 1.3, "Mortis": 0.9, "Nori": 0.8, "Griff": 0.8, "Gray": 0.5, "Larry & Lawrie": 1.7, "Damian": 0.3, "Meg": 0.2, "Eve": 0.2, "Ruffs": 0.1, "Nani": 0.1, "Leon": 0.1, "Gene": 0.1, "Kaze": 0.0, "Spike": -0.1, "Hank": -0.8, "Penny": -0.3, "Sprout": -0.3, "Shade": -0.4, "Emz": -0.7, "8-Bit": -0.4, "Lily": -0.6, "Bo": -0.6, "Mina": -0.6, "Gale": -1.6, "Max": -0.7, "Maisie": -0.9, "Meeple": -0.7, "Amber": -0.7, "Piper": -0.8, "Cordelius": -1.6, "Carl": -1.0, "Gus": -1.2, "Berry": -2.6, "Lumi": -2.0, "Dynamike": -3.3, "Charlie": -1.4, "Willow": -2.3, "Byron": -1.7, "Barley": -5.5, "Belle": -1.8, "Najia": -1.9, "Jae-Yong": -2.1, "Rico": -1.9, "Mico": -3.2, "El Primo": -2.2, "Pearl": -2.1, "Colt": -2.1, "R-T": -2.5, "Mandy": -2.2, "Doug": -2.7, "Bull": -5.5, "Brock": -2.4, "Fang": -2.7, "Frank": -5.0, "Pierce": -2.5, "Buzz": -4.8, "Surge": -2.9, "Kenji": -5.1, "Bea": -3.0, "Ollie": -4.3, "Squeak": -3.0, "Grom": -4.3, "Colette": -3.3, "Ziggy": -6.4, "Starr Nova": -3.8, "Buster": -3.8, "Stu": -4.0, "Crow": -4.4, "Lola": -6.9, "Chuck": -6.6, "Finx": -10.2, "Edgar": -5.0, "Janet": -8.8, "Gigi": -6.0, "Tick": -6.3, "Juju": -11.6, "Sirius": -11.9, "Poco": -9.3, "Lou": -10.0 } },
  },
  heist: {},
  hotZone: {},
  bounty: {},
};

/** Quantos perfis cada modo já tem recolhidos. */
export function brawlScopeModeCoverage(): Record<string, number> {
  return Object.fromEntries(
    Object.entries(brawlScopeMatchupsByMode).map(([mode, profiles]) => [mode, Object.keys(profiles).length]),
  );
}
