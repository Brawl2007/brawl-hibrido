/**
 * Levar o draft do Brawl Híbrido para a ferramenta de draft do PL Prodigy.
 *
 * A ferramenta deles (`/plprodigy`) não guarda o draft no endereço: o mapa e os
 * brawlers escolhidos vivem só no ecrã. Por isso um link simples abre-a sempre
 * vazia. O draft segue no fragmento (`#bh=…`), que o site deles ignora, e a
 * extensão Brawl Híbrido lê-o e faz os cliques que a pessoa faria: mapa, bans e
 * picks. Gasta os usos da conta de quem está a usar, como se clicasse à mão —
 * não consulta nada por trás nem contorna o limite de usos.
 *
 * O formato tem de ser o mesmo que `client/public/brawlscope-helper/pl-prodigy.js`
 * lê. Os dois lados têm teste a garantir isso.
 */
export const PL_PRODIGY_DRAFT_URL = "https://powerleagueprodigy.com/plprodigy";
export const PREFIXO_DO_DRAFT = "#bh=";

export type DraftParaPLProdigy = {
  /** Versão do formato, para a extensão recusar o que não conhece. */
  v: 1;
  mapa: string | null;
  /** A tua equipa: fica do lado esquerdo na ferramenta deles. */
  nossos: string[];
  /** O adversário: lado direito. */
  deles: string[];
  bans: string[];
};

const MAX_NOME = 40;
const limpar = (nomes: readonly (string | null | undefined)[], maximo: number) =>
  nomes
    .filter((nome): nome is string => typeof nome === "string")
    .map((nome) => nome.trim().slice(0, MAX_NOME))
    .filter(Boolean)
    .slice(0, maximo);

export function draftParaPLProdigy(entrada: {
  mapa?: string | null;
  nossos: readonly (string | null | undefined)[];
  deles: readonly (string | null | undefined)[];
  bans?: readonly (string | null | undefined)[];
}): DraftParaPLProdigy {
  return {
    v: 1,
    mapa: entrada.mapa?.trim().slice(0, 60) || null,
    nossos: limpar(entrada.nossos, 3),
    deles: limpar(entrada.deles, 3),
    bans: limpar(entrada.bans ?? [], 6),
  };
}

export function enderecoNoPLProdigy(draft: DraftParaPLProdigy) {
  return `${PL_PRODIGY_DRAFT_URL}${PREFIXO_DO_DRAFT}${encodeURIComponent(JSON.stringify(draft))}`;
}

/** O que a extensão faz ao abrir a página. Aqui para os testes provarem a ida e volta. */
export function lerDraftDoFragmento(fragmento: string): DraftParaPLProdigy | null {
  if (!fragmento.startsWith(PREFIXO_DO_DRAFT)) return null;
  try {
    const bruto = JSON.parse(decodeURIComponent(fragmento.slice(PREFIXO_DO_DRAFT.length))) as Partial<DraftParaPLProdigy>;
    if (bruto?.v !== 1) return null;
    return draftParaPLProdigy({
      mapa: typeof bruto.mapa === "string" ? bruto.mapa : null,
      nossos: Array.isArray(bruto.nossos) ? bruto.nossos : [],
      deles: Array.isArray(bruto.deles) ? bruto.deles : [],
      bans: Array.isArray(bruto.bans) ? bruto.bans : [],
    });
  } catch {
    return null;
  }
}
