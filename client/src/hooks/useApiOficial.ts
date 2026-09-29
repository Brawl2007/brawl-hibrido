import { useCallback, useSyncExternalStore } from "react";
import { RANKS_DO_FILTRO, type IdDoRank } from "@shared/ranksDoRanked";

/**
 * O interruptor «API oficial» do site todo: Draft, Mapas e Matriz 1v1.
 *
 * Ligado, estas páginas usam só as partidas Ranked que o site recolhe da API
 * da Supercell e deixam de usar as outras fontes (BrawlScope, Brawl Planet,
 * TopBrawl, PL Prodigy). Desligado, voltam às fontes com os pesos de sempre.
 *
 * É um só estado para todas as páginas: ligá-lo no Draft liga-o nos Mapas e
 * na Matriz, e fica guardado no navegador. As chaves são as do antigo «Só API
 * oficial» do Draft, para quem já o tinha ligado não o perder.
 *
 * O período e o rank também são um só, e a página «Partidas» usa os mesmos:
 * com Lendário e 30 dias escolhidos lá, o Draft mostra exatamente os mesmos
 * números. Antes cada página tinha os seus, e a mesma pessoa via 60% num sítio
 * e 55% no outro para o mesmo brawler no mesmo mapa.
 */
const CHAVE = "draft-so-api-oficial";
const CHAVE_DOS_DIAS = "draft-so-api-oficial-dias";
const CHAVE_DO_RANK = "api-oficial-rank";

function lerRank(): IdDoRank | "" {
  try {
    const guardado = localStorage.getItem(CHAVE_DO_RANK) ?? "";
    return RANKS_DO_FILTRO.some((rank) => rank.id === guardado) ? (guardado as IdDoRank) : "";
  } catch {
    return "";
  }
}

function lerLigada() {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

function lerDias() {
  try {
    const texto = localStorage.getItem(CHAVE_DOS_DIAS);
    const guardado = Number(texto);
    return texto !== null && Number.isInteger(guardado) && guardado >= 0 && guardado <= 3650 ? guardado : 30;
  } catch {
    return 30;
  }
}

let estado: { ligada: boolean; dias: number; rank: IdDoRank | "" } = { ligada: lerLigada(), dias: lerDias(), rank: lerRank() };
const ouvintes = new Set<() => void>();

function mudar(novo: Partial<typeof estado>) {
  estado = { ...estado, ...novo };
  try {
    localStorage.setItem(CHAVE, estado.ligada ? "1" : "0");
    localStorage.setItem(CHAVE_DOS_DIAS, String(estado.dias));
    localStorage.setItem(CHAVE_DO_RANK, estado.rank);
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
  for (const ouvinte of ouvintes) ouvinte();
}

function subscrever(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  // Outro separador do navegador mudou o interruptor: segue-o.
  const deOutroSeparador = (evento: StorageEvent) => {
    if (evento.key !== CHAVE && evento.key !== CHAVE_DOS_DIAS && evento.key !== CHAVE_DO_RANK) return;
    estado = { ligada: lerLigada(), dias: lerDias(), rank: lerRank() };
    ouvinte();
  };
  window.addEventListener("storage", deOutroSeparador);
  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener("storage", deOutroSeparador);
  };
}

const ler = () => estado;

export function useApiOficial() {
  const atual = useSyncExternalStore(subscrever, ler, ler);
  const alternar = useCallback(() => mudar({ ligada: !estado.ligada }), []);
  const setDias = useCallback((dias: number) => mudar({ dias }), []);
  const setRank = useCallback((rank: IdDoRank | "") => mudar({ rank }), []);
  return { ligada: atual.ligada, dias: atual.dias, rank: atual.rank, alternar, setDias, setRank };
}
