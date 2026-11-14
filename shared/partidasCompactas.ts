/**
 * Partidas Ranked num formato compacto (v182).
 *
 * POR QUE EXISTE
 *
 * Cada partida ocupava três linhas na base (a partida, o rank e a qualidade) e,
 * por cima, dezoito linhas de agregados por confronto. Com 1,1 milhão de
 * partidas, abrir o Draft com a API ligada percorria o histórico inteiro em
 * mais de duzentas consultas — e só a conta em memória já levava dezenas de
 * segundos.
 *
 * Aqui uma partida é uma lista curta de números (~30 bytes), e as partidas de
 * um mapa num dia vivem juntas num "pacote". Os nomes dos brawlers vão uma só
 * vez por pacote e as equipas referem-nos pelo índice.
 *
 * Fica em `shared/` por ser pura: recebe partidas, devolve texto, e vice-versa.
 */

export type BatalhaCompacta = {
  /** Instante da partida, em segundos desde 1970 (UTC). */
  t: number;
  vencedores: string[];
  derrotados: string[];
  /** Nível médio de rank dos seis jogadores; 0 quando a API não o deu. */
  rank: number;
  /** Os seis jogadores têm o brawler no nível 11. */
  nivel11: boolean;
};

type Linha = [number, number[], number[], number, 0 | 1];
type Pacote = { v: 1; n: string[]; b: Linha[] };

const SEGUNDOS_POR_DIA = 86_400;

/** Dia da partida no formato AAAA-MM-DD (UTC): a granularidade dos pacotes. */
export function diaDaBatalha(t: number): string {
  return new Date(t * 1000).toISOString().slice(0, 10);
}

/** Primeiro instante (em segundos) de um dia AAAA-MM-DD. */
export function inicioDoDia(dia: string): number {
  return Math.floor(Date.parse(`${dia}T00:00:00.000Z`) / 1000);
}

/** O dia, `dias` antes do dia dado (AAAA-MM-DD). */
export function diaMenos(dia: string, dias: number): string {
  return diaDaBatalha(inicioDoDia(dia) - dias * SEGUNDOS_POR_DIA);
}

/**
 * A identidade de uma partida dentro do seu pacote.
 *
 * A mesma partida chega pela leitura de cada um dos jogadores que a jogaram, e
 * outra vez se o histórico de um deles for relido. O mapa e o modo já definem o
 * pacote, por isso a chave só precisa do instante e das duas equipas.
 */
export function chaveDaBatalha(b: Pick<BatalhaCompacta, "t" | "vencedores" | "derrotados">): string {
  return `${b.t}|${[...b.vencedores].sort().join(",")}|${[...b.derrotados].sort().join(",")}`;
}

export function empacotar(batalhas: readonly BatalhaCompacta[]): string {
  const indice = new Map<string, number>();
  const nomes: string[] = [];
  const indiceDe = (nome: string) => {
    let i = indice.get(nome);
    if (i === undefined) {
      i = nomes.length;
      indice.set(nome, i);
      nomes.push(nome);
    }
    return i;
  };
  const b: Linha[] = batalhas.map((batalha) => [
    batalha.t,
    batalha.vencedores.map(indiceDe),
    batalha.derrotados.map(indiceDe),
    batalha.rank,
    batalha.nivel11 ? 1 : 0,
  ]);
  return JSON.stringify({ v: 1, n: nomes, b } satisfies Pacote);
}

/** Lê um pacote. Um pacote estragado é um erro: nunca se devolve uma lista menor em silêncio. */
export function desempacotar(texto: string): BatalhaCompacta[] {
  const pacote = JSON.parse(texto) as Partial<Pacote>;
  if (pacote?.v !== 1 || !Array.isArray(pacote.n) || !Array.isArray(pacote.b)) {
    throw new Error("Pacote de partidas com formato desconhecido.");
  }
  const nomes = pacote.n;
  return pacote.b.map((linha) => {
    const [t, vencedores, derrotados, rank, nivel11] = linha;
    const nomeDe = (i: number) => {
      const nome = nomes[i];
      if (typeof nome !== "string") throw new Error("Pacote de partidas com índice de brawler inválido.");
      return nome;
    };
    return { t, vencedores: vencedores.map(nomeDe), derrotados: derrotados.map(nomeDe), rank, nivel11: nivel11 === 1 };
  });
}

/** Junta listas de partidas sem repetir nenhuma (a primeira ocorrência fica). */
export function semRepetidas(batalhas: readonly BatalhaCompacta[], jaExistentes: Iterable<string> = []) {
  const vistas = new Set<string>(jaExistentes);
  const unicas: BatalhaCompacta[] = [];
  for (const batalha of batalhas) {
    const chave = chaveDaBatalha(batalha);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    unicas.push(batalha);
  }
  return unicas;
}

/** O nível médio de rank de uma partida convertido na faixa que pesa a amostra. */
export function eloDoNivel(rank: number | null | undefined): "mestre" | "lendario" | "mitico" | "abaixo" {
  if (!rank) return "abaixo";
  return rank >= 19 ? "mestre" : rank >= 16 ? "lendario" : rank >= 13 ? "mitico" : "abaixo";
}
