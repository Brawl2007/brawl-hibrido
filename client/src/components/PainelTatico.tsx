/**
 * O General tático: as decisões do motor tático e a explicação da IA, à parte.
 *
 * O que vem do Jev diz "Decisões do Jev"; o que vem das regras do site (sem
 * Jev) diz isso mesmo; e o texto da IA de texto fica numa caixa própria,
 * "Explicação da IA — só explica". Nunca se mostra texto da Gemini como se
 * fosse uma decisão.
 *
 * O navegador não fala com a TypeSafe: tudo passa pelo servidor (tRPC).
 */
import { Retrato } from "@/components/Retrato";
import {
  ABERTURAS,
  ACOES_NO_CONFRONTO,
  ESTILOS,
  MUDAR_DE_PLANO,
  NOME_DA_LANE,
  PLANOS,
  PRIORIDADES,
  RESPOSTAS_AO_RECUO,
  RESPOSTAS_A_VANTAGEM,
  ROTACOES,
  nivelDeConfianca,
  nomeDe,
  type EstrategiaTatica,
  type ExplicacaoTatica,
  type FaseExplicada,
} from "@shared/estrategiaTatica";
import { VELOCIDADES, type ComandoDoLeitor, type EstadoDoLeitor, type PassoDaTimeline, type TimelineTatica, type Velocidade } from "@shared/timelineTatica";

export type ResultadoDoMotor =
  | { motor: "jev"; estrategia: EstrategiaTatica; modelo: string; segundos: number; emCache: boolean }
  | { motor: "indisponivel"; motivo: string; aviso: string; detalhe: string; estrategiaBase: EstrategiaTatica | null };

const NOME_DA_FASE: Record<FaseExplicada, string> = {
  abertura: "Abertura",
  confrontos: "Confrontos",
  ameaca: "Se a ameaça avançar",
  rotacao: "Rotação",
  "perde-esquerda": "Se perdermos a esquerda",
  vantagem: "Com vantagem",
};

type Props = {
  resultado: ResultadoDoMotor | null;
  aPedir: boolean;
  jevConfigurado: boolean;
  explicacao: { explicacao: ExplicacaoTatica; modelo: string } | null;
  aExplicar: boolean;
  erroDaExplicacao: string | null;
  aSimular: boolean;
  onPedir: () => void;
  onSimular: () => void;
  onExplicar: () => void;
  retratoDe: (brawler: string, lado: "nos" | "eles") => string | null;
};

export function PainelTatico({ resultado, aPedir, jevConfigurado, explicacao, aExplicar, erroDaExplicacao, aSimular, onPedir, onSimular, onExplicar, retratoDe }: Props) {
  const doJev = resultado?.motor === "jev";
  const estrategia = resultado?.motor === "jev" ? resultado.estrategia : resultado?.estrategiaBase ?? null;
  const nivel = doJev ? nivelDeConfianca(estrategia?.confianca.geral) : null;
  return (
    <section className="qg-tatico" aria-label="General tático">
      <header className="qg-tatico-topo">
        <span className="qg-titulo">GENERAL TÁTICO</span>
        <button type="button" onClick={onPedir} disabled={aPedir}>
          {aPedir ? "O Jev está a decidir…" : doJev ? "Pedir de novo" : "Pedir ao Jev"}
        </button>
      </header>

      {!resultado && !aPedir && (
        <p className="qg-tatico-vazio">
          {jevConfigurado ? "O motor tático (Jev) decide lanes, confrontos, rotações e o plano quando o draft fecha." : "O Jev ainda não está configurado no servidor (TYPESAFE_API_KEY). O General usa a IA padrão."}
        </p>
      )}

      {resultado?.motor === "indisponivel" && (
        <p className="qg-tatico-aviso" role="status">
          <strong>{resultado.aviso}</strong>
          <small>{resultado.detalhe}</small>
        </p>
      )}

      {estrategia && (
        <>
          <dl className="qg-tatico-resumo">
            <div><dt>Motor</dt><dd>{doJev ? `Jev${resultado?.motor === "jev" && resultado.modelo ? ` · ${resultado.modelo}` : ""}` : "Regras do site (sem Jev)"}</dd></div>
            <div><dt>Confiança</dt><dd>{nivel && typeof estrategia.confianca.geral === "number" ? `${nivel} · ${Math.round(estrategia.confianca.geral * 100)}%` : "—"}</dd></div>
            <div><dt>Plano</dt><dd>{estrategia.plano} · {nomeDe(PLANOS, estrategia.plano)}</dd></div>
          </dl>
          <p className={`qg-tatico-origem${doJev ? " is-jev" : ""}`}>
            {doJev ? "Decisões do Jev" : "Estratégia base das regras do site (as lanes e duelos do Draft) — não foi o Jev que decidiu"}
          </p>

          <span className="qg-titulo">LANES</span>
          <ul className="qg-tatico-lanes">
            {estrategia.confrontos.map((c) => (
              <li key={c.nosso}>
                <Retrato src={retratoDe(c.nosso, "nos")} nome={c.nosso} alt={c.nosso} loading="lazy" />
                <div>
                  <b>{c.nosso}</b>
                  <small>{NOME_DA_LANE[c.lane]} · contra {c.deles}: {nomeDe(ACOES_NO_CONFRONTO, c.acao).toLowerCase()}</small>
                </div>
              </li>
            ))}
          </ul>

          <div className="qg-tatico-alvos">
            <div><span className="qg-titulo">ALVO PRIORITÁRIO</span><b>{estrategia.alvoPrioritario}</b></div>
            <div><span className="qg-titulo">MAIOR AMEAÇA</span><b>{estrategia.maiorAmeaca}</b></div>
          </div>

          <div className="qg-chips">
            <span className="qg-chip qg-chip--azul">Estilo: {nomeDe(ESTILOS, estrategia.estilo)}</span>
            <span className="qg-chip qg-chip--azul">Abertura: {nomeDe(ABERTURAS, estrategia.abertura).toLowerCase()}</span>
            <span className="qg-chip qg-chip--azul">Rotação: {nomeDe(ROTACOES, estrategia.rotacao).toLowerCase()}</span>
            <span className="qg-chip qg-chip--azul">Prioridade: {nomeDe(PRIORIDADES, estrategia.prioridade).toLowerCase()}</span>
          </div>

          <span className="qg-titulo">CONDIÇÕES</span>
          <ul className="qg-tatico-condicoes">
            <li>Se <b>{estrategia.maiorAmeaca}</b> avançar → <b>{estrategia.condicoes.ameacaAvanca}</b> ajuda</li>
            <li>Se perdermos a esquerda → {estrategia.condicoes.perdeEsquerda === "recuar" ? "a equipa recua" : <><b>{estrategia.condicoes.perdeEsquerda}</b> roda</>}</li>
            <li>Com vantagem → {nomeDe(RESPOSTAS_A_VANTAGEM, estrategia.condicoes.ganhaVantagem).toLowerCase()}</li>
            <li>Se recuarem → {nomeDe(RESPOSTAS_AO_RECUO, estrategia.condicoes.inimigoRecua).toLowerCase()}</li>
            <li>Plano de recurso: {estrategia.planoDeRecurso} · {nomeDe(PLANOS, estrategia.planoDeRecurso)} ({nomeDe(MUDAR_DE_PLANO, estrategia.mudarDePlano).toLowerCase()})</li>
          </ul>

          <p className="qg-tatico-vitoria"><span className="qg-titulo">CONDIÇÃO DE VITÓRIA</span>🏆 {estrategia.condicaoDeVitoria}</p>

          <button type="button" className="qg-tatico-simular" onClick={onSimular}>{aSimular ? "↺ Simular de novo" : "▶ SIMULAR ESTRATÉGIA"}</button>
        </>
      )}

      {doJev && (
        <div className="qg-tatico-explicacao" aria-live="polite">
          <header>
            <span className="qg-titulo">EXPLICAÇÃO DA IA</span>
            <small>só explica — não muda as decisões do Jev{explicacao ? ` · ${explicacao.modelo}` : ""}</small>
          </header>
          {aExplicar && <p className="qg-tatico-vazio">A IA está a escrever a explicação…</p>}
          {!aExplicar && erroDaExplicacao && (
            <p className="qg-tatico-vazio">{erroDaExplicacao} <button type="button" onClick={onExplicar}>Tentar outra vez</button></p>
          )}
          {!aExplicar && !erroDaExplicacao && !explicacao && <button type="button" onClick={onExplicar}>Pedir a explicação</button>}
          {explicacao && (
            <>
              {explicacao.explicacao.resumo && <p><strong>{explicacao.explicacao.resumo}</strong></p>}
              <ul>
                {explicacao.explicacao.porBrawler.map((p) => (
                  <li key={p.brawler}>
                    <b>{p.brawler}:</b> {p.instrucao}
                    {p.corrigida && <small className="qg-tatico-corrigida" title="A IA não explicou este brawler, ou contradisse a lane decidida: esta instrução foi escrita a partir das decisões."> (das decisões)</small>}
                  </li>
                ))}
              </ul>
              {explicacao.explicacao.porFase.length > 0 && (
                <ol className="qg-tatico-fases">
                  {explicacao.explicacao.porFase.map((f) => <li key={f.fase}><b>{NOME_DA_FASE[f.fase]}</b> {f.dica}</li>)}
                </ol>
              )}
              {explicacao.explicacao.justificativa && <p className="qg-tatico-porque">Porquê: {explicacao.explicacao.justificativa}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Os controlos da simulação, por cima do mapa: a legenda do passo, Play/Pausa, Reiniciar, velocidade e o progresso. */
export function ControlosDaSimulacao({ timeline, passo, indice, leitor, comandar, onSair }: {
  timeline: TimelineTatica;
  passo: PassoDaTimeline;
  indice: number;
  leitor: EstadoDoLeitor;
  comandar: (comando: ComandoDoLeitor) => void;
  onSair: () => void;
}) {
  return (
    <div className="qg-simulacao" role="group" aria-label="Simulação da estratégia">
      <p key={passo.id} className="qg-legenda qg-simulacao-legenda" aria-live="polite">
        <b>{passo.titulo}</b> {passo.legenda}
      </p>
      <div className="qg-simulacao-botoes">
        <button type="button" onClick={() => comandar({ tipo: leitor.tocando ? "pausar" : "tocar" })}>{leitor.tocando ? "⏸ Pausa" : "▶ Play"}</button>
        <button type="button" onClick={() => comandar({ tipo: "reiniciar" })}>↺ Reiniciar</button>
        <select aria-label="Velocidade da simulação" value={leitor.velocidade} onChange={(e) => comandar({ tipo: "velocidade", valor: Number(e.target.value) as Velocidade })}>
          {VELOCIDADES.map((v) => <option key={v} value={v}>{String(v).replace(".", ",")}×</option>)}
        </select>
        <progress max={timeline.duracaoS} value={leitor.tempoS} aria-label="Progresso da simulação" />
        <small>{leitor.tempoS.toFixed(1).replace(".", ",")} s · passo {indice + 1}/{timeline.passos.length}</small>
        <button type="button" className="qg-simulacao-sair" onClick={onSair}>✕ Sair</button>
      </div>
    </div>
  );
}
