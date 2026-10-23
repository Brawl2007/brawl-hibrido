import React from "react";
import type {
  PareamentoLane3v3,
  ResultadoRecomendacaoApi,
} from "@shared/motorApiPerfeito";

export function AnaliseApi({
  lanes,
  inimigos,
  aberta,
  onAlternar,
}: {
  lanes: PareamentoLane3v3[];
  inimigos: ResultadoRecomendacaoApi[];
  aberta: boolean;
  onAlternar: () => void;
}) {
  return (
    <section className="api-analise" aria-label="Análise da API oficial">
      <button
        type="button"
        className="mesa-ajustes-botao"
        aria-pressed={aberta}
        onClick={onAlternar}
      >
        Visão do Inimigo
      </button>
      {aberta && (
        <div aria-live="polite">
          <h3>Possíveis escolhas do adversário</h3>
          <p>Calculadas da perspetiva inimiga, com os mesmos picks e bans.</p>
          <ol>
            {inimigos.slice(0, 6).map(r => (
              <li key={r.brawlerId}>
                <strong>{r.brawlerId}</strong> · {r.winProbability.toFixed(1)}%
                estimados
                {r.melhorAlvoInimigo ? ` · alvo: ${r.melhorAlvoInimigo}` : ""}
              </li>
            ))}
          </ol>
          {!inimigos.length && (
            <p>
              O adversário já completou a equipa ou não há candidatos
              disponíveis.
            </p>
          )}
        </div>
      )}
      {lanes.length > 0 && (
        <div>
          <h3>Melhores Lanes 3v3</h3>
          <ul>
            {lanes.map(l => (
              <li key={l.aliadoId}>
                <b>{l.posicaoSugerida}</b>: {l.aliadoId} contra {l.inimigoId} ·
                vantagem {l.vantagemLogit > 0 ? "+" : ""}
                {l.vantagemLogit.toFixed(3)}
              </li>
            ))}
          </ul>
          <small>
            Sugestão com base nos resultados das equipas. Os battlelogs não
            medem duelos individuais de lane.
          </small>
        </div>
      )}
    </section>
  );
}
