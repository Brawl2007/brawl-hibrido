/**
 * Linha de montagem para colar as fichas do BrawlScope.
 *
 * POR QUE ISTO EXISTE
 *
 * O BrawlScope responde 403 a qualquer servidor, e isso não vai ser contornado.
 * A consequência é que a única forma de trazer estes números é uma pessoa abrir
 * a página e copiá-la — 106 brawlers vezes sete vistas, se fosse tudo.
 *
 * Não dá para tirar a pessoa do meio. Dá para fazer com que cada passagem custe
 * três teclas em vez de uma dúzia de cliques, e para o site saber por onde vai:
 *
 *  - diz qual é a PRÓXIMA ficha e abre-a num clique;
 *  - guarda assim que se cola, sem botão nenhum pelo meio;
 *  - avança sozinho e volta a pôr o cursor na caixa, pronto para a seguinte;
 *  - marca o que já está feito, para ninguém repetir nem saltar.
 *
 * A ordem não é alfabética: é pela pontuação na rotação ativa. Quem decide
 * drafts primeiro entra primeiro, e parar a meio deixa sempre o melhor feito.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRankedSync } from "@/contexts/RankedSyncContext";
import { brawlScopeModes } from "@shared/brawlScopeModes";
import { brawlScopeSlugFromName } from "@shared/brawlScopeSlugs";
import ImportarLote from "./ImportarLote";

const VISTAS = [{ id: "overall", label: "Geral" }, ...brawlScopeModes.map((modo) => ({ id: modo.id as string, label: modo.label }))];

const normalizar = (nome: string) => nome.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");

function enderecoDaFicha(brawler: string, vista: string) {
  const slug = brawlScopeSlugFromName(brawler);
  return `https://brawlscope.com/counters/${slug}${vista === "overall" ? "" : `?mode=${vista}`}`;
}

export default function FilaDeColagem() {
  const rankedSync = useRankedSync();
  const utils = trpc.useUtils();
  const [vista, setVista] = useState("overall");
  /**
   * Percorrer tudo, ou só uma vista.
   *
   * "Todas" é o que serve quem quer o site completo: para cada brawler faz as
   * sete vistas seguidas, e só depois passa ao brawler seguinte. É mais rápido
   * do que parece — fica-se na mesma ficha a trocar o modo no endereço, em vez
   * de andar para trás e para a frente entre brawlers.
   */
  const [percurso, setPercurso] = useState<"tudo" | "vista">("tudo");
  const [texto, setTexto] = useState("");
  const [ultima, setUltima] = useState<string | null>(null);
  /**
   * O erro fica no painel, não só num aviso que passa.
   *
   * Os erros iam para um toast — que desaparece, e que se perde se a pessoa
   * estiver a olhar para outro lado. Quem ficava encalhado numa ficha não tinha
   * nada no ecrã a dizer-lhe porquê.
   */
  const [erro, setErro] = useState<string | null>(null);
  /** Fichas que a pessoa decidiu saltar: nunca pode ficar sem saída. */
  const [saltados, setSaltados] = useState<string[]>([]);
  const caixaRef = useRef<HTMLTextAreaElement | null>(null);
  /** O texto que já foi enviado. Ver a nota no efeito que guarda a ficha. */
  const jaEnviado = useRef("");

  const progresso = trpc.counterSync.colagemFeita.useQuery(undefined, { staleTime: 10_000 });

  /**
   * O roster por ordem de importância: melhor pontuação primeiro.
   *
   * Alfabético seria arbitrário — quem parasse a meio ficaria com metade do
   * alfabeto e nenhuma garantia de ter os brawlers que joga.
   */
  const roster = useMemo(() => {
    const melhorPontuacao = new Map<string, number>();
    for (const linha of rankedSync.snapshot?.rows ?? []) {
      if (!linha?.brawler) continue;
      /**
       * Uma pontuação que não seja número não pode valer como número.
       *
       * A comparação era `linha.score > atual`, e com `score` indefinido isso é
       * sempre falso — o brawler nunca entrava por esta via e acabava a valer o
       * -1 do catálogo oficial. Com todos a -1, o desempate alfabético decidia
       * tudo, e a fila que eu disse ser "por importância" saía por ordem de
       * abecedário: 8-Bit, Alli, Amber, Angelo…
       */
      const pontos = Number.isFinite(linha.score) ? Number(linha.score) : -1;
      const atual = melhorPontuacao.get(linha.brawler) ?? -Infinity;
      if (pontos > atual) melhorPontuacao.set(linha.brawler, pontos);
    }
    for (const brawler of rankedSync.snapshot?.officialBrawlers ?? []) {
      if (!melhorPontuacao.has(brawler.name)) melhorPontuacao.set(brawler.name, -1);
    }
    return Array.from(melhorPontuacao.entries())
      .sort(([nomeA, pontosA], [nomeB, pontosB]) => pontosB - pontosA || nomeA.localeCompare(nomeB))
      .map(([nome]) => nome);
  }, [rankedSync.snapshot?.rows, rankedSync.snapshot?.officialBrawlers]);

  /**
   * A lista do que já foi colado, com a forma confirmada antes de ser usada.
   *
   * Isto rebentou a página inteira uma vez: o servidor mandava, sem querer, um
   * objeto onde devia estar uma lista, e o `.map` aqui levou o Draft todo
   * atrás. Um painel que não consegue ler o que recebe deve ficar vazio e
   * deixar o resto do site funcionar — nunca derrubá-lo.
   */
  const nomesFeitos = (vistaId: string): string[] => {
    const valor = progresso.data?.feitas?.[vistaId];
    return Array.isArray(valor) ? valor : [];
  };

  const postosDeLado = useMemo(() => new Set(saltados.map(normalizar)), [saltados]);

  /**
   * O que falta, como uma lista de tarefas.
   *
   * Cada tarefa é um par: que brawler e que vista. No percurso "tudo" as sete
   * vistas de um brawler vêm seguidas antes de se passar ao seguinte; no
   * percurso "vista" só entra a vista escolhida. A fila deixou de ser uma lista
   * de nomes para ser uma lista de páginas a visitar, que é o que ela sempre
   * foi na prática.
   */
  const tarefas = useMemo(() => {
    const feitasPorVista = new Map(
      VISTAS.map(({ id }) => [id, new Set(nomesFeitos(id).map(normalizar))] as const),
    );
    const vistasDoPercurso = percurso === "tudo" ? VISTAS.map((v) => v.id) : [vista];

    const lista: Array<{ brawler: string; vista: string }> = [];
    for (const brawler of roster) {
      const chave = normalizar(brawler);
      if (postosDeLado.has(chave)) continue;
      for (const vistaId of vistasDoPercurso) {
        if (!feitasPorVista.get(vistaId)?.has(chave)) lista.push({ brawler, vista: vistaId });
      }
    }
    return lista;
  }, [roster, percurso, vista, progresso.data?.feitas, postosDeLado]);

  const proximaTarefa = tarefas[0];
  const proxima = proximaTarefa?.brawler;
  /** A vista que vale para a próxima colagem: a da tarefa, não a do seletor. */
  const vistaAtiva = proximaTarefa?.vista ?? vista;

  const totalDeTarefas = roster.length * (percurso === "tudo" ? VISTAS.length : 1);
  const emFalta = tarefas;
  /** Recolha nova: inclui fichas já importadas, sem apagá-las antes da confirmação. */
  const tarefasParaAtualizar = useMemo(() => {
    const vistasDoPercurso = percurso === "tudo" ? VISTAS.map((v) => v.id) : [vista];
    return roster.flatMap((brawler) => vistasDoPercurso.map((vistaId) => ({ brawler, vista: vistaId })));
  }, [roster, percurso, vista]);

  const importar = trpc.counterSync.importPage.useMutation({
    onSuccess: async (resultado) => {
      if (!resultado.ok) {
        setErro(resultado.error ?? "Não consegui ler essa página.");
        toast.error("Não consegui ler essa página.", { description: resultado.error });
        return;
      }
      setErro(null);
      /**
       * O relatório diz sempre a conta completa.
       *
       * "103 confrontos" sozinho não distingue duas coisas muito diferentes: a
       * página só ter 103 — o que é normal, o número muda de brawler para
       * brawler — ou duas linhas terem-se colapsado numa por lerem o mesmo
       * nome. A segunda é um defeito, e tem de aparecer.
       */
      const repetidos = resultado.duplicated ?? [];
      const novos = resultado.unknownNames ?? [];
      setUltima([
        `${resultado.brawler} · ${resultado.pairs} confrontos`,
        repetidos.length ? `${repetidos.length} linha(s) repetida(s): ${repetidos.slice(0, 4).join(", ")}` : "",
        novos.length ? `nomes novos aceites: ${novos.join(", ")}` : "",
      ].filter(Boolean).join(" · "));
      setTexto("");
      // Guardada: a marca pode ser levantada, e a mesma ficha pode voltar a ser
      // colada noutra vista se for essa a intenção.
      jaEnviado.current = "";
      await Promise.all([progresso.refetch(), utils.counterSync.matchups.invalidate()]);
      // O cursor volta à caixa: a passagem seguinte é abrir a ficha e Ctrl+V.
      caixaRef.current?.focus();
    },
    onError: (falha) => {
      setErro(falha.message || "Não foi possível guardar a ficha.");
      toast.error(falha.message || "Não foi possível guardar a ficha.");
    },
  });

  /**
   * Guardar assim que se cola.
   *
   * O botão "Guardar ficha" era mais um clique em cada uma de centenas de
   * passagens. Como a ficha traz sempre o nome do brawler lá dentro, não há nada
   * a perguntar: o texto chega, lê-se e guarda-se.
   *
   * O QUE CORRIA MAL SEM ESTA MARCA
   *
   * A condição era só "há texto e não está a correr". Quando uma leitura
   * falhava, o texto ficava na caixa e `isPending` voltava a falso — o que
   * reunia as duas condições outra vez, e mandava a mesma ficha de novo. E
   * outra vez. Um ciclo sem fim, a bater no servidor tantas vezes por segundo
   * quantas o navegador aguentasse, com a página a bloquear à vista de toda a
   * gente. Uma ficha que falhasse chegava para pendurar o painel inteiro.
   *
   * A marca guarda o texto que já foi enviado. O mesmo texto nunca vai duas
   * vezes: se falhou, falhou, e fica à espera de uma colagem diferente.
   */
  useEffect(() => {
    const pronto = texto.trim();
    if (pronto.length < 400 || importar.isPending) return;
    if (pronto === jaEnviado.current) return;
    jaEnviado.current = pronto;
    importar.mutate({ html: texto, view: vistaAtiva });
  }, [texto, vistaAtiva, importar.isPending]);

  /**
   * Uma caixa que não responde é pior do que uma que recusa.
   *
   * A caixa só reage a partir de 400 caracteres. Quem lá colasse o ENDEREÇO da
   * ficha — que é o gesto mais natural do mundo, e o que a caixa antiga pedia —
   * não via absolutamente nada acontecer: sem erro, sem aviso, sem mudança.
   * Parecia avariada, e a conclusão óbvia era que a colagem tinha deixado de
   * funcionar.
   */
  const aviso = useMemo(() => {
    const pronto = texto.trim();
    if (!pronto || pronto.length >= 400) return null;
    if (/^https?:\/\/\S+$/i.test(pronto)) {
      return "Isso é o endereço da ficha, não a ficha. Abre esse endereço, carrega Ctrl+A e Ctrl+C na própria página, e cola isso aqui.";
    }
    return `Faltam caracteres: colaste ${pronto.length} e a página tem milhares. Confirma que fizeste Ctrl+A antes do Ctrl+C.`;
  }, [texto]);

  const total = totalDeTarefas;
  const prontas = Math.max(0, total - emFalta.length);

  return (
    <details className="paste-queue" open>
      <summary>
        Fila de colagem — {prontas} de {total}
        {percurso === "tudo" ? " (todas as vistas)" : ` em ${VISTAS.find((v) => v.id === vista)?.label ?? vista}`}
      </summary>

      <ImportarLote
        pendingUrls={tarefas.map(tarefa => enderecoDaFicha(tarefa.brawler, tarefa.vista))}
        refreshUrls={tarefasParaAtualizar.map(tarefa => enderecoDaFicha(tarefa.brawler, tarefa.vista))}
      />
      <div className="paste-queue-controls">
        <label>
          <span>Percurso</span>
          <select value={percurso} onChange={(evento) => setPercurso(evento.target.value === "tudo" ? "tudo" : "vista")}>
            <option value="tudo">Todas as vistas, brawler a brawler</option>
            <option value="vista">Só uma vista</option>
          </select>
        </label>
        <label hidden={percurso === "tudo"}>
          <span>Vista</span>
          <select value={vista} onChange={(evento) => setVista(evento.target.value)}>
            {VISTAS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} ({nomesFeitos(v.id).length})
              </option>
            ))}
          </select>
        </label>
        <div className="paste-queue-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={prontas}>
          <span style={{ width: total ? `${(prontas / total) * 100}%` : "0%" }} />
        </div>
      </div>

      {proxima ? (
        <div className="paste-queue-next">
          <span className="paste-queue-step">1</span>
          <a href={enderecoDaFicha(proxima, vistaAtiva)} target="_blank" rel="noreferrer">
            Abrir <b>{proxima}</b> · {VISTAS.find((v) => v.id === vistaAtiva)?.label ?? vistaAtiva}
          </a>
          <span className="paste-queue-hint">depois <b>Ctrl+A</b>, <b>Ctrl+C</b>, e <b>Ctrl+V</b> aqui em baixo</span>
          <button
            type="button"
            className="paste-queue-skip"
            onClick={() => { setSaltados((anteriores) => [...anteriores, proxima]); setTexto(""); setErro(null); jaEnviado.current = ""; }}
          >
            saltar
          </button>
        </div>
      ) : (
        <p className="paste-queue-done">
          {percurso === "tudo" ? "Está tudo colado: as sete vistas, brawler a brawler." : `Esta vista está completa: ${total} de ${total}.`}
        </p>
      )}

      {aviso && <p className="paste-queue-warn">{aviso}</p>}

      <textarea
        ref={caixaRef}
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        rows={3}
        placeholder={importar.isPending ? "A ler…" : "Ctrl+V aqui — guarda sozinho"}
        spellCheck={false}
        aria-label="Colar a ficha"
      />

      {erro && (
        <div className="paste-queue-error">
          <p>{erro}</p>
          <div className="paste-queue-error-actions">
            {/*
              Uma segunda colagem do MESMO texto não dispara nada: o travão que
              impede o ciclo sem fim não distingue "é igual porque a pessoa
              colou outra vez" de "é igual porque o efeito voltou a correr".
              Este botão é a diferença — é um gesto deliberado, e só ele levanta
              o travão.
            */}
            <button
              type="button"
              onClick={() => {
                jaEnviado.current = "";
                setErro(null);
                if (texto.trim().length >= 400) importar.mutate({ html: texto, view: vistaAtiva });
              }}
              disabled={importar.isPending || texto.trim().length < 400}
            >
              Tentar outra vez
            </button>
            {proxima && (
              <button
                type="button"
                className="paste-queue-skip"
                onClick={() => {
                  setSaltados((anteriores) => [...anteriores, proxima]);
                  setErro(null);
                  setTexto("");
                  jaEnviado.current = "";
                }}
              >
                Saltar {proxima} e seguir
              </button>
            )}
          </div>
        </div>
      )}

      {ultima && <p className="paste-queue-last">Guardada: {ultima}</p>}

      {emFalta.length > 1 && (
        <p className="paste-queue-upcoming">
          A seguir: {emFalta.slice(1, 6).map((tarefa) => `${tarefa.brawler} · ${VISTAS.find((v) => v.id === tarefa.vista)?.label ?? tarefa.vista}`).join(" | ")}
          {emFalta.length > 6 ? ` … e mais ${emFalta.length - 6}` : ""}
        </p>
      )}
    </details>
  );
}
