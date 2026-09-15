import type { CounterSnapshotSseEvent, CounterSyncSnapshotPayload } from "./counterSyncSnapshot";

export type CounterSyncClientState = {
  snapshot?: CounterSyncSnapshotPayload;
  version?: string;
  capturedAt?: Date;
  hasLivePush: boolean;
};

export function applyCounterSnapshotToClientState(
  state: CounterSyncClientState,
  event: CounterSnapshotSseEvent,
  source: "sse" | "query" = "sse",
): CounterSyncClientState {
  if (state.version === event.version ||
    (state.capturedAt && new Date(event.capturedAt).getTime() < state.capturedAt.getTime())) return state;
  return {
    snapshot: event.payload,
    version: event.version,
    capturedAt: new Date(event.capturedAt),
    hasLivePush: source === "sse" || state.hasLivePush,
  };
}
