import importedSnapshot from "../reports/prodigy-counter-import.json";

export type PLProdigyCounterRelation = {
  brawler: string;
  sourceUrl: string;
  targets: string[];
  counteredBy: string[];
};

type ImportedEntry = PLProdigyCounterRelation & { status: string };

const entries = (importedSnapshot as { entries?: ImportedEntry[] }).entries ?? [];

/**
 * Snapshot literal extraída da matriz pública de guias do PL Prodigy.
 * Não infere direções: targets e counteredBy preservam as duas colunas
 * publicadas pelo próprio site.
 */
export const plProdigyCounterData: Record<string, PLProdigyCounterRelation> = Object.fromEntries(
  entries
    .filter(entry => entry.status === "imported" && entry.brawler && entry.sourceUrl)
    .map(entry => [entry.brawler, {
      brawler: entry.brawler,
      sourceUrl: entry.sourceUrl,
      targets: [...entry.targets],
      counteredBy: [...entry.counteredBy],
    }]),
);
