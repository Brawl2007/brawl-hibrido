export type MapTsvRow = {
  name: string;
  mode: string;
};

export const MAP_TSV_HEADER = "Mapa\tModo";

/** Mantém cada mapa numa linha e cada coluna num campo TSV válido. */
export function escapeTsvField(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

export function buildMapsTsv(maps: readonly MapTsvRow[]): string {
  return [
    MAP_TSV_HEADER,
    ...maps.map((map) => `${escapeTsvField(map.name)}\t${escapeTsvField(map.mode)}`),
  ].join("\n");
}
