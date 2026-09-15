import type { Response } from "express";
import type { CounterSyncSnapshotPayload } from "../shared/counterSyncSnapshot";
import type { RankedSnapshotEvent } from "../shared/rankedSyncSnapshot";

type CounterSnapshotEvent = {
  version: string;
  capturedAt: string;
  payload: CounterSyncSnapshotPayload;
};

const counterClients = new Set<Response>();
const rankedClients = new Set<Response>();

export function addCounterClient(response: Response) {
  counterClients.add(response);
  return () => counterClients.delete(response);
}

export function broadcastCounterSnapshot(event: CounterSnapshotEvent) {
  const message = `event: counter_snapshot\ndata: ${JSON.stringify(event)}\n\n`;
  counterClients.forEach(response => {
    try {
      // Do not keep growing the response buffer for a stalled tab.
      if (response.destroyed || response.writableLength > 2 * 1024 * 1024) {
        counterClients.delete(response);
        response.destroy();
        return;
      }
      response.write(message);
    } catch {
      counterClients.delete(response);
    }
  });
}

export function addRankedClient(response: Response) {
  rankedClients.add(response);
  return () => rankedClients.delete(response);
}

export function broadcastRankedSnapshot(event: RankedSnapshotEvent) {
  const message = `event: ranked_snapshot\ndata: ${JSON.stringify(event)}\n\n`;
  rankedClients.forEach(response => {
    try {
      // Do not keep growing the response buffer for a stalled tab.
      if (response.destroyed || response.writableLength > 2 * 1024 * 1024) {
        rankedClients.delete(response);
        response.destroy();
        return;
      }
      response.write(message);
    } catch {
      rankedClients.delete(response);
    }
  });
}

export function getCounterClientCount() {
  return counterClients.size;
}

export function getRankedClientCount() {
  return rankedClients.size;
}
