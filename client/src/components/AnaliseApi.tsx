import React from "react";
import type {
  PareamentoLane3v3,
  ResultadoRecomendacaoApi,
} from "@shared/motorApiPerfeito";

const ROTAS = [
  { id: "Side A", nome: "Lateral Esquerda" },
  { id: "Mid", nome: "Meio (Mid)" },
  { id: "Side B", nome: "Lateral Direita" },
] as const;

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
  const sugestoes = inimigos.filter(r => !r.bloqueado).slice(0, 6);
  return (
    <section className="api-analise" aria-label="Análise das partidas oficiais">
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
          <p>
            Respostas para o próximo turno dele, respeitando os picks e bans já
            feitos.
          </p>
          <ol className="api-inimigos">
            {sugestoes.map(r => (
              <li key={r.brawlerId}>
                <strong>{r.brawlerId}</strong>
                <b>{r.winProbability.toFixed(1)}%</b>
                <small>
                  Turno {r.turnoAtual}
                  {r.melhorAlvoInimigo
                    ? ` · counter contra ${r.melhorAlvoInimigo}`
                    : ""}
                </small>
              </li>
            ))}
          </ol>
          {!sugestoes.length && (
            <p>
              O adversário já completou a equipa ou não há uma recomendação
              segura disponível.
            </p>
          )}
        </div>
      )}
      {lanes.length > 0 && (
        <div>
          <h3>Melhores Lanes 3v3</h3>
          <div className="api-lanes">
            {ROTAS.map(rota => {
              const lane = lanes.find(l => l.posicaoSugerida === rota.id);
              const vantagem = lane ? lane.vantagemPercentualEstimada - 50 : 0;
              return (
                <section
                  className="api-lane"
                  key={rota.id}
                  aria-label={rota.nome}
                >
                  <h4>{rota.nome}</h4>
                  {lane ? (
                    <>
                      <strong>{lane.aliadoId}</strong>
                      <span>contra {lane.inimigoId}</span>
                      <b className={vantagem < 0 ? "api-veto" : "api-alvo"}>
                        {vantagem > 0 ? "+" : vantagem < 0 ? "−" : ""}
                        {Math.abs(vantagem).toFixed(1)}%
                      </b>
                      <small>vantagem estimada</small>
                    </>
                  ) : (
                    <span>A aguardar os picks desta rota</span>
                  )}
                </section>
              );
            })}
          </div>
          <small>
            Sugestões a partir de resultados de equipas e dados de apoio. A API
            não observa duelos individuais de lane.
          </small>
        </div>
      )}
    </section>
  );
}
