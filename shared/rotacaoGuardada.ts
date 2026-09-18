/**
 * A rotação Ranked lida no navegador, guardada para o site a poder usar.
 *
 * POR QUE ISTO EXISTE
 *
 * A rotação mudou — entraram mapas e saíram outros — e o site não deu por
 * nada. A extensão continuou a recolher os mapas antigos e a fila continuou a
 * oferecê-los, porque a lista que a alimenta é escrita à mão no projeto.
 *
 * Isto não era um descuido pontual: é o que TEM de acontecer sempre que a
 * Supercell mexe na rotação, porque a única forma de o site saber quais são os
 * mapas de agora é ler o índice do TopBrawl — e esse índice responde 403 a
 * pedidos vindos do alojamento, tal como as páginas de cada mapa. O site nunca
 * mais o vai conseguir ler sozinho, e ficar à espera de eu corrigir a lista a
 * cada rotação é uma avaria de calendário.
 *
 * A saída é a mesma que já resolveu os mapas: a página abre sem problema no
 * navegador de quem usa o site. A extensão passa a ler também o ÍNDICE, e é de
 * lá que a rotação vem. Quando entra um mapa novo, ele entra sozinho na fila
 * seguinte; quando sai um, deixa de ser pedido.
 *
 * A lista do projeto não desaparece: continua a servir de rede quando ainda não
 * houver leitura nenhuma guardada. Deixa é de ser a única verdade.
 */

import { MIN_PLAUSIBLE_MAPS, type DiscoveredRankedMap } from "./rankedRotationSource";

/** Chave em `app_settings`. Sem migração: a tabela é criada no arranque. */
export const ROTACAO_GUARDADA_SETTING = "rankedRotationCapture";

export type RotacaoGuardada = {
  /** Os mapas que o índice publicava quando foi lido. */
  maps: DiscoveredRankedMap[];
  /** Quando a leitura foi mesmo feita, no navegador. */
  capturedAt: string;
};

/**
 * Uma leitura guardada só pode substituir a lista do projeto se for plausível.
 *
 * O mesmo raciocínio de `parseRankedRotationIndex`: um parser partido lê zero
 * mapas, e zero mapas lido como verdade significa "a rotação acabou". Aqui o
 * risco é maior, não menor — esta leitura vem de fora e pode ter sido gravada
 * há semanas. Abaixo do mínimo plausível é tratada como inexistente.
 */
export function rotacaoUtilizavel(guardada: RotacaoGuardada | null | undefined): guardada is RotacaoGuardada {
  return Boolean(guardada && Array.isArray(guardada.maps) && guardada.maps.filter((mapa) => mapa?.id && mapa?.name).length >= MIN_PLAUSIBLE_MAPS);
}

/** Lê o que está guardado, sem deixar um valor estragado derrubar o site. */
export function lerRotacaoGuardada(bruto: string | null | undefined): RotacaoGuardada | null {
  if (!bruto) return null;
  try {
    const lido = JSON.parse(bruto) as RotacaoGuardada;
    if (!rotacaoUtilizavel(lido)) return null;
    return {
      capturedAt: typeof lido.capturedAt === "string" ? lido.capturedAt : new Date(0).toISOString(),
      maps: lido.maps.filter((mapa) => mapa?.id && mapa?.name),
    };
  } catch {
    return null;
  }
}
