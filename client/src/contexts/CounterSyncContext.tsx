import { vigiarStream } from "@/lib/vigiarStream";
import { setCounterSyncSnapshot } from "@shared/counterSyncEstado";
import { applyCounterSnapshotToClientState, type CounterSyncClientState } from "@shared/counterSyncClient";
import { parseCounterSnapshotEvent, type CounterSnapshotSseEvent } from "@shared/counterSyncSnapshot";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";

type CounterSyncContextState = CounterSyncClientState & {
  isLoading: boolean;
  connectionState: "connecting" | "live" | "offline";
};

const CounterSyncContext = createContext<CounterSyncContextState>({ hasLivePush: false, isLoading: true, connectionState: "connecting" });

/**
 * SSE e query aplicam a mesma snapshot ao catálogo e ao Draft. Respostas antigas
 * não substituem versões mais recentes; uma falha de rede conserva a última
 * snapshot recebida. Antes da primeira resposta não há fallback estático.
 */
export function CounterSyncProvider({ children }: { children: ReactNode }) {
  const snapshotQuery = trpc.counterSync.snapshot.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const [appliedState, setAppliedState] = useState<CounterSyncClientState>({ hasLivePush: false });
  const stateRef = useRef(appliedState);
  const [connectionState, setConnectionState] = useState<CounterSyncContextState["connectionState"]>("connecting");
  const applySnapshot = useCallback((event: CounterSnapshotSseEvent, source: "sse" | "query") => {
    const next = applyCounterSnapshotToClientState(stateRef.current, event, source);
    if (next === stateRef.current) return;
    // O resolvedor e a versão tornam-se visíveis juntos, antes do render dos consumidores.
    setCounterSyncSnapshot(next.snapshot, { allowOfflineFallback: false });
    stateRef.current = next;
    setAppliedState(next);
  }, []);

  useEffect(() => {
    const data = snapshotQuery.data;
    if (!data?.payload) return;
    applySnapshot({ version: data.version, capturedAt: new Date(data.capturedAt).toISOString(), payload: data.payload }, "query");
  }, [snapshotQuery.data, applySnapshot]);

  useEffect(() => {
    const source = new EventSource("/api/realtime/counters");
    const pararDeVigiar = vigiarStream(source, setConnectionState);
    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const next = parseCounterSnapshotEvent(event.data);
        applySnapshot(next, "sse");
        setConnectionState("live");
      } catch (error) {
        console.warn("[CounterSync] Snapshot SSE inválido", error);
      }
    };
    source.addEventListener("counter_snapshot", handleSnapshot);
    return () => {
      source.removeEventListener("counter_snapshot", handleSnapshot);
      pararDeVigiar();
      source.close();
      setConnectionState("offline");
    };
  }, [applySnapshot]);

  const value = useMemo<CounterSyncContextState>(() => ({
    ...appliedState,
    isLoading: snapshotQuery.isLoading,
    connectionState,
  }), [appliedState, connectionState, snapshotQuery.isLoading]);

  return <CounterSyncContext.Provider value={value}>{children}</CounterSyncContext.Provider>;
}

export function useCounterSync() {
  return useContext(CounterSyncContext);
}
