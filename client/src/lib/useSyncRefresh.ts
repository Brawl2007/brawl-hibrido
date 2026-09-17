import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * O botão "Atualizar agora", em condições de não poder ficar preso.
 *
 * O QUE CORREU MAL ANTES
 *
 * A mutação chamava a sincronização e esperava por ela dentro do pedido HTTP.
 * Enquanto a recolha do BrawlScope falhava depressa, ninguém reparou. Assim que
 * ela voltou a funcionar — 7 vistas × ~106 fichas, espaçadas para não abusar da
 * fonte — o mesmo pedido passou a demorar minutos. Nenhum gateway aguenta isso:
 * a ligação morre, a mutação nunca resolve, e o botão gira para sempre.
 *
 * A forma correta não é esperar mais. É não esperar: o servidor arranca o
 * trabalho e responde já, e a interface pergunta pelo estado. Este hook tem as
 * três garantias que faltavam:
 *
 *  1. A mutação resolve em milissegundos — nunca fica pendurada num gateway.
 *  2. Há um teto local: passado `HARD_CAP_MS`, o botão volta ao normal mesmo que
 *     o servidor nunca confirme nada. Girar sem fim deixou de ser possível.
 *  3. O rótulo mostra o passo real ("BrawlScope · vista 3/7"), porque "A
 *     atualizar…" durante minutos parece exatamente uma avaria.
 */

export type ProcessHealth = { uptimeSeconds: number | null; heapUsedMb: number | null; rssMb: number | null };

type SyncJobState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  progress: string | null;
  outcome: "success" | "error" | "timeout" | null;
  error: string | null;
};

/**
 * Tempo máximo que a INTERFACE espera por confirmação — não o tempo da
 * sincronização, que continua em segundo plano depois disto.
 */
export const REFRESH_HARD_CAP_MS = 10 * 60 * 1000;

const ETIQUETA: Record<string, string> = { ranked: "Ranked", counters: "Counters" };

export function useSyncRefresh() {
  const trpcUtils = trpc.useUtils();
  const [requestedAt, setRequestedAt] = useState<number | null>(null);

  const rankedRefresh = trpc.rankedSync.refresh.useMutation({
    onError: (error) => toast.error(error.message || "Não foi possível iniciar a sincronização."),
  });
  const counterRefresh = trpc.counterSync.refresh.useMutation({
    onError: (error) => toast.error(error.message || "Não foi possível actualizar counters e counterados."),
  });

  const jobsQuery = trpc.syncJobs.state.useQuery(undefined, {
    refetchInterval: requestedAt ? 4_000 : 30_000,
    staleTime: 0,
  });
  const bruto = jobsQuery.data as (Record<string, SyncJobState> & { __process?: ProcessHealth }) | undefined;
  // `__process` é saúde do processo, não um trabalho: fica de fora das contagens.
  const { __process: processHealth, ...jobsSemMeta } = bruto ?? {};
  const jobs = bruto ? (jobsSemMeta as Record<string, SyncJobState>) : undefined;
  const running = Object.values(jobs ?? {}).some((estado) => estado.running);
  const progress = Object.values(jobs ?? {}).find((estado) => estado.running && estado.progress)?.progress ?? null;
  const expired = requestedAt !== null && Date.now() - requestedAt > REFRESH_HARD_CAP_MS;

  const anterioresRef = useRef<Record<string, SyncJobState> | undefined>(undefined);
  useEffect(() => {
    if (!jobs) return;
    const antes = anterioresRef.current;
    anterioresRef.current = jobs;
    if (!antes || requestedAt === null) return;

    for (const [nome, estado] of Object.entries(jobs)) {
      // Interessa só a transição a-correr → terminado.
      if (!antes[nome]?.running || estado.running) continue;
      const etiqueta = ETIQUETA[nome] ?? nome;
      if (estado.outcome === "success") toast.success(`${etiqueta}: sincronização concluída.`);
      else if (estado.outcome === "timeout") toast.warning(`${etiqueta}: demorou demasiado e deixei de esperar.`, { description: estado.error ?? undefined });
      else if (estado.outcome === "error") toast.error(`${etiqueta}: ${estado.error ?? "não foi concluída."}`);
    }

    if (!Object.values(jobs).some((estado) => estado.running)) {
      setRequestedAt(null);
      void Promise.all([
        trpcUtils.rankedSync.snapshot.invalidate(),
        trpcUtils.rankedSync.status.invalidate(),
        trpcUtils.counterSync.snapshot.invalidate(),
        trpcUtils.counterSync.status.invalidate(),
      ]);
    }
  }, [jobs, requestedAt, trpcUtils]);

  useEffect(() => {
    if (!expired) return;
    setRequestedAt(null);
    toast.warning("A atualização não confirmou o fim a tempo.", {
      description: "Pode continuar em segundo plano; o painel \"Estado das fontes\" mostra o resultado.",
    });
  }, [expired]);

  const isRefreshing = rankedRefresh.isPending
    || counterRefresh.isPending
    || (requestedAt !== null && !expired && running);

  /**
   * O que o botão promete tem de ser o que acontece.
   *
   * Antes dizia sempre "Atualização iniciada · corre em segundo plano". Num
   * alojamento sem processo isso era falso com frequência: a resposta congelava
   * a instância e o trabalho não avançava. Quem carregava ficava à espera de
   * uma coisa que não estava a acontecer.
   *
   * Agora o servidor trabalha enquanto o pedido está aberto e diz se acabou. A
   * rotação Ranked cabe e acaba. Os counters são mais de duzentas fichas
   * espaçadas — não cabem — e nesse caso diz-se isso, em vez de anunciar uma
   * conclusão que não houve.
   */
  const start = () => {
    if (isRefreshing) return;
    setRequestedAt(Date.now());
    toast.info("A atualizar…", { description: "Podes continuar a usar o site." });

    /**
     * "Terminou" não é o mesmo que "correu bem".
     *
     * Uma recolha que rebenta — a fonte recusou, o índice veio incompleto —
     * também termina, e a falha fica no estado do trabalho, não nos registos.
     * Anunciar "atualizado" nesse caso é o mesmo erro que este hook existe para
     * corrigir: dizer que aconteceu uma coisa que não aconteceu. Pior ainda,
     * esconde a razão de quem precisa dela para perceber porque é que os
     * números não mudaram.
     */
    const contar = (etiqueta: string, resultado?: { concluido?: boolean; state?: SyncJobState }) => {
      if (!resultado?.concluido) return false;
      const estado = resultado.state;
      if (estado?.outcome === "success") { toast.success(`${etiqueta}: atualizado.`); return true; }
      if (estado?.outcome === "timeout") toast.warning(`${etiqueta}: demorou demasiado.`, { description: estado.error ?? undefined });
      else toast.error(`${etiqueta}: não foi concluída.`, { description: estado?.error ?? undefined });
      return true;
    };

    void rankedRefresh.mutateAsync()
      .then((resultado) => { contar("Ranked", resultado); })
      .catch(() => undefined);

    void counterRefresh.mutateAsync()
      .then((resultado) => {
        if (contar("Counters", resultado)) return;
        toast.info("Counters: recolha a meio.", {
          description: "São centenas de fichas e não cabem num pedido. O que foi lido ficou guardado; carrega outra vez para continuar.",
        });
      })
      .catch(() => undefined);
  };

  return { isRefreshing, progress, start, jobs, processHealth };
}
