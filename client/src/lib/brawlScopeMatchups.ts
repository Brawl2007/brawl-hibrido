import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { setBrawlScopeLiveMatchups } from "@shared/counterMatchupValue";

/**
 * Carrega as matrizes completas de matchups que a sincronização recolheu e
 * entrega-as ao motor. A vista geral é sempre carregada, porque é o recurso de
 * qualquer par que o modo não publique; a vista do modo ativo junta-se a ela
 * quando a leitura "Por modo" está escolhida.
 *
 * As matrizes ficam fora do evento SSE por serem grandes, por isso vêm por
 * consulta e são revalidadas quando a snapshot muda de versão.
 */
export function useBrawlScopeLiveMatchups(views: string[], snapshotVersion?: string | null) {
  const pedidos = useMemo(() => Array.from(new Set(["overall", ...views.filter(Boolean)])), [views]);

  const overall = trpc.counterSync.matchups.useQuery({ view: "overall" }, { staleTime: 5 * 60_000 });
  const scoped = trpc.counterSync.matchups.useQuery(
    { view: pedidos[1] ?? "overall" },
    { enabled: pedidos.length > 1, staleTime: 5 * 60_000 },
  );

  /**
   * As matrizes vivem num módulo, fora do React — e é isso que obriga a este
   * contador.
   *
   * A ordem de um desenho é: React desenha, e só depois corre os efeitos. Quem
   * lê `getMatchupValue` durante o desenho em que a matriz chega ainda lê a
   * matriz ANTIGA, porque o efeito que a guarda corre a seguir. Sem nada que
   * peça outro desenho, os números colados só apareciam à próxima vez que algo
   * mexesse na página — e a pessoa que acabou de colar via tudo na mesma.
   */
  const [aplicadas, setAplicadas] = useState(0);

  useEffect(() => {
    if (!overall.data) return;
    setBrawlScopeLiveMatchups(overall.data.view, overall.data.matrix);
    setAplicadas((anterior) => anterior + 1);
  }, [overall.data, snapshotVersion]);

  useEffect(() => {
    if (!scoped.data) return;
    setBrawlScopeLiveMatchups(scoped.data.view, scoped.data.matrix);
    setAplicadas((anterior) => anterior + 1);
  }, [scoped.data, snapshotVersion]);

  const carregadas = [overall.data, scoped.data].filter((data) => data?.matrix);
  return {
    /** Muda sempre que chega uma matriz nova, para as memoizações recalcularem. */
    version: `${aplicadas}|${carregadas.map((data) => `${data?.view}:${Object.keys(data?.matrix ?? {}).length}`).join("|")}`,
    capturedAt: overall.data?.capturedAt ?? null,
    coverage: overall.data?.views ?? {},
    isLoading: overall.isLoading || scoped.isLoading,
  };
}
