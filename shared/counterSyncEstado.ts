import { avancarVersaoDoMotor } from "./versaoDoMotor";
import type { CounterSyncSnapshotPayload } from "./counterSyncSnapshot";

/**
 * A snapshot dos counters que está em vigor, sozinha num módulo leve.
 *
 * Vivia em `counterSourceRelations.ts`, que importa os catálogos estáticos das
 * fontes (Brawl Planet, BrawlScope…: centenas de KB). O `CounterSyncProvider`
 * envolve o site inteiro e só precisa de pôr a snapshot em vigor, mas por
 * importar dali arrastava esses catálogos para o ficheiro inicial — que o
 * telemóvel descarregava e lia antes de mostrar a primeira página, mesmo a
 * página de Início, que não os usa.
 *
 * Quem calcula (o Draft, a ficha) regista aqui a limpeza das suas caches.
 */
let ativa: CounterSyncSnapshotPayload | undefined;
let fallbackOffline = false;
const aoMudar = new Set<() => void>();

export function setCounterSyncSnapshot(snapshot: CounterSyncSnapshotPayload | undefined, options?: { allowOfflineFallback?: boolean }) {
  ativa = snapshot;
  if (typeof options?.allowOfflineFallback === "boolean") fallbackOffline = options.allowOfflineFallback;
  for (const limpar of aoMudar) limpar();
  avancarVersaoDoMotor();
}

export function getActiveCounterSyncSnapshot() {
  return ativa;
}

export function fallbackOfflineAtivo() {
  return fallbackOffline;
}

/** Chamado a cada nova snapshot, antes de avançar a versão do motor. */
export function aoMudarDeSnapshot(limpar: () => void) {
  aoMudar.add(limpar);
}
