import { vigiarStream } from "@/lib/vigiarStream";
import { applyRankedSnapshotPush, type RankedSnapshotEvent, type RankedSnapshotPayload } from "@shared/rankedSyncSnapshot";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

type RankedSyncClientState = {
  snapshot?: RankedSnapshotPayload;
  event?: RankedSnapshotEvent;
  version?: string;
  /** Hora em que a sincronização correu — NÃO é a idade dos dados. */
  capturedAt?: string | null;
  /** Quando cada fonte foi mesmo lida. Ver `shared/idadeDosDados.ts`. */
  sourceReadAt?: RankedSnapshotEvent["sourceReadAt"];
  syncState: RankedSnapshotEvent["syncState"];
  nextRefreshAt?: string | null;
  source: "sse" | "query" | "bundled" | "none";
  isLoading: boolean;
  connectionState: "connecting" | "live" | "offline";
};

const RankedSyncContext = createContext<RankedSyncClientState>({
  syncState: "bundled",
  source: "none",
  isLoading: true,
  connectionState: "connecting",
});

export function RankedSyncProvider({ children }: { children: ReactNode }) {
  const snapshotQuery = trpc.rankedSync.snapshot.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: false,
  });
  const [event, setEvent] = useState<RankedSnapshotEvent>();
  const hasPushRef = useRef(false);
  const [connectionState, setConnectionState] = useState<RankedSyncClientState["connectionState"]>("connecting");

  useEffect(() => {
    if (!snapshotQuery.data || hasPushRef.current) return;
    const data = snapshotQuery.data;
    setEvent({
      version: data.version,
      capturedAt: data.capturedAt ? new Date(data.capturedAt).toISOString() : null,
      syncState: data.version === "bundled-static" ? "bundled" : "success",
      nextRefreshAt: data.nextRefreshAt ? new Date(data.nextRefreshAt).toISOString() : null,
      sourceStatus: data.sourceStatus,
      sourceNotes: data.sourceNotes,
      sourceReadAt: data.sourceReadAt,
      rowCount: data.rowCount,
      payload: data.payload,
    });
  }, [snapshotQuery.data]);

  useEffect(() => {
    const source = new EventSource("/api/realtime/ranked");
    const pararDeVigiar = vigiarStream(source, setConnectionState);
    const handleSnapshot = (message: MessageEvent<string>) => {
      try {
        const next = JSON.parse(message.data) as RankedSnapshotEvent;
        if (!next?.version || !next?.payload || !Array.isArray(next.payload.rows)) throw new Error("Payload Ranked SSE inválido");
        hasPushRef.current = true;
        setEvent((current) => applyRankedSnapshotPush(current, next));
        setConnectionState("live");
      } catch (error) {
        console.warn("[RankedSync] Snapshot SSE inválido", error);
      }
    };
    source.addEventListener("ranked_snapshot", handleSnapshot);
    return () => {
      source.removeEventListener("ranked_snapshot", handleSnapshot);
      pararDeVigiar();
      source.close();
      setConnectionState("offline");
    };
  }, []);

  const value = useMemo<RankedSyncClientState>(() => ({
    snapshot: event?.payload,
    event,
    version: event?.version,
    capturedAt: event?.capturedAt,
    sourceReadAt: event?.sourceReadAt ?? event?.payload?.sourceReadAt,
    syncState: event?.syncState ?? "bundled",
    nextRefreshAt: event?.nextRefreshAt,
    source: event ? (hasPushRef.current ? "sse" : event.version === "bundled-static" ? "bundled" : "query") : "none",
    isLoading: snapshotQuery.isLoading && !event,
    connectionState,
  }), [connectionState, event, snapshotQuery.isLoading]);

  return <RankedSyncContext.Provider value={value}>{children}</RankedSyncContext.Provider>;
}

export function useRankedSync() {
  return useContext(RankedSyncContext);
}
