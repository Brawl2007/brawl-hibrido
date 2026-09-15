import fs from "node:fs";
import path from "node:path";

const [sourceFile, outputFile, suppliedPlayerTag] = process.argv.slice(2);
if (!sourceFile || !outputFile) {
  throw new Error("Uso: node generate-observed-matchups.mjs <battles.json> <observedMatchups.ts> [#TAG_DO_JOGADOR]");
}

const payload = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
const pairCounts = new Map();
const maps = new Set();
let rankedMatches = 0;
const playerTag = (suppliedPlayerTag || process.env.BRAWL_STARS_PLAYER_TAG || "#PPQLQLG9J").trim().toUpperCase();

for (const item of payload.items ?? []) {
  const battle = item.battle;
  const teams = battle?.teams;
  const queriedTag = item.battle?.teams?.flat()?.find((player) => player.tag?.toUpperCase() === playerTag)?.tag;
  const ownTeamIndex = teams?.findIndex((team) => team.some((player) => player.tag === queriedTag)) ?? -1;
  const isRanked = battle?.type === "soloRanked" || battle?.type === "teamRanked" || battle?.type === "ranked";
  if (!isRanked || ownTeamIndex < 0 || !Array.isArray(teams) || teams.length !== 2) continue;
  if (battle.result !== "victory" && battle.result !== "defeat") continue;

  rankedMatches += 1;
  const map = item.event?.map ?? "Mapa não identificado";
  const mode = item.event?.mode ?? "Modo não identificado";
  maps.add(map);
  const winnerIndex = battle.result === "victory" ? ownTeamIndex : 1 - ownTeamIndex;

  for (const left of teams[0]) {
    for (const right of teams[1]) {
      const leftName = left.brawler?.name;
      const rightName = right.brawler?.name;
      if (!leftName || !rightName) continue;

      const add = (brawler, opponent, won) => {
        const key = `${map}\u0000${mode}\u0000${brawler}\u0000${opponent}`;
        const current = pairCounts.get(key) ?? { map, mode, brawler, opponent, wins: 0, losses: 0 };
        current.wins += won ? 1 : 0;
        current.losses += won ? 0 : 1;
        pairCounts.set(key, current);
      };

      add(leftName, rightName, winnerIndex === 0);
      add(rightName, leftName, winnerIndex === 1);
    }
  }
}

const rows = Array.from(pairCounts.values())
  .map((row) => ({ ...row, samples: row.wins + row.losses }))
  .sort((a, b) => a.map.localeCompare(b.map) || a.brawler.localeCompare(b.brawler) || a.opponent.localeCompare(b.opponent));

const source = {
  provider: "API oficial Brawl Stars / Supercell",
  receivedAt: new Date().toISOString(),
  sourcePlayerTag: playerTag,
  rankedMatches,
  mapCount: maps.size,
  pairObservations: rows.reduce((total, row) => total + row.samples, 0),
  minimumSample: 30,
  note: "Cada observação é um par de brawlers em equipas opostas numa partida Ranked 3v3. Não representa um duelo de lane isolado.",
};

const code = `/* Gerado a partir de logs oficiais recebidos; não editar manualmente. */\n\nexport type ObservedMatchup = {\n  map: string;\n  mode: string;\n  brawler: string;\n  opponent: string;\n  wins: number;\n  losses: number;\n  samples: number;\n};\n\nexport const observedMatchupSource = ${JSON.stringify(source, null, 2)} as const;\n\nexport const observedMatchups: ObservedMatchup[] = ${JSON.stringify(rows, null, 2)};\n`;

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, code);
