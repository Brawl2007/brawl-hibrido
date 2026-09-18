/**
 * Quando um número assenta em poucos jogos, o site passa a dizê-lo.
 *
 * POR QUE ISTO EXISTE
 *
 * As duas fontes foram comparadas sobre o MESMO par mapa/brawler, na snapshot
 * `live-20260918174340`, agrupadas por quanto esse brawler é jogado:
 *
 *     uso no TopBrawl      linhas   discordância mediana entre as fontes
 *     0    a 0,25 %          102              9,77 pontos
 *     0,25 a 0,5  %          203              6,84 pontos
 *     0,5  a 1    %          397              8,87 pontos
 *     1    a 2    %          472              7,25 pontos
 *     2    a 5    %          664              3,82 pontos
 *     acima de 5  %          914              2,04 pontos
 *
 * Quanto menos um brawler é jogado, mais as duas fontes discordam — cinco vezes
 * mais entre os extremos. É a assinatura de amostra pequena: com poucos jogos,
 * a taxa de vitória é quase toda ruído.
 *
 * Os casos limite não são subtis. O Sam no In the Liminal: 18,2 % no TopBrawl e
 * 60,0 % no Brawl Planet. Quarenta e dois pontos. Um dos dois está errado, e o
 * site mostrava um número como se nada fosse — com a mesma letra de tier, as
 * mesmas casas decimais e a mesma cara de uma linha assente em milhares de
 * jogos.
 *
 * O SINAL JÁ ESTAVA NOS DADOS
 *
 * É a taxa de uso. Não foi preciso fonte nenhuma nova — só deixar de esconder o
 * que já lá estava.
 *
 * O QUE ISTO NÃO FAZ
 *
 * Não mexe no Score Híbrido nem no tier. Uma decisão dessas mudava rankings que
 * já estão a ser usados, e a pergunta "este número é de confiança?" responde-se
 * mostrando a resposta, não alterando o número por trás das costas de quem o lê.
 */

/**
 * Abaixo deste uso, a taxa de vitória é ruído a fingir de medição.
 *
 * Não é um número escolhido a gosto: é onde a discordância entre as fontes
 * salta de ~4 pontos para ~7-10. Acima de 2 % as duas fontes concordam ao ponto
 * de a diferença ser indistinguível de variação normal.
 */
export const USO_MINIMO_CONFIAVEL = 1;

/**
 * Acima desta diferença, as duas fontes não estão a medir a mesma coisa.
 *
 * Com 3,86 pontos de discordância mediana no conjunto todo, dez pontos é bem
 * fora do que a variação normal explica.
 */
export const DISCORDANCIA_GRITANTE = 10;

export type LinhaMedivel = {
  topBrawlUseRate?: number | null;
  brawlPlanetPickRate?: number | null;
  topBrawlWinRate?: number | null;
  brawlPlanetWinRate?: number | null;
};

export type ConfiancaDaLinha = {
  /** O número assenta em poucos jogos para ser levado à letra. */
  poucosJogos: boolean;
  /** As duas fontes dizem coisas muito diferentes sobre a mesma linha. */
  fontesDiscordam: boolean;
  /** Em pontos, quando as duas fontes existem. */
  diferencaEntreFontes: number | null;
};

/** O maior uso publicado por alguma fonte; `null` quando nenhuma o publicou. */
function usoConhecido(linha: LinhaMedivel): number | null {
  const valores = [linha.topBrawlUseRate, linha.brawlPlanetPickRate]
    .filter((valor): valor is number => typeof valor === "number");
  return valores.length ? Math.max(...valores) : null;
}

export function avaliarConfianca(linha: LinhaMedivel): ConfiancaDaLinha {
  const uso = usoConhecido(linha);
  const top = linha.topBrawlWinRate;
  const planet = linha.brawlPlanetWinRate;
  const diferenca = typeof top === "number" && typeof planet === "number"
    ? Math.abs(top - planet)
    : null;

  return {
    /**
     * Uso desconhecido NÃO é uso baixo. Sem o número não se sabe, e inventar
     * uma resposta aqui seria o mesmo erro que isto existe para corrigir.
     */
    poucosJogos: uso !== null && uso < USO_MINIMO_CONFIAVEL,
    fontesDiscordam: diferenca !== null && diferenca >= DISCORDANCIA_GRITANTE,
    diferencaEntreFontes: diferenca,
  };
}

/** A frase que explica a marca, ou `null` quando não há nada a explicar. */
export function explicarConfianca(confianca: ConfiancaDaLinha): string | null {
  const partes: string[] = [];
  if (confianca.poucosJogos) {
    partes.push(`Pouco jogado neste mapa (abaixo de ${USO_MINIMO_CONFIAVEL}% de uso): com poucos jogos, a taxa de vitória é quase toda ruído.`);
  }
  if (confianca.fontesDiscordam && confianca.diferencaEntreFontes !== null) {
    partes.push(`As duas fontes discordam ${confianca.diferencaEntreFontes.toFixed(1)} pontos sobre esta linha.`);
  }
  return partes.length ? partes.join(" ") : null;
}
