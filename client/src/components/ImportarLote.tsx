import { VERSAO_DO_SITE } from "@shared/version";
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { reviewCaptureBatch, type BrawlScopeCapture } from "@shared/brawlScopeCapture";

export function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ImportarLote({ pendingUrls, refreshUrls }: { pendingUrls: string[]; refreshUrls: string[] }) {
  const [profiles, setProfiles] = useState<BrawlScopeCapture[]>([]);
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [rejected, setRejected] = useState<string[]>([]);
  const storageKey = useRef("");
  const stop = useRef(false);
  const busy = useRef(false);
  const importer = trpc.counterSync.importCapturesBatch.useMutation();
  const publisher = trpc.counterSync.publishCaptures.useMutation();
  const utils = trpc.useUtils();

  async function openFile(file?: File) {
    if (!file || busy.current) return;
    busy.current = true; setLoading(true); setStatus("Validando o arquivo…");
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("O lote excede 50 MB.");
      const text = await file.text();
      const parsed = reviewCaptureBatch(JSON.parse(text));
      setRejected(parsed.rejected);
      // O checkpoint pertence à sequência validada, que pode mudar após uma correção.
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parsed.profiles))))).map(v => v.toString(16).padStart(2, "0")).join("");
      storageKey.current = `brawl-capture-v54:${hash}`;
      let saved = 0;
      try { saved = Number(localStorage.getItem(storageKey.current) || 0); } catch { /* importing still works without local storage */ }
      setProfiles(parsed.profiles);
      setIndex(Number.isInteger(saved) && saved >= 0 && saved <= parsed.profiles.length ? saved : 0);
      setStatus(parsed.profiles.length ? `${parsed.profiles.length} fichas válidas. Clique em Importar lote para guardar.` : "Nenhuma ficha válida neste arquivo. Selecione os resultados exportados pela extensão.");
    } catch (error) {
      setProfiles([]); setIndex(0); setRejected([]); setStatus(error instanceof Error ? error.message : "Não consegui abrir o lote.");
    } finally {
      busy.current = false; setLoading(false);
    }
  }

  async function run() {
    if (busy.current) return;
    busy.current = true; stop.current = false; setRunning(true);
    let completed = index;
    let failureMessage = "";
    try {
      for (let i = index; i < profiles.length && !stop.current; i += 20) {
        const group = profiles.slice(i, i + 20);
        setStatus(`A guardar fichas ${i + 1}–${i + group.length} de ${profiles.length}…`);
        const result = await importer.mutateAsync(group);
        if (!result.ok || !result.persisted || result.confirmed !== group.length) throw new Error("Gravação não confirmada. O grupo fica pendente.");
        completed = i + group.length; setIndex(completed);
        try { localStorage.setItem(storageKey.current, String(completed)); } catch { /* file can be reimported idempotently */ }
      }
      setStatus(completed === profiles.length ? "Todas as fichas deste lote foram guardadas." : "Pausado. Podes retomar neste ponto.");
    } catch (error) {
      failureMessage = `Parado em ${profiles[completed]?.brawler ?? "ficha"}: ${error instanceof Error ? error.message : "erro"}`;
      setStatus(failureMessage);
    } finally {
      if (completed > index) {
        try {
          setStatus("A publicar as fichas guardadas nos perfis…");
          await publisher.mutateAsync();
          setStatus(failureMessage || (completed === profiles.length ? "Importação e publicação concluídas." : "Pausado. As fichas confirmadas foram publicadas."));
          await Promise.all([utils.counterSync.snapshot.invalidate(), utils.counterSync.colagemFeita.invalidate(), utils.counterSync.matchups.invalidate()]);
        } catch {
          setStatus(`${failureMessage ? failureMessage + " " : ""}A publicação das fichas guardadas ficou pendente; usa Publicar fichas.`);
        }
      }
      busy.current = false; setRunning(false);
    }
  }

  return <details className="paste-box">
    <summary>Importação em lote · {VERSAO_DO_SITE}</summary>
    <p className="paste-help">Use a fila pendente para completar o site. Use Atualizar todas para recolher de novo os valores atuais, inclusive fichas já importadas.</p>
    <p className="paste-help">v61: a extensão usa avanço de 250 ms, espera páginas lentas e tenta novamente leituras temporárias. A importação confirma até 20 fichas por gravação.</p>
    <p><a href="/brawlscope-helper.zip" download>Baixar extensão v61 rápida</a> · <a href="/brawlscope-helper/README.txt" target="_blank" rel="noreferrer">Como instalar e usar a extensão</a></p>
    <div className="paste-actions">
      <button type="button" disabled={running || !pendingUrls.length} onClick={() => downloadJson("brawlscope-fila-pendente.json", { format: "brawlhibrido-queue-v1", urls: pendingUrls })}>Exportar {pendingUrls.length} fichas pendentes</button>
      <button type="button" disabled={running || !refreshUrls.length} onClick={() => downloadJson("brawlscope-fila-atualizar-todas.json", { format: "brawlhibrido-queue-v1", urls: refreshUrls })}>Atualizar todas ({refreshUrls.length})</button>
    </div>
    <p className="paste-help">Antes de carregar outra fila na extensão, exporte os resultados em andamento. A nova coleta substitui uma ficha somente quando você importar o novo resultado confirmado.</p>
    <label style={{ display: "block", marginBlock: 12 }}>1. Escolha brawlscope-resultados.json
      <input style={{ display: "block", width: "100%", maxWidth: "100%", minWidth: 0 }} type="file" accept=".json,application/json" disabled={running || loading} onChange={e => void openFile(e.target.files?.[0])} />
    </label>
    <p aria-live="polite">{index} / {profiles.length} fichas confirmadas. {status}</p>
    {rejected.length > 0 && <details><summary>{rejected.length} fichas com erro, separadas da importação</summary><p>O arquivo original mantém todas as fichas. Só as válidas serão importadas.</p><ul>{rejected.map((error, i) => <li key={i}>{error}</li>)}</ul></details>}
    <div className="paste-actions">
      <button type="button" disabled={running || loading || index >= profiles.length} onClick={() => void run()}>{index ? "Retomar importação" : "Importar lote"}</button>
      <button type="button" disabled={!running} onClick={() => { stop.current = true; setStatus("A pausar após a gravação em curso…"); }}>Pausar</button>
      <button type="button" disabled={running || loading || publisher.isPending} onClick={() => void publisher.mutateAsync().then(async () => { await utils.counterSync.snapshot.invalidate(); setStatus("Publicação concluída."); }).catch(e => setStatus(String(e)))}>Publicar fichas</button>
    </div>
    <p className="paste-help">Mantém esta página aberta durante a importação. Se fechar, reabre o mesmo ficheiro para retomar. A extensão pode ser retomada separadamente. Não contorna 403 nem verificações.</p>
  </details>;
}
