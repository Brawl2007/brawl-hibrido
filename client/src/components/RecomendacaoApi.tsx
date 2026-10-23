import React from "react";
import { Retrato } from "./Retrato";
import type { ResultadoRecomendacaoApi } from "@shared/motorApiPerfeito";

const NOMES: Record<keyof ResultadoRecomendacaoApi["fatores"], string> = {
  forcaMapaLogit: "Força no mapa",
  counterLiquidoLogit: "Counter líquido",
  penalidadeHardCounterLogit: "Hard-counter",
  sinergiaRealLogit: "Sinergia real",
  riscoMinimaxLogit: "Risco de resposta",
  penalidadeTaticaLogit: "Composição",
  ajustePoucoUsoLogit: "Pouco uso",
};

export function RecomendacaoApi({
  nome,
  imagem,
  resultado,
  ban,
  index,
  expanded,
  locked,
  onSelect,
}: {
  nome: string;
  imagem: string | null;
  resultado?: ResultadoRecomendacaoApi;
  ban?: { banScore: number; motivo: string };
  index: number;
  expanded: boolean;
  locked: boolean;
  onSelect: (nome: string) => void;
}) {
  return (
    <article className="api-recomendacao">
      <button
        type="button"
        className="draft-recommendation"
        disabled={locked}
        onClick={() => onSelect(nome)}
        aria-label={`${ban ? "Banir" : "Escolher"} ${nome}`}
      >
        <span className="recommendation-rank">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="recommendation-avatar com-retrato">
          <Retrato src={imagem} nome={nome} />
        </span>
        <span className="recommendation-main">
          <strong>{nome}</strong>
          <small>{ban ? ban.motivo : "API oficial · modelo bayesiano"}</small>
          {resultado?.melhorAlvoInimigo && (
            <small className="api-alvo">
              Melhor alvo: {resultado.melhorAlvoInimigo}
            </small>
          )}
          {resultado?.piorRespostaFuturaInimiga && (
            <small>
              Resposta possível: {resultado.piorRespostaFuturaInimiga}
            </small>
          )}
          {!!resultado?.alertaHardCounter?.length && (
            <small className="api-alerta">
              Hard-counter: {resultado.alertaHardCounter.join(", ")}
            </small>
          )}
        </span>
        <span className="recommendation-metrics">
          <b>
            {ban
              ? ban.banScore.toFixed(1)
              : `${resultado?.winProbability.toFixed(1)}%`}
          </b>
          <small>{ban ? "PRIORIDADE DE BAN" : "CHANCE ESTIMADA"}</small>
        </span>
        <span className="recommendation-action">{locked ? "LOCK" : "ADD"}</span>
      </button>
      {resultado && (
        <details className="api-fatores" open={expanded}>
          <summary>
            Por que esta escolha? · turno {resultado.turnoAtual}
          </summary>
          <dl>
            {(Object.keys(NOMES) as Array<keyof typeof NOMES>).map(chave => (
              <div key={chave}>
                <dt>{NOMES[chave]}</dt>
                <dd>
                  {resultado.fatores[chave] > 0 ? "+" : ""}
                  {resultado.fatores[chave].toFixed(3)}
                </dd>
              </div>
            ))}
          </dl>
          <small>
            Os fatores somam {resultado.logOddsFinal.toFixed(3)} em log-odds. A
            percentagem é uma estimativa do modelo, sem calibração empírica.
          </small>
        </details>
      )}
    </article>
  );
}
