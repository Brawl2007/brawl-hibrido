/**
 * Reescreve `shared/brawlScopeCounterData.ts` a partir do catálogo completo de
 * matchups BrawlScope já presente no projeto (`brawlScopeMatchupDeltas.generated.ts`).
 *
 * Porquê: as duas listas que o BrawlScope publica em cada perfil — "Counter with"
 * (quem pune o titular) e "Punishes" (quem o titular pune) — são exatamente o topo
 * e a base dessa mesma tabela de matchups, ordenados pelo delta publicado. Derivar
 * as listas do catálogo não inventa nenhuma relação: reordena valores da mesma
 * fonte e mantém a URL do perfil para auditoria.
 *
 * Convenção de sinal da fonte, verificada na página pública de Nori:
 *   delta > 0  →  o adversário tem vantagem sobre o titular (countera o titular)
 *   delta < 0  →  o titular tem vantagem (pune o adversário)
 *
 * Uso:
 *   node server/scripts/rebuild-brawlscope-counters.mjs [--limit=10] [--dry-run]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DELTAS_PATH = path.resolve("shared/brawlScopeMatchupDeltas.generated.ts");
const OUTPUT_PATH = path.resolve("shared/brawlScopeCounterData.ts");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const limit = Number(args.get("limit") ?? 10);
const dryRun = args.get("dry-run") === "true";

function slugFor(brawler) {
  return brawler
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Lê o objeto gerado sem precisar de um transpilador: o ficheiro é JSON puro depois do `=`. */
async function readDeltas() {
  const source = await readFile(DELTAS_PATH, "utf8");
  const start = source.indexOf("{", source.indexOf("="));
  const end = source.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Não foi possível localizar o objeto de deltas.");
  return JSON.parse(source.slice(start, end + 1));
}

function serialize(entries) {
  const body = entries
    .map(
      (entry) =>
        `  ${JSON.stringify(entry.key)}: {\n` +
        `    counteredBy: [${entry.counteredBy.map((name) => JSON.stringify(name)).join(",")}],\n` +
        `    targets: [${entry.targets.map((name) => JSON.stringify(name)).join(",")}],\n` +
        `    sourceUrl: ${JSON.stringify(entry.sourceUrl)},\n` +
        `  },`,
    )
    .join("\n");

  return `/*
 * AUTO-GERADO a partir do catálogo completo de matchups BrawlScope
 * (shared/brawlScopeMatchupDeltas.generated.ts), que é a mesma tabela que alimenta
 * as duas listas visíveis de cada perfil público.
 *
 * Gerado em: ${new Date().toISOString()}
 * Reexecutar com: node server/scripts/rebuild-brawlscope-counters.mjs
 *
 * \`counteredBy\` = os ${limit} adversários com maior delta positivo, ou seja, quem
 * pune o titular ("Counter with" na página). \`targets\` = os ${limit} adversários com
 * delta mais negativo, ou seja, quem o titular pune ("Punishes" na página). A ordem
 * é a da fonte, por magnitude do delta publicado. Nenhuma relação é inferida e não
 * existe qualquer troca de campos: o que está em \`counteredBy\` countera o titular.
 */
export interface BrawlScopeCounterEntry {
  counteredBy: string[];
  targets: string[];
  sourceUrl: string;
}

export const brawlScopeCounterData: Record<string, BrawlScopeCounterEntry> = {
${body}
};
`;
}

async function main() {
  const deltas = await readDeltas();
  const entries = Object.entries(deltas)
    .map(([brawler, profile]) => {
      const pairs = Object.entries(profile.deltas ?? {}).filter(([, value]) => typeof value === "number");
      const counteredBy = pairs
        .filter(([, value]) => value > 0)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, limit)
        .map(([name]) => name);
      const targets = pairs
        .filter(([, value]) => value < 0)
        .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
        .slice(0, limit)
        .map(([name]) => name);
      return {
        key: slugFor(brawler),
        brawler,
        counteredBy,
        targets,
        // URL canónica do perfil, a mesma usada pelo catálogo de sinergia e pelas notas de auditoria.
        sourceUrl: `https://brawlscope.com/counters?brawler=${slugFor(brawler)}`,
        pairs: pairs.length,
      };
    })
    .filter((entry) => entry.counteredBy.length || entry.targets.length)
    .sort((left, right) => left.key.localeCompare(right.key));

  console.log(`Perfis com matchups: ${entries.length}`);
  const partial = entries.filter((entry) => entry.counteredBy.length < limit || entry.targets.length < limit);
  if (partial.length) {
    console.log(
      `Listas mais curtas que ${limit} (a fonte não publica mais pares nesse sentido): ` +
        partial.map((entry) => `${entry.brawler} (${entry.counteredBy.length}/${entry.targets.length})`).join(", "),
    );
  }

  if (dryRun) {
    console.log("--dry-run: nada foi escrito.");
    console.log(entries.slice(0, 2).map((entry) => `${entry.brawler}\n  counteredBy: ${entry.counteredBy.join(", ")}\n  targets: ${entry.targets.join(", ")}`).join("\n"));
    return;
  }

  await writeFile(OUTPUT_PATH, serialize(entries), "utf8");
  console.log(`Escrito ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
