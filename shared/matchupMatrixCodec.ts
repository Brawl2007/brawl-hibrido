/**
 * Formato compacto para guardar as matrizes de confrontos por modo.
 *
 * ## Porque é que isto precisa de existir
 *
 * As matrizes vivem em memória no servidor. Numa reinicialização perdem-se
 * todas, e a leitura "Por modo" do Draft cai para o catálogo geral até a recolha
 * voltar a percorrer as sete vistas — o que demora vários ciclos, porque a
 * recolha é deliberadamente lenta para não sobrecarregar a fonte. Na prática,
 * uma reinicialização a meio do dia desligava a funcionalidade sem o dizer.
 *
 * A solução é guardá-las com a snapshot. O problema é o tamanho: sete vistas ×
 * ~105 fichas × ~100 adversários dá perto de setenta mil números. Em JSON
 * literal, com o nome de cada adversário repetido em cada entrada, isso passa
 * dos 4 MB.
 *
 * ## Como encolhe
 *
 * Duas ideias simples:
 *
 * 1. **Dicionário de nomes.** Cada nome aparece uma vez; tudo o resto refere-se
 *    a ele por posição. "Larry & Lawrie" custa 14 caracteres uma vez, e zero de
 *    cada vez que volta a aparecer.
 * 2. **Uma linha por ficha, por posição.** Cada ficha publica quase todos os
 *    adversários, por isso a posição na lista de nomes basta para identificar o
 *    adversário: `"45,-12,,3"` é o quarto nome com 0,3 e o terceiro ausente.
 *    Assim não se gasta nada a repetir índices — só o valor e a vírgula.
 *
 * Os deltas são publicados com uma casa decimal, por isso guardam-se
 * multiplicados por dez e como inteiros — sem perda e sem `0.30000000000000004`.
 *
 * Medido contra a matriz geral real, dá cerca de 30% do JSON literal. É a
 * diferença entre guardar e não guardar.
 */

export type MatchupMatrices = Record<string, Record<string, Record<string, number>>>;

export type EncodedMatchupMatrices = {
  /** Versão do formato. Um valor desconhecido é ignorado em vez de mal lido. */
  v: 1;
  /** Dicionário de nomes; as posições nele são o que identifica cada brawler. */
  names: string[];
  /**
   * Por vista: índice da ficha → deltas×10 separados por vírgula, na ordem de
   * `names`. Uma posição vazia significa que a fonte não publica esse par.
   */
  views: Record<string, Record<string, string>>;
  /** Quando as matrizes foram recolhidas, em ISO. */
  capturedAt?: string;
};

const ESCALA = 10;

/** Converte um delta publicado (uma casa decimal) para inteiro, sem erro de vírgula flutuante. */
function paraInteiro(value: number) {
  return Math.round(value * ESCALA);
}

function paraDelta(value: number) {
  // A divisão por 10 pode reintroduzir ruído binário; o arredondamento fecha-o.
  return Math.round((value / ESCALA) * ESCALA) / ESCALA;
}

export function encodeMatchupMatrices(matrices: MatchupMatrices, capturedAt?: string | null): EncodedMatchupMatrices {
  const indexByName = new Map<string, number>();
  const names: string[] = [];
  const indexOf = (name: string) => {
    const existing = indexByName.get(name);
    if (existing !== undefined) return existing;
    const index = names.length;
    names.push(name);
    indexByName.set(name, index);
    return index;
  };

  /**
   * Os nomes são registados numa primeira passagem, antes de se escrever
   * qualquer linha: a codificação por posição exige que o dicionário esteja
   * completo, senão duas fichas usariam posições diferentes para o mesmo
   * adversário.
   */
  const limpo: Array<{ view: string; owner: string; deltas: Array<[string, number]> }> = [];
  for (const [view, profiles] of Object.entries(matrices ?? {})) {
    for (const [owner, deltas] of Object.entries(profiles ?? {})) {
      const pares = Object.entries(deltas ?? {})
        .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]));
      // Uma ficha sem pares não vale a pena guardar: ocuparia espaço a dizer nada.
      if (!pares.length) continue;
      indexOf(owner);
      for (const [foe] of pares) indexOf(foe);
      limpo.push({ view, owner, deltas: pares });
    }
  }

  const views: Record<string, Record<string, string>> = {};
  for (const { view, owner, deltas } of limpo) {
    const posicoes: string[] = [];
    for (const [foe, delta] of deltas) {
      posicoes[indexOf(foe)] = String(paraInteiro(delta));
    }
    // As posições vazias no fim não precisam de vírgulas a marcá-las.
    const linha = Array.from(posicoes, (value) => value ?? "").join(",").replace(/,+$/, "");
    if (!linha) continue;
    (views[view] ??= {})[String(indexOf(owner))] = linha;
  }

  return { v: 1, names, views, ...(capturedAt ? { capturedAt } : {}) };
}

/**
 * Lê o formato compacto. Nunca lança: um valor corrompido ou de uma versão
 * desconhecida devolve um objeto vazio, porque perder as matrizes é muito
 * melhor do que arrancar com números errados.
 */
export function decodeMatchupMatrices(encoded: unknown): MatchupMatrices {
  if (!encoded || typeof encoded !== "object") return {};
  const candidate = encoded as Partial<EncodedMatchupMatrices>;
  if (candidate.v !== 1 || !Array.isArray(candidate.names) || !candidate.views || typeof candidate.views !== "object") {
    return {};
  }

  const names = candidate.names;
  const nameAt = (raw: string) => {
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 && index < names.length ? names[index] : null;
  };

  const matrices: MatchupMatrices = {};
  for (const [view, profiles] of Object.entries(candidate.views)) {
    if (!profiles || typeof profiles !== "object") continue;
    const decoded: Record<string, Record<string, number>> = {};
    for (const [ownerIndex, line] of Object.entries(profiles as Record<string, unknown>)) {
      const owner = nameAt(ownerIndex);
      if (!owner || typeof line !== "string" || !line) continue;
      const deltas: Record<string, number> = {};
      line.split(",").forEach((raw, position) => {
        if (!raw) return; // posição vazia: a fonte não publica este par
        const foe = names[position];
        const value = Number(raw);
        if (!foe || !Number.isFinite(value)) return;
        deltas[foe] = paraDelta(value);
      });
      if (Object.keys(deltas).length) decoded[owner] = deltas;
    }
    if (Object.keys(decoded).length) matrices[view] = decoded;
  }
  return matrices;
}

/** Quantos pares o bloco codificado transporta, sem o descodificar por inteiro. */
export function countEncodedPairs(encoded: EncodedMatchupMatrices | null | undefined) {
  if (!encoded || encoded.v !== 1) return 0;
  let total = 0;
  for (const profiles of Object.values(encoded.views ?? {})) {
    for (const line of Object.values(profiles ?? {})) {
      // Só as posições preenchidas são pares; as vazias são ausências.
      if (typeof line === "string" && line) total += line.split(",").filter(Boolean).length;
    }
  }
  return total;
}
