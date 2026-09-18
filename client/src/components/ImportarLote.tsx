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
  const [mapasEstado, setMapasEstado] = useState("");
  const filaDeMapas = trpc.rankedSync.filaDeMapas.useQuery(undefined, { retry: false });
  const importarMapas = trpc.rankedSync.importarPaginas.useMutation();
  const publisher = trpc.counterSync.publishCaptures.useMutation();
  const utils = trpc.useUtils();

  /**
   * Um ficheiro entra pelo formato que traz dentro, não pelo campo onde caiu.
   *
   * São dois campos porque são duas recolhas diferentes, mas quem exporta da
   * extensão fica com os dois ficheiros na mesma pasta de transferências, com
   * nomes parecidos. Trocá-los devolvia o erro cru do validador — uma lista de
   * caminhos e tipos esperados, que diz o que está mal e não diz o que fazer a
   * seguir. O formato está escrito no ficheiro: ler esse campo e encaminhar o
   * conteúdo custa uma linha e apaga o engano.
   */
  async function receberFicheiro(file: File | undefined, campo: "fichas" | "mapas") {
    if (!file || busy.current) return;
    busy.current = true;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("O ficheiro excede 50 MB.");
      const dados = JSON.parse(await file.text()) as { format?: string };
      const saoMapas = dados.format === "brawlhibrido-ranked-paginas-v1";
      // Quem trocou os campos fica a saber para onde foi o ficheiro.
      if (saoMapas && campo === "fichas") setStatus("Este é o ficheiro dos mapas — foi para a secção do TopBrawl, aqui em cima.");
      if (!saoMapas && campo === "mapas") setMapasEstado("Este é o ficheiro das fichas — foi para a importação em lote, aqui em baixo.");
      if (saoMapas) await carregarMapas(dados as { maps?: unknown[] });
      else await carregarFichas(dados);
    } catch (error) {
      const dizer = campo === "mapas" ? setMapasEstado : setStatus;
      dizer(error instanceof Error ? error.message : "Não consegui ler o ficheiro.");
    } finally {
      busy.current = false;
    }
  }

  async function carregarFichas(dados: unknown) {
    setLoading(true); setStatus("Validando o arquivo…");
    try {
      const parsed = reviewCaptureBatch(dados);
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
      setLoading(false);
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

  async function republishLoaded() {
    if (busy.current || loading || !profiles.length) return;
    busy.current = true; stop.current = false; setRunning(true);
    try {
      // A fila pode existir apenas no estado local deste navegador. Reenvia-la
      // em grupos idempotentes garante que Publicar não dependa de memória de
      // uma instância anterior da Vercel.
      for (let i = 0; i < profiles.length && !stop.current; i += 20) {
        const group = profiles.slice(i, i + 20);
        setStatus(`A reenviar fichas ${i + 1}–${i + group.length} de ${profiles.length}…`);
        const result = await importer.mutateAsync(group);
        if (!result.ok || !result.persisted || result.confirmed !== group.length) throw new Error("Reenvio não confirmado. O grupo fica pendente.");
        setIndex(Math.max(index, i + group.length));
      }
      if (stop.current) {
        setStatus("Reenvio pausado. As fichas já enviadas continuam guardadas.");
        return;
      }
      setStatus("A publicar as fichas reenviadas…");
      await publisher.mutateAsync();
      await Promise.all([utils.counterSync.snapshot.invalidate(), utils.counterSync.colagemFeita.invalidate(), utils.counterSync.matchups.invalidate()]);
      setStatus("Publicação concluída.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não consegui publicar as fichas.");
    } finally {
      busy.current = false; setRunning(false);
    }
  }

  /**
   * Os mapas do TopBrawl, lidos pela extensão.
   *
   * O `topbrawl.com` responde 403 a pedidos vindos do alojamento — e das outras
   * redes de nuvem que foram testadas com os mesmos cabeçalhos de um navegador.
   * O mesmo pedido funcionava na plataforma onde o site esteve antes, por isso
   * o que fica de fora é a origem da rede.
   *
   * As páginas vão em grupos pequenos porque cada uma traz o texto por
   * interpretar, que é grande. Quem interpreta é o servidor: dois
   * interpretadores acabariam por divergir em silêncio quando a fonte mudasse o
   * formato, e os números continuariam a aparecer, só que errados.
   */
  async function carregarMapas(lido: { maps?: unknown[]; rotation?: { capturedAt: string; html: string }; extensao?: string }) {
    setRunning(true); setMapasEstado("A ler o ficheiro…");
    let aviso: string | null = null;
    try {
      const paginas = Array.isArray(lido.maps) ? lido.maps as { map: string }[] : [];
      if (!paginas.length && !lido.rotation) {
        throw new Error("O ficheiro dos mapas está vazio. Corre a fila na extensão antes de exportar.");
      }

      /**
       * A rotação vai primeiro e sozinha, porque é ela que decide a fila
       * seguinte — e vale mesmo quando não vier mapa nenhum. Foi a sua falta
       * que deixou o site a pedir mapas que já tinham saído da rotação.
       */
      let rotacaoDita = "";
      if (lido.rotation) {
        setMapasEstado("A atualizar a rotação…");
        const resultado = await importarMapas.mutateAsync({ format: "brawlhibrido-ranked-paginas-v1", maps: [], rotation: lido.rotation, extensao: lido.extensao });
        aviso = resultado.avisoDeExtensao ?? aviso;
        rotacaoDita = resultado.rotacao
          ? `Rotação atualizada: ${resultado.rotacao.mapas} mapas. `
          : "A leitura da rotação não foi plausível e a anterior manteve-se. ";
      }

      let guardados = 0;
      const recusados: string[] = [];
      for (let i = 0; i < paginas.length; i += 5) {
        const grupo = paginas.slice(i, i + 5);
        setMapasEstado(`A guardar mapas ${i + 1}–${i + grupo.length} de ${paginas.length}…`);
        const resultado = await importarMapas.mutateAsync({ format: "brawlhibrido-ranked-paginas-v1", maps: grupo as never, extensao: lido.extensao });
        aviso = resultado.avisoDeExtensao ?? aviso;
        guardados += resultado.mapas;
        recusados.push(...resultado.recusados);
      }
      /**
       * O aviso de versão vem PRIMEIRO, e antes do "correu bem".
       *
       * Uma extensão desatualizada guarda os dados na mesma, por isso a
       * mensagem de sucesso é verdadeira — e foi exatamente isso que deixou
       * passar três corridas seguidas feitas com a versão antiga. O aviso à
       * frente é o que impede o sucesso de tapar o problema.
       */
      setMapasEstado(`${aviso ? `⚠️ ${aviso} ` : ""}${rotacaoDita}${guardados} mapas guardados${recusados.length ? ` · ${recusados.length} recusados: ${recusados.slice(0, 2).join("; ")}` : ""}. Agora carrega em "Atualizar agora", na barra do topo da página, ao lado do perfil.`);
      await Promise.all([utils.rankedSync.snapshot.invalidate(), utils.rankedSync.filaDeMapas.invalidate()]);
    } catch (error) {
      setMapasEstado(error instanceof Error ? error.message : "Não consegui importar os mapas.");
    } finally {
      setRunning(false);
    }
  }

  return <details className="paste-box">
    <summary>Importação em lote · {VERSAO_DO_SITE}</summary>
    <p className="paste-help">Use a fila pendente para completar o site. Use Atualizar todas para recolher de novo os valores atuais, inclusive fichas já importadas.</p>
    <p className="paste-help">v62: a extensão lê também os mapas do TopBrawl. Mantém o avanço de 250 ms, espera páginas lentas e repete leituras temporárias. A importação confirma até 20 fichas por gravação.</p>
    <p><a href="/brawlscope-helper.zip" download>Baixar extensão v62</a> · <a href="/brawlscope-helper/README.txt" target="_blank" rel="noreferrer">Como instalar e usar a extensão</a></p>
    <div className="paste-actions">
      {/*
        Uma passagem, as duas fontes.
        As duas levam 403 a partir do alojamento, e por isso ambas dependem
        desta recolha. Fazê-las em corridas separadas obrigava a montar a
        extensão duas vezes para o mesmo fim, e a segunda era fácil de adiar —
        com o BrawlScope a envelhecer em silêncio, que é o pior dos casos,
        porque um número velho parece um número bom.
        A extensão já aceita as duas origens na mesma fila; só faltava juntá-las.
      */}
      <button
        type="button"
        disabled={running || (!refreshUrls.length && !filaDeMapas.data?.urls.length)}
        title="Uma só corrida da extensão que atualiza as fichas do BrawlScope e os mapas do TopBrawl."
        onClick={() => downloadJson("brawl-hibrido-fila-completa.json", {
          format: "brawlhibrido-queue-v1",
          urls: [...refreshUrls, ...(filaDeMapas.data?.urls ?? [])],
        })}
      >
        Fila completa · {refreshUrls.length} fichas + {filaDeMapas.data?.rotacao.mapas ?? 0} mapas + rotação
      </button>
      <button type="button" disabled={running || !pendingUrls.length} onClick={() => downloadJson("brawlscope-fila-pendente.json", { format: "brawlhibrido-queue-v1", urls: pendingUrls })}>Exportar {pendingUrls.length} fichas pendentes</button>
      <button type="button" disabled={running || !refreshUrls.length} onClick={() => downloadJson("brawlscope-fila-atualizar-todas.json", { format: "brawlhibrido-queue-v1", urls: refreshUrls })}>Atualizar todas ({refreshUrls.length})</button>
    </div>
    <p className="paste-help">
      <strong>A fila completa é a que mantém o site fresco.</strong> O BrawlScope e o TopBrawl respondem
      403 a pedidos vindos do alojamento, por isso nenhum dos dois se atualiza sozinho. Uma corrida traz
      os dois, e no fim a extensão exporta dois ficheiros — as fichas e os mapas — que se importam aqui
      em baixo, cada um no seu campo.
    </p>
    <p className="paste-help">Antes de carregar outra fila na extensão, exporte os resultados em andamento. A nova coleta substitui uma ficha somente quando você importar o novo resultado confirmado.</p>
    <hr style={{ marginBlock: 16, border: 0, borderTop: "1px solid var(--bh-surface-3)" }} />
    <p className="paste-help"><strong>Mapas do TopBrawl.</strong> A fonte recusa pedidos vindos do site — foram testadas duas redes diferentes e as duas levaram 403 —, mas as páginas abrem no teu navegador. São {filaDeMapas.data?.rotacao.mapas ?? 26} mapas mais o índice da rotação, cerca de um minuto a correr sozinha.</p>
    {/*
      De onde veio esta lista de mapas — porque a resposta muda o que se deve
      fazer a seguir.

      Enquanto a rotação vier "do projeto", a fila é a lista escrita à mão e
      pode estar atrasada em relação à rotação a sério: foi o que aconteceu
      quando entraram mapas novos e o site continuou a pedir os antigos. Basta
      correr a fila uma vez — ela traz o índice — para passar a vir da leitura.
    */}
    <p className="paste-help">
      {filaDeMapas.data?.rotacao.origem === "extensao"
        ? `Rotação lida no teu navegador${filaDeMapas.data.rotacao.lidaEm ? ` em ${new Date(filaDeMapas.data.rotacao.lidaEm).toLocaleString("pt-PT")}` : ""}. Entram e saem mapas sozinhos a cada passagem.`
        : "Rotação ainda vinda da lista do projeto — pode estar atrasada. A primeira passagem desta fila lê o índice e passa a rotação a ser a de agora."}
    </p>
    <div className="paste-actions">
      <button type="button" disabled={running || !filaDeMapas.data} onClick={() => filaDeMapas.data && downloadJson("topbrawl-fila-mapas.json", { format: filaDeMapas.data.format, urls: filaDeMapas.data.urls })}>Exportar fila de {filaDeMapas.data?.rotacao.mapas ?? 0} mapas + rotação</button>
    </div>
    <label style={{ display: "block", marginBlock: 12 }}>Importar topbrawl-mapas.json (os mapas)
      <input style={{ display: "block", width: "100%", maxWidth: "100%", minWidth: 0 }} type="file" accept=".json,application/json" disabled={running} onChange={e => void receberFicheiro(e.target.files?.[0], "mapas")} />
    </label>
    {mapasEstado && <p aria-live="polite" className="paste-help">{mapasEstado}</p>}
    <hr style={{ marginBlock: 16, border: 0, borderTop: "1px solid var(--bh-surface-3)" }} />
    <label style={{ display: "block", marginBlock: 12 }}>1. Escolha brawlscope-resultados.json (as fichas)
      <input style={{ display: "block", width: "100%", maxWidth: "100%", minWidth: 0 }} type="file" accept=".json,application/json" disabled={running || loading} onChange={e => void receberFicheiro(e.target.files?.[0], "fichas")} />
    </label>
    <p aria-live="polite">{index} / {profiles.length} fichas confirmadas. {status}</p>
    {rejected.length > 0 && <details><summary>{rejected.length} fichas com erro, separadas da importação</summary><p>O arquivo original mantém todas as fichas. Só as válidas serão importadas.</p><ul>{rejected.map((error, i) => <li key={i}>{error}</li>)}</ul></details>}
    <div className="paste-actions">
      <button type="button" disabled={running || loading || index >= profiles.length} onClick={() => void run()}>{index ? "Retomar importação" : "Importar lote"}</button>
      <button type="button" disabled={!running} onClick={() => { stop.current = true; setStatus("A pausar após a gravação em curso…"); }}>Pausar</button>
      <button type="button" disabled={running || loading || publisher.isPending || !profiles.length} onClick={() => void republishLoaded()}>Reenviar e publicar fichas</button>
    </div>
    <p className="paste-help">Mantém esta página aberta durante a importação. Se fechar, reabre o mesmo ficheiro para retomar. A extensão pode ser retomada separadamente. Não contorna 403 nem verificações.</p>
  </details>;
}
