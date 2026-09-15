/*
 * AUTO-GERADO a partir do catálogo completo de matchups BrawlScope
 * (shared/brawlScopeMatchupDeltas.generated.ts), que é a mesma tabela que alimenta
 * as duas listas visíveis de cada perfil público.
 *
 * Gerado em: 2026-09-11T15:47:00.049Z
 * Reexecutar com: node server/scripts/rebuild-brawlscope-counters.mjs
 *
 * `counteredBy` = os 10 adversários com maior delta positivo, ou seja, quem
 * pune o titular ("Counter with" na página). `targets` = os 10 adversários com
 * delta mais negativo, ou seja, quem o titular pune ("Punishes" na página). A ordem
 * é a da fonte, por magnitude do delta publicado. Nenhuma relação é inferida e não
 * existe qualquer troca de campos: o que está em `counteredBy` countera o titular.
 */
export interface BrawlScopeCounterEntry {
  counteredBy: string[];
  targets: string[];
  sourceUrl: string;
}

export const brawlScopeCounterData: Record<string, BrawlScopeCounterEntry> = {
  "8-bit": {
    counteredBy: ["Barley","Grom","Dynamike","Ziggy","Squeak","Sprout","Bo","Larry & Lawrie","Nori","Ollie"],
    targets: ["Darryl","R-T","Jacky","Melodie","Fang","Frank","Chuck","Doug","Shelly","Alli"],
    sourceUrl: "https://brawlscope.com/counters?brawler=8-bit",
  },
  "alli": {
    counteredBy: ["Jacky","Darryl","Pam","Doug","Rosa","Bull","Damian","Kenji","Trunk","Shelly"],
    targets: ["Ziggy","Sprout","Piper","Najia","Dynamike","Sirius","Ollie","Squeak","Leon","Belle"],
    sourceUrl: "https://brawlscope.com/counters?brawler=alli",
  },
  "amber": {
    counteredBy: [],
    targets: ["Doug","Trunk","Shelly","Gale","Frank","Sirius","Lou","Pam","Glowy","Bolt"],
    sourceUrl: "https://brawlscope.com/counters?brawler=amber",
  },
  "angelo": {
    counteredBy: ["Nori","Kenji","Wendy","Bibi","Shade","Finx","Chuck","Cordelius","Penny","Tara"],
    targets: ["Jacky","Sandy","Barley","Sirius","Dynamike","Poco","Lou","Larry & Lawrie","Willow","Juju"],
    sourceUrl: "https://brawlscope.com/counters?brawler=angelo",
  },
  "ash": {
    counteredBy: ["Frank","Dynamike","Juju"],
    targets: ["Sprout","Najia","Leon","Ollie","Finx","Buster","Gigi","Tick","Gray","Brock"],
    sourceUrl: "https://brawlscope.com/counters?brawler=ash",
  },
  "barley": {
    counteredBy: ["Sam","Angelo","Frank","Bolt","Ziggy","Darryl","Edgar","Ollie","Mandy","Kenji"],
    targets: ["Pam","8-Bit","Tara","Rosa","Mr. P","Charlie","Crow","Finx","Bonnie","Ruffs"],
    sourceUrl: "https://brawlscope.com/counters?brawler=barley",
  },
  "bea": {
    counteredBy: ["Larry & Lawrie","Sprout","Charlie","Nani","Tick","Jae-Yong","Najia","Grom","Draco","Sam"],
    targets: ["Clancy","Jacky","R-T","Hank","Berry","Doug","Lily","Frank","Bibi","Nita"],
    sourceUrl: "https://brawlscope.com/counters?brawler=bea",
  },
  "belle": {
    counteredBy: ["Draco","Sandy","Finx","Jessie","Mico","Alli","Kenji","Chuck","Sprout","Nita"],
    targets: ["Jacky","Larry & Lawrie","Berry","Clancy","Sam","Rosa","R-T","El Primo","Bull","Frank"],
    sourceUrl: "https://brawlscope.com/counters?brawler=belle",
  },
  "berry": {
    counteredBy: ["Sandy","Sam","Bea","Belle","Tick","Lou","Eve","Frank","Ziggy","Grom"],
    targets: ["Tara","Chuck","Draco","Wendy","Lola","Buster","Charlie","El Primo","Bonnie","Damian"],
    sourceUrl: "https://brawlscope.com/counters?brawler=berry",
  },
  "bibi": {
    counteredBy: ["Bea","Lou","Lumi","Shelly","Belle","Crow"],
    targets: ["Ollie","Ziggy","Tick","Penny","Wendy","Brock","Angelo","Bolt","Berry","Gigi"],
    sourceUrl: "https://brawlscope.com/counters?brawler=bibi",
  },
  "bo": {
    counteredBy: ["Bolt","Mico","Mina","Mortis","Dynamike","Kenji","Starr Nova","Kaze","Hank","Melodie"],
    targets: ["Pam","Jae-Yong","Rosa","Jacky","8-Bit","Glowy","Berry","Fang","Tick","Doug"],
    sourceUrl: "https://brawlscope.com/counters?brawler=bo",
  },
  "bolt": {
    counteredBy: ["Poco","Melodie","Maisie","Gus","Doug","Gale","Mico","Shelly","Clancy","Jacky"],
    targets: ["Ziggy","Sprout","Barley","Larry & Lawrie","Janet","Sirius","Grom","Najia","Bo","Mortis"],
    sourceUrl: "https://brawlscope.com/counters?brawler=bolt",
  },
  "bonnie": {
    counteredBy: ["Larry & Lawrie","Sam","Buster","R-T","Charlie","Kenji","Chuck","Shelly","Berry","Barley"],
    targets: ["Sandy","Gale","Nita","Ollie","Mr. P","Lumi","Poco","Willow","Darryl","Grom"],
    sourceUrl: "https://brawlscope.com/counters?brawler=bonnie",
  },
  "brock": {
    counteredBy: ["Draco","Finx","Bibi","Nita","Bull","Melodie","Ash","Mico","Colt","Kaze"],
    targets: ["Juju","Buster","Larry & Lawrie","Sirius","Gene","Ziggy","Mr. P","Sprout","Barley","Doug"],
    sourceUrl: "https://brawlscope.com/counters?brawler=brock",
  },
  "bull": {
    counteredBy: ["Lou","Clancy","Janet","R-T","Sirius","Gale","Otis","Griff","Belle","Juju"],
    targets: ["Sprout","Grom","Squeak","Alli","Ollie","Brock","Gigi","Mortis","Kaze","Kenji"],
    sourceUrl: "https://brawlscope.com/counters?brawler=bull",
  },
  "buster": {
    counteredBy: ["Jacky","Tick","Dynamike","Grom","Janet","Spike","Gale","Brock","Ziggy","Sprout"],
    targets: ["Sam","Bonnie","Glowy","Nori","Finx","Lily","Melodie","Jae-Yong","Kaze","Mina"],
    sourceUrl: "https://brawlscope.com/counters?brawler=buster",
  },
  "buzz": {
    counteredBy: ["Gale","Larry & Lawrie","R-T","Jessie","Maisie","Angelo","Lou","Colette","Berry","Clancy"],
    targets: ["Glowy","Jae-Yong","Ziggy","Sprout","Grom","Ollie","Kenji","Trunk","Sam","Squeak"],
    sourceUrl: "https://brawlscope.com/counters?brawler=buzz",
  },
  "byron": {
    counteredBy: ["Chuck","Grom","Alli","Tick","Ash","Mico","Brock","Meg","Pam","Squeak"],
    targets: ["Jacky","Berry","Rosa","El Primo","Hank"],
    sourceUrl: "https://brawlscope.com/counters?brawler=byron",
  },
  "carl": {
    counteredBy: ["Sam","Bibi","Nori","Jacky","Bull","Frank","Bolt","El Primo","Fang","Maisie"],
    targets: ["Mr. P","Grom","Ziggy","Pam","Alli","Nita","Jessie","Larry & Lawrie","Tara","Penny"],
    sourceUrl: "https://brawlscope.com/counters?brawler=carl",
  },
  "charlie": {
    counteredBy: ["Larry & Lawrie","Chuck","Grom","Squeak","Poco","Barley","Jessie","Berry","Mico","Sprout"],
    targets: ["Shelly","Bonnie","Bea","Sam","Lou","Cordelius","Bull","Hank","Fang","Mr. P"],
    sourceUrl: "https://brawlscope.com/counters?brawler=charlie",
  },
  "chester": {
    counteredBy: ["Jacky","Juju","Larry & Lawrie","El Primo","Bonnie","Mandy","Dynamike","Willow","Ash","Sirius"],
    targets: ["Jae-Yong","Nani","Glowy","Buster","Colt","Ollie","Melodie","Nori","Squeak","Gigi"],
    sourceUrl: "https://brawlscope.com/counters?brawler=chester",
  },
  "chuck": {
    counteredBy: ["Berry","Nori","Mico","Lily","Sam","8-Bit","Colt","Janet","Gene","Buster"],
    targets: ["Sprout","Charlie","Grom","Jae-Yong","Mandy","Juju","Larry & Lawrie"],
    sourceUrl: "https://brawlscope.com/counters?brawler=chuck",
  },
  "clancy": {
    counteredBy: ["Mr. P","Bea","Lola","Sirius","Belle","Pam","Larry & Lawrie","Hank","Jae-Yong","Eve"],
    targets: ["Lily","Jacky","Bull","Doug","Melodie","Najia","Sandy","Grom","Bolt","Finx"],
    sourceUrl: "https://brawlscope.com/counters?brawler=clancy",
  },
  "colette": {
    counteredBy: ["Bea","Tara","Berry","Eve","Grom","Juju","Nori","Spike","Dynamike","Sirius"],
    targets: ["Sam","Frank","Draco","Glowy","Jacky","El Primo","Kit","Darryl","R-T","Doug"],
    sourceUrl: "https://brawlscope.com/counters?brawler=colette",
  },
  "colt": {
    counteredBy: ["Nori","Meeple","Leon","Stu","Chester","Lumi","Janet","Mina","Gene","Damian"],
    targets: ["Juju","R-T","Nani","Brock","Mandy","Bolt","Chuck","Doug","Larry & Lawrie","Barley"],
    sourceUrl: "https://brawlscope.com/counters?brawler=colt",
  },
  "cordelius": {
    counteredBy: ["Pam","Sirius","Ruffs","Juju","Sam","Lou","Rosa","Charlie","Hank","Frank"],
    targets: ["Glowy","Jessie","Darryl","Gigi","Squeak","Melodie","Sprout","Angelo","Brock","Bolt"],
    sourceUrl: "https://brawlscope.com/counters?brawler=cordelius",
  },
  "crow": {
    counteredBy: ["Mr. P","Barley","Lola","Sprout","Nori","Eve","Chuck","Mico","Gray","Wendy"],
    targets: ["Trunk","Ollie"],
    sourceUrl: "https://brawlscope.com/counters?brawler=crow",
  },
  "damian": {
    counteredBy: ["Pam","Doug","Berry","Chuck","Juju","Willow","Emz","Belle","Kit","R-T"],
    targets: ["Melodie","Alli","Lola","Ziggy","Grom","Barley","Gigi","Kenji","Mina","Sandy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=damian",
  },
  "darryl": {
    counteredBy: ["Sirius","Shelly","Sandy","8-Bit","Sam","Hank","Finx","Trunk","Cordelius","Colette"],
    targets: ["Barley","Alli","Grom","Draco","Larry & Lawrie","Sprout","Rosa","Ziggy","Piper","Tick"],
    sourceUrl: "https://brawlscope.com/counters?brawler=darryl",
  },
  "doug": {
    counteredBy: ["Jessie","Frank","Dynamike","Lumi","Lou","Juju","Bea","Griff","Gale","Nita"],
    targets: ["Sam","Melodie","Sprout","Najia","Alli","Jae-Yong","Mr. P","Nori","Gigi","Leon"],
    sourceUrl: "https://brawlscope.com/counters?brawler=doug",
  },
  "draco": {
    counteredBy: ["Nita","Juju","Frank","Sirius","Najia","Pam","Willow","Darryl","Colette","Jessie"],
    targets: ["Sprout","Belle","Mandy","Gigi","Janet","Maisie","Tick","Penny","Squeak","Ziggy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=draco",
  },
  "dynamike": {
    counteredBy: ["Angelo","Kaze","Mortis","Nori","Alli","Kenji","Max","Piper","Melodie","Stu"],
    targets: ["Nita","Sirius","Doug","Glowy","Hank","Buster","Rosa","Ziggy","8-Bit","Tara"],
    sourceUrl: "https://brawlscope.com/counters?brawler=dynamike",
  },
  "edgar": {
    counteredBy: ["R-T","Lou","Finx","Maisie","Pam","Crow","Doug","Gale","Shelly","Fang"],
    targets: ["Ziggy","Sprout","Barley","Grom","Najia","Larry & Lawrie","Squeak","Mr. P","Dynamike","Ollie"],
    sourceUrl: "https://brawlscope.com/counters?brawler=edgar",
  },
  "el-primo": {
    counteredBy: ["Shade","Berry","Glowy","Colette","Melodie","Angelo","Byron","Belle"],
    targets: ["Grom","Barley","Sam","Ziggy","Frank","Meeple","Buster","Rosa","Pam","Sandy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=el-primo",
  },
  "emz": {
    counteredBy: ["Bea","Ziggy","Dynamike","Barley","Juju","El Primo","Willow"],
    targets: ["Doug","Tick","Finx","Buster","Leon","Gray","Draco","Tara","Ash","Pam"],
    sourceUrl: "https://brawlscope.com/counters?brawler=emz",
  },
  "eve": {
    counteredBy: ["Tara","Janet","Pam","Trunk","Nori","Rosa","Sam","Poco","Bull","Sprout"],
    targets: ["Gale","Shelly","Stu","Hank","Berry","Finx","Clancy","Moe","Ziggy","Frank"],
    sourceUrl: "https://brawlscope.com/counters?brawler=eve",
  },
  "fang": {
    counteredBy: ["Griff","8-Bit","Finx","Tara","Bo","R-T","Eve","Lola","Gale","Clancy"],
    targets: ["Sam","Ziggy","Barley","Larry & Lawrie","Nori","Berry","Gigi","Grom","Kenji","Moe"],
    sourceUrl: "https://brawlscope.com/counters?brawler=fang",
  },
  "finx": {
    counteredBy: ["Larry & Lawrie","Hank","Shelly","Jae-Yong","Buster","Emz","Ash","Eve","Rosa","Sirius"],
    targets: ["Maisie","Belle","Brock","R-T","Darryl","Melodie","Edgar","Fang","Angelo","Penny"],
    sourceUrl: "https://brawlscope.com/counters?brawler=finx",
  },
  "frank": {
    counteredBy: ["Mr. P","Colette","Lou","Bea","Jessie","El Primo","Juju","Maisie","Dynamike","Angelo"],
    targets: ["Jae-Yong","Doug","Draco","Hank","Barley","Rosa","Lily","Jacky","Ash","Wendy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=frank",
  },
  "gale": {
    counteredBy: ["Pam","Bonnie","Larry & Lawrie","Eve","Juju","Ziggy","Dynamike","Amber","Meeple","Sprout"],
    targets: ["Lola","Sam","Shelly","Rosa","Doug","Buster","Bolt","Buzz","Trunk","Bull"],
    sourceUrl: "https://brawlscope.com/counters?brawler=gale",
  },
  "gene": {
    counteredBy: ["Tara","Sandy","Brock","Tick","Grom","Penny","Squeak","Ash","Maisie","Shelly"],
    targets: ["Draco","Nori","Jacky","Bea","Colt","Otis","Chuck","Stu","Crow","Gus"],
    sourceUrl: "https://brawlscope.com/counters?brawler=gene",
  },
  "gigi": {
    counteredBy: ["Draco","Jacky","Sam","Hank","Doug","Sandy","Ash","Bibi","Maisie","Bull"],
    targets: ["Sprout","Grom","Pam","Moe","Sirius","Lola","Spike","Jessie","Dynamike","Finx"],
    sourceUrl: "https://brawlscope.com/counters?brawler=gigi",
  },
  "glowy": {
    counteredBy: ["Ollie","Cordelius","Dynamike","Janet","Tara","Poco","Buster","Lily","Larry & Lawrie","Moe"],
    targets: ["Rosa","Trunk","Kenji","Jae-Yong","Hank","El Primo","Leon","Doug","Bolt","Shelly"],
    sourceUrl: "https://brawlscope.com/counters?brawler=glowy",
  },
  "gray": {
    counteredBy: ["Nita","Poco","Jessie","Ash","Emz","Draco","Trunk","Chuck","Frank","Doug"],
    targets: ["Barley","Sprout","Jacky","Dynamike","Nori","Moe","Crow","Lumi","Ziggy","Mico"],
    sourceUrl: "https://brawlscope.com/counters?brawler=gray",
  },
  "griff": {
    counteredBy: ["Bea","El Primo","Gus","Mandy","Sprout","Amber","Ziggy","Barley","Meeple","Gene"],
    targets: ["Doug","Fang","Trunk","Glowy","Bull","Pam","Rosa","Sam","Darryl","Frank"],
    sourceUrl: "https://brawlscope.com/counters?brawler=griff",
  },
  "grom": {
    counteredBy: ["Melodie","Hank","Gigi","Ollie","Edgar","Darryl","Chuck","El Primo","Mico","Bolt"],
    targets: ["Jae-Yong","Sirius","Ziggy","Juju","Buster","Jessie","Charlie","8-Bit","Sandy","Sprout"],
    sourceUrl: "https://brawlscope.com/counters?brawler=grom",
  },
  "gus": {
    counteredBy: [],
    targets: ["Bolt","Jacky","Kenji","Hank","Draco","Mortis","Stu","Shelly","Lumi","Moe"],
    sourceUrl: "https://brawlscope.com/counters?brawler=gus",
  },
  "hank": {
    counteredBy: ["Rosa","Frank","Dynamike","Lou","Bea","Eve","Glowy","Otis","Jessie","Pierce"],
    targets: ["Janet","Mr. P","Grom","Jacky","Gigi","Mico","Kaze","Sandy","Finx","Clancy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=hank",
  },
  "jacky": {
    counteredBy: ["Ziggy","Piper","Belle","Angelo","Jessie","Byron","Bea","Hank","Pierce","Mandy"],
    targets: ["Buster","Tick","Alli","Kit","Najia","Gigi","Mico","Melodie","Lily","Tara"],
    sourceUrl: "https://brawlscope.com/counters?brawler=jacky",
  },
  "jae-yong": {
    counteredBy: ["Frank","Ziggy","Grom","Chester","Lumi","Doug","Chuck","Shelly","Bo","Buzz"],
    targets: ["Mico","Nita","Finx","Janet","Juju","Lola","Mr. P","Nori","Poco","Clancy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=jae-yong",
  },
  "janet": {
    counteredBy: ["Hank","Draco","Ollie","Ziggy","Mico","Bolt","Willow","Jae-Yong","Jessie","Squeak"],
    targets: ["Eve","Juju","Lola","Glowy","Sirius","Buster","Bull","Pam","Sandy","Colt"],
    sourceUrl: "https://brawlscope.com/counters?brawler=janet",
  },
  "jessie": {
    counteredBy: ["Grom","Nori","Dynamike","Cordelius","Gigi","Ziggy","Shelly","Starr Nova","Carl","Shade"],
    targets: ["Mr. P","Jacky","Doug","Juju","Draco","Squeak","Sirius","Rosa","Belle","Frank"],
    sourceUrl: "https://brawlscope.com/counters?brawler=jessie",
  },
  "juju": {
    counteredBy: ["Jessie","Janet","Sandy","Mr. P","Grom","Brock","Nani","Colt","Jae-Yong","Chuck"],
    targets: ["Draco","Lola","Doug","Shelly","Gale","Tara","Glowy","Frank","Shade","Ash"],
    sourceUrl: "https://brawlscope.com/counters?brawler=juju",
  },
  "kaze": {
    counteredBy: ["Nori","Hank","Tara","Pam","Nita","Buster","Jacky","Bull","Bibi","Draco"],
    targets: ["Dynamike","Ziggy","Ollie","Barley","Larry & Lawrie","Brock","Piper","Willow","Sprout","Angelo"],
    sourceUrl: "https://brawlscope.com/counters?brawler=kaze",
  },
  "kenji": {
    counteredBy: ["R-T","Glowy","Rosa","Chuck","Doug","Nita","Shelly","Bull","Gus","Sam"],
    targets: ["Ziggy","Barley","Sprout","Squeak","Angelo","Penny","Dynamike","Mico","Bonnie","Alli"],
    sourceUrl: "https://brawlscope.com/counters?brawler=kenji",
  },
  "kit": {
    counteredBy: ["Lola","Jacky","Pam","Poco","Colette","Doug","Maisie","Trunk","Fang","Shelly"],
    targets: ["Larry & Lawrie","Sprout","Barley"],
    sourceUrl: "https://brawlscope.com/counters?brawler=kit",
  },
  "larry-and-lawrie": {
    counteredBy: ["Belle","Rosa","Bolt","Ollie","Kit","Edgar","Darryl","Trunk","Brock","Kaze"],
    targets: ["Lola","Sandy","Charlie","Bonnie","Gale","Finx","Bea","Mr. P","Poco","Glowy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=larry-and-lawrie",
  },
  "leon": {
    counteredBy: ["Rosa","Tara","Doug","Ash","Poco","Emz","Pam","Jacky","Glowy","Penny"],
    targets: ["Colt","Bea","Draco","Nani","Nori","Najia","Piper","Angelo","Gray","Frank"],
    sourceUrl: "https://brawlscope.com/counters?brawler=leon",
  },
  "lily": {
    counteredBy: ["Ollie","Clancy","Jacky","R-T","Bea","Frank","Doug","Rosa","Buster","Jessie"],
    targets: ["Moe","Glowy","Najia","Nani","Ziggy","Barley","Juju","Alli","Chuck","Sprout"],
    sourceUrl: "https://brawlscope.com/counters?brawler=lily",
  },
  "lola": {
    counteredBy: ["Gale","Ollie","Larry & Lawrie","Janet","Juju","Squeak","Sirius","Nori","Sam","Dynamike"],
    targets: ["Kit","Clancy","Mr. P","Nani","Melodie","Sandy","Crow","Darryl","Mandy","Doug"],
    sourceUrl: "https://brawlscope.com/counters?brawler=lola",
  },
  "lou": {
    counteredBy: ["Angelo","Larry & Lawrie","Najia","Charlie","Jessie","Amber","Dynamike","Melodie","Belle","Bo"],
    targets: ["Hank","Trunk","Doug","Frank","Jacky","Berry","Bull","Bibi","Sam","Rosa"],
    sourceUrl: "https://brawlscope.com/counters?brawler=lou",
  },
  "lumi": {
    counteredBy: ["Bonnie","Ziggy","Bea","Barley","Gray","Bo","Gus","Nori","Wendy","Fang"],
    targets: ["Doug","Jae-Yong","Nita","Bibi","Mr. P","Jacky","Ash","Colt"],
    sourceUrl: "https://brawlscope.com/counters?brawler=lumi",
  },
  "maisie": {
    counteredBy: ["Draco","Ziggy","Finx","Sam","Bea","Dynamike","Mandy","Sirius","Mr. P","Janet"],
    targets: ["Pam","Bolt","Frank","Gigi","Nori","Kit","Sandy","Edgar","Buzz","Barley"],
    sourceUrl: "https://brawlscope.com/counters?brawler=maisie",
  },
  "mandy": {
    counteredBy: ["Draco","Chuck","Mico","Jessie","Brock","Lola","Colt","Melodie","Penny","Bibi"],
    targets: ["Sirius","Jacky","Barley","Moe","Sam","Larry & Lawrie","R-T","Frank","Stu","Juju"],
    sourceUrl: "https://brawlscope.com/counters?brawler=mandy",
  },
  "max": {
    counteredBy: ["Draco","Poco","Buster","Jacky","Berry","Doug","Pam","Glowy","Buzz","Damian"],
    targets: ["Dynamike","Colt","Grom","Willow","Ziggy","Juju","Bo","Nani","Trunk","R-T"],
    sourceUrl: "https://brawlscope.com/counters?brawler=max",
  },
  "meeple": {
    counteredBy: ["Ollie","El Primo","Pam","Trunk","Ash","Frank","Rosa","Alli","Bolt","Tick"],
    targets: ["Colt","Gale","Melodie","Finx","Cordelius"],
    sourceUrl: "https://brawlscope.com/counters?brawler=meeple",
  },
  "meg": {
    counteredBy: ["Pam","Larry & Lawrie","El Primo","Jessie","Barley","Sam","Nita","Poco","Bolt","Moe"],
    targets: ["Nani","Jae-Yong","Brock","Colt","Angelo","Byron","Belle","Colette","Squeak","Pearl"],
    sourceUrl: "https://brawlscope.com/counters?brawler=meg",
  },
  "melodie": {
    counteredBy: ["Doug","Jacky","Nori","Damian","Clancy","Buster","Lola","Finx","Nita","8-Bit"],
    targets: ["Grom","Ziggy","Mr. P","Tick","Sandy","Sprout","Squeak","Bolt","Pam","Wendy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=melodie",
  },
  "mico": {
    counteredBy: ["Jae-Yong","Sam","Nori","Hank","Jacky","Trunk","Doug","Kenji","Stu","Shade"],
    targets: ["Janet","Ziggy","Grom","Squeak","Barley","Bo","Mandy","Spike","Sprout","Bolt"],
    sourceUrl: "https://brawlscope.com/counters?brawler=mico",
  },
  "mina": {
    counteredBy: ["Hank","Trunk","Jacky","Sandy","Buster","Chuck","Rosa","Kenji","Damian","Poco"],
    targets: ["Ziggy","Bo","Sam","Colt","Dynamike","Barley","Berry","Penny","Lola","8-Bit"],
    sourceUrl: "https://brawlscope.com/counters?brawler=mina",
  },
  "moe": {
    counteredBy: ["Sam","Mandy","Lily","Sprout","Gigi","Eve","Larry & Lawrie","Jacky","Jessie","Wendy"],
    targets: ["Glowy","Grom","Pam","Draco","Hank","Finx","Jae-Yong","Buster","Colt","Bibi"],
    sourceUrl: "https://brawlscope.com/counters?brawler=moe",
  },
  "mortis": {
    counteredBy: ["Pam","Shelly","Doug","Bolt","Draco","Trunk","Chuck","Bull","Jacky","Gale"],
    targets: ["Ziggy","Sprout","Barley","Dynamike","Grom","Janet","Lola","Alli","Mico","Bo"],
    sourceUrl: "https://brawlscope.com/counters?brawler=mortis",
  },
  "mr-p": {
    counteredBy: ["Melodie","Jessie","Hank","Sam","Trunk","Doug","Larry & Lawrie","Lola","Bonnie","Barley"],
    targets: ["Frank","Clancy","Juju","Shelly","Crow","Stu","Willow","Leon","Tara","Mico"],
    sourceUrl: "https://brawlscope.com/counters?brawler=mr-p",
  },
  "najia": {
    counteredBy: ["Jacky","Doug","Alli","Ash","Edgar","Bolt","Clancy","Nita","Melodie","Lily"],
    targets: ["Draco","R-T","Bea","Lou","Lola","Berry","Willow","Pam","Sirius","Larry & Lawrie"],
    sourceUrl: "https://brawlscope.com/counters?brawler=najia",
  },
  "nani": {
    counteredBy: ["Sam","Draco","Lola","Chester","Hank","Lily","Colt","Ollie","Berry","Meg"],
    targets: ["Sandy","Nita","Jacky","Juju","Bea","Janet","Dynamike","R-T","Sirius","Fang"],
    sourceUrl: "https://brawlscope.com/counters?brawler=nani",
  },
  "nita": {
    counteredBy: ["Jae-Yong","Nani","Dynamike","Bonnie","Lumi","Bea","Ziggy","Angelo","Juju","Maisie"],
    targets: ["Draco","Tick","Gray","Grom","Doug","Wendy","Najia","Buster","Brock","Glowy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=nita",
  },
  "nori": {
    counteredBy: ["Doug","Buster","Jacky","Jae-Yong","Gene","Trunk","Ollie","Fang","Maisie","Pearl"],
    targets: ["Mico","Lola","Melodie","Eve","Barley","Kaze","Colt","Angelo","Dynamike","Ziggy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=nori",
  },
  "ollie": {
    counteredBy: ["Rosa","Shelly","Sandy","Bibi","Bonnie","Jacky","Poco","Kaze","Ash","Bull"],
    targets: ["Lola","Glowy","Lily","Janet","Ziggy","Grom","Barley","Larry & Lawrie","Sprout","Sirius"],
    sourceUrl: "https://brawlscope.com/counters?brawler=ollie",
  },
  "otis": {
    counteredBy: ["Ziggy","Barley","Berry","Grom","Gene","Sprout","Larry & Lawrie","Ollie","Meeple","Najia"],
    targets: ["Hank","Bull","Trunk","Doug","Draco","Darryl","Rosa","Edgar","Shelly","Kenji"],
    sourceUrl: "https://brawlscope.com/counters?brawler=otis",
  },
  "pam": {
    counteredBy: ["Willow","Maisie","Barley","Sandy","Melodie","Bo","Gigi","Janet","Moe","El Primo"],
    targets: ["Shelly","Eve","Gale","Cordelius","Draco","Alli","Mortis","Kaze","Clancy","Wendy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=pam",
  },
  "pearl": {
    counteredBy: ["Pam","Draco","Mico","Emz","El Primo","Bull","Dynamike","Nita","Bo","Tara"],
    targets: ["Nori","Darryl","Hank","Jacky","Berry","Jae-Yong","Janet","Edgar","Kit","Lily"],
    sourceUrl: "https://brawlscope.com/counters?brawler=pearl",
  },
  "penny": {
    counteredBy: ["Draco","Bibi","Sandy","Kenji","Poco","Nori","Sam","Trunk","Nita","Ziggy"],
    targets: ["Sirius","Janet","Leon","Buster","Tara","Charlie","Lola","Angelo","Gene","Mandy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=penny",
  },
  "pierce": {
    counteredBy: ["Grom","Chuck","Barley","Alli","Nori","Tick","Ash","Bo","Nita","Wendy"],
    targets: ["Jacky","Hank","Frank","Juju","Doug","R-T"],
    sourceUrl: "https://brawlscope.com/counters?brawler=pierce",
  },
  "piper": {
    counteredBy: ["Alli","Sam","Mico","Doug","Melodie","Kaze","Darryl","Lily","Kenji","Penny"],
    targets: ["Jacky","Larry & Lawrie","Dynamike","Barley","Sirius","Hank","Juju","El Primo","Poco","Bea"],
    sourceUrl: "https://brawlscope.com/counters?brawler=piper",
  },
  "poco": {
    counteredBy: ["Angelo","Larry & Lawrie","Bonnie","Jae-Yong","Dynamike","Jessie","Barley","El Primo","Doug","Lola"],
    targets: ["Bolt","Glowy","Sam","Gray","Penny","Leon","Ollie","Charlie","Max","Stu"],
    sourceUrl: "https://brawlscope.com/counters?brawler=poco",
  },
  "r-t": {
    counteredBy: ["Bea","Tick","8-Bit","Dynamike","Sirius","Finx","Colt","Mandy","Najia","Grom"],
    targets: ["Shelly","Kenji","Lily","Bonnie","Bull","Edgar","Glowy","Berry","Buzz","Jae-Yong"],
    sourceUrl: "https://brawlscope.com/counters?brawler=r-t",
  },
  "rico": {
    counteredBy: ["Dynamike","El Primo","Berry","Gigi","Sprout","Willow","Ziggy","Alli","Bea","Najia"],
    targets: ["Doug","Pam","Trunk","Nita","Sirius","Kenji","Ash","Charlie","Melodie","R-T"],
    sourceUrl: "https://brawlscope.com/counters?brawler=rico",
  },
  "rosa": {
    counteredBy: ["Glowy","Frank","Gale","Barley","Dynamike","Draco","Jessie","Shelly","Pam","Bo"],
    targets: ["Ollie","Hank","Larry & Lawrie","Sam","Leon","Ziggy","Alli","Eve","Lily","Buster"],
    sourceUrl: "https://brawlscope.com/counters?brawler=rosa",
  },
  "ruffs": {
    counteredBy: ["Barley","Frank","Sprout","Sam","Poco","El Primo","Jacky","Grom","Pam","Penny"],
    targets: ["Cordelius","Melodie","Clancy","Finx"],
    sourceUrl: "https://brawlscope.com/counters?brawler=ruffs",
  },
  "sam": {
    counteredBy: ["Doug","Buster","Fang","Rosa","Gale","Colette","El Primo","Poco","Belle","Charlie"],
    targets: ["Barley","Sandy","Mico","Mr. P","Gigi","Sprout","Bonnie","Moe","Berry","Nani"],
    sourceUrl: "https://brawlscope.com/counters?brawler=sam",
  },
  "sandy": {
    counteredBy: ["Melodie","Bonnie","Sam","Larry & Lawrie","Nani","Angelo","Grom","Hank","Tick","Clancy"],
    targets: ["Juju","Ollie","Berry","Pam","Belle","Sprout","Penny","Darryl","Gigi","Gene"],
    sourceUrl: "https://brawlscope.com/counters?brawler=sandy",
  },
  "shade": {
    counteredBy: ["Jacky"],
    targets: ["Sprout","El Primo","Ziggy","Angelo","Grom","Mico","Wendy","Bolt","Penny","Pam"],
    sourceUrl: "https://brawlscope.com/counters?brawler=shade",
  },
  "shelly": {
    counteredBy: ["Pam","R-T","Charlie","Mr. P","Gale","Sirius","Eve","Juju","Bea","Amber"],
    targets: ["Ollie","Mortis","Darryl","Jae-Yong","Finx","Grom","Rosa","Bolt","Alli","Bonnie"],
    sourceUrl: "https://brawlscope.com/counters?brawler=shelly",
  },
  "sirius": {
    counteredBy: ["Angelo","Dynamike","Grom","Mandy","Ziggy","Bolt","Tick","Janet","Ollie","Jessie"],
    targets: ["Draco","Lola","Darryl","Clancy","Shelly","Cordelius","R-T","Bull","Finx","Buster"],
    sourceUrl: "https://brawlscope.com/counters?brawler=sirius",
  },
  "spike": {
    counteredBy: ["Grom","Mico","Gigi","Barley","Dynamike","Chuck","Alli","Juju","El Primo","Brock"],
    targets: ["Buster","Glowy","Jacky","Bea","Bonnie","Fang","Moe","Pam","Colette","Clancy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=spike",
  },
  "sprout": {
    counteredBy: ["Draco","Bolt","Melodie","Gigi","Trunk","Ash","Edgar","Bull","Doug","Sam"],
    targets: ["Bea","Moe","Jacky","Buster","Amber","Pam","Sirius","8-Bit","Charlie","Crow"],
    sourceUrl: "https://brawlscope.com/counters?brawler=sprout",
  },
  "squeak": {
    counteredBy: ["Melodie","Draco","Kenji","Mico","Jessie","Bull","Edgar","Trunk","Chuck","Frank"],
    targets: ["Lola","Charlie","Janet","8-Bit","Doug","Sirius","Buster","Juju","Pam","Jae-Yong"],
    sourceUrl: "https://brawlscope.com/counters?brawler=squeak",
  },
  "starr-nova": {
    counteredBy: ["Jacky","Hank","Buster","Rosa","Frank","Trunk","Gus","Bibi","Buzz","Sandy"],
    targets: ["Barley","Tick","Ollie","Pam","Dynamike","Grom","Jessie","Ziggy","Bo","Larry & Lawrie"],
    sourceUrl: "https://brawlscope.com/counters?brawler=starr-nova",
  },
  "stu": {
    counteredBy: ["Eve","Mr. P","Poco","Pam","Mandy","Angelo","Wendy","Doug","Frank","Draco"],
    targets: ["Colt","Tick","Dynamike","Mico","Squeak","Brock","Gigi","Ollie","Melodie","Edgar"],
    sourceUrl: "https://brawlscope.com/counters?brawler=stu",
  },
  "surge": {
    counteredBy: ["Chuck","Mico","Bea","Mandy","Rosa","Mr. P","Buster","Darryl","R-T","Gene"],
    targets: ["Ollie","Squeak","Brock","Bibi","Mina","Tick","Nori","Jae-Yong","Bo","Glowy"],
    sourceUrl: "https://brawlscope.com/counters?brawler=surge",
  },
  "tara": {
    counteredBy: ["Berry","Barley","Jacky","Ziggy","Dynamike","Juju","Larry & Lawrie","Willow","Hank","Emz"],
    targets: ["Eve","Glowy","Leon","Kaze","Gene","Clancy","Jae-Yong","Melodie","Colette","Fang"],
    sourceUrl: "https://brawlscope.com/counters?brawler=tara",
  },
  "tick": {
    counteredBy: ["Melodie","Jacky","Nita","Draco","Bibi","Trunk","Pam","Emz","Ash","Bolt"],
    targets: ["Buster","Sprout","Barley","Sirius","Sandy","Berry","R-T","Glowy","Juju","Bea"],
    sourceUrl: "https://brawlscope.com/counters?brawler=tick",
  },
  "trunk": {
    counteredBy: ["Lou","Glowy","Pam","Gale","Crow","Griff","Bea","Amber","Otis","Buzz"],
    targets: ["Eve","Sprout","Mr. P","Mico","Barley","Tick","Wendy","Larry & Lawrie","Mina","Penny"],
    sourceUrl: "https://brawlscope.com/counters?brawler=trunk",
  },
  "wendy": {
    counteredBy: [],
    targets: ["Angelo","Finx","Stu","Moe","Crow","Alli","Gray","Leon","Shelly","Lumi"],
    sourceUrl: "https://brawlscope.com/counters?brawler=wendy",
  },
  "willow": {
    counteredBy: ["Angelo","Mr. P","Grom","Tick","Chuck","Bonnie","Alli","Kaze","Najia","Sam"],
    targets: ["Pam","Draco","Janet","Tara","Sandy","Damian","Emz","Gigi","Lola","Finx"],
    sourceUrl: "https://brawlscope.com/counters?brawler=willow",
  },
  "ziggy": {
    counteredBy: ["Melodie","Bolt","Edgar","Kenji","Grom","Alli","Ollie","Bibi","Fang","Mortis"],
    targets: ["Jacky","Jae-Yong","Janet","Barley","Maisie","Sirius","Tara","8-Bit","Buster","Berry"],
    sourceUrl: "https://brawlscope.com/counters?brawler=ziggy",
  },
};
