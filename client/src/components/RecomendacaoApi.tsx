import React from "react";
import { Retrato } from "./Retrato";
import {
  impactosPercentuais,
  type ResultadoRecomendacaoApi,
} from "@shared/motorApiPerfeito";

const NOMES: Record<keyof ResultadoRecomendacaoApi["fatores"], string> = {
  forcaMapaLogit: "Força neste mapa",
  counterLiquidoLogit: "Resposta aos inimigos",
  penalidadeHardCounterLogit: "Confrontos desfavoráveis",
  sinergiaRealLogit: "Combinação com aliados",
  riscoMinimaxLogit: "Segurança da escolha",
  penalidadeTaticaLogit: "Equilíbrio da equipa",
  ajustePoucoUsoLogit: "Confiança pelo uso",
  alivioBanLogit: "Caminho livre pelos bans",
  escassezFuncaoLogit: "Prioridade de função após bans",
  guardaCostasLogit: "Proteção contra o próximo pick inimigo",
  respostaTaticaLogit: "Resposta à composição inimiga",
};
/** As linhas do «Por que esta escolha?»: counter e sinergia aparecem separados em bônus e desbônus. */
export function linhasDoCartao(
  impactos: ResultadoRecomendacaoApi["fatores"],
  detalhes?: ResultadoRecomendacaoApi["detalhesPercentuais"]
) {
  const linhas: Array<{ chave: string; nome: string; valor: number }> = [];
  const juntar = (chave: string, nome: string, valor: number) => {
    if (Math.abs(valor) >= 0.05) linhas.push({ chave, nome, valor });
  };
  for (const chave of Object.keys(NOMES) as Array<keyof typeof NOMES>) {
    // A divisão só vale se somar o total mostrado; senão, mostra-se o total.
    const bate = (a: number, b: number, total: number) => Math.abs(a + b - total) < 0.05;
    if (chave === "counterLiquidoLogit" && detalhes && bate(detalhes.counter, detalhes.counterado, impactos[chave])) {
      juntar("counter", "Counter contra os inimigos escolhidos", detalhes.counter);
      juntar("counterado", "Counterado: já escolheram quem o countera", detalhes.counterado);
    } else if (chave === "sinergiaRealLogit" && detalhes && bate(detalhes.sinergia, detalhes.antiSinergia, impactos[chave])) {
      juntar("sinergia", "Sinergia com os aliados", detalhes.sinergia);
      juntar("antiSinergia", "Anti-sinergia com os aliados", detalhes.antiSinergia);
    } else juntar(chave, NOMES[chave], impactos[chave]);
  }
  return linhas;
}

const percentagem = (valor: number) =>
  `${valor > 0 ? "+" : "−"}${Math.abs(valor).toFixed(1)}%`;

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
  const impactos = resultado
    ? (resultado.fatoresPercentuais ?? impactosPercentuais(resultado.fatores))
    : undefined;
  const fatores = impactos
    ? linhasDoCartao(impactos, resultado?.detalhesPercentuais)
    : [];
  return (
    <article
      className={`api-recomendacao ${resultado?.bloqueado ? "api-nao-recomendado" : ""}`}
    >
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
          <small>
            {ban ? ban.motivo : "Partidas oficiais + apoio de confrontos"}
          </small>
          {resultado?.pesosDoPick && (
            <small>
              Mapa: {Math.round(resultado.pesosDoPick.vitoria * 100)}% vitória ·{" "}
              {Math.round(resultado.pesosDoPick.uso * 100)}% uso
            </small>
          )}
          {!!resultado?.bansQueLiberam?.length && (
            <small className="api-tag api-alvo">
              Caminho livre: {resultado.bansQueLiberam.join(", ")} banidos
            </small>
          )}
          {resultado?.funcaoEscassa && (
            <small className="api-tag api-sinergia">
              Poucas opções de {resultado.funcaoEscassa} após os bans
            </small>
          )}
          {resultado?.melhorAlvoInimigo && (
            <small className="api-tag api-alvo">
              Counter contra {resultado.melhorAlvoInimigo}
            </small>
          )}
          {resultado?.melhorAliado && (
            <small className="api-tag api-sinergia">
              Sinergia com {resultado.melhorAliado}
            </small>
          )}
          {!!resultado?.aliadosProtegidos?.length && (
            <small className="api-tag api-sinergia">
              Protege {resultado.aliadosProtegidos.join(", ")} contra{" "}
              {resultado.ameacasCobertas?.join(", ")}
            </small>
          )}
          {resultado?.motivosTaticos?.map(motivo => (
            <small className="api-tag api-alvo" key={motivo}>
              {motivo}
            </small>
          ))}
          {resultado?.piorRespostaFuturaInimiga && (
            <small className="api-tag api-risco">
              Atenção à resposta: {resultado.piorRespostaFuturaInimiga}
            </small>
          )}
          {!!resultado?.alertaHardCounter?.length && (
            <small className="api-tag api-veto">
              Não recomendado · hard-counter de{" "}
              {resultado.alertaHardCounter.join(", ")}
            </small>
          )}
          {resultado?.bloqueado === "nicho" && (
            <small className="api-tag api-risco">
              Pouco uso neste mapa: só no fechamento, com dois counters fortes
              comprovados
            </small>
          )}
          {resultado?.bloqueado === "mapa" && (
            <small className="api-tag api-veto">
              Fora do grupo viável deste mapa para este turno
            </small>
          )}
          {!!resultado?.falhasDeComposicao?.length && (
            <small className="api-tag api-veto">
              {resultado.falhasDeComposicao.join(" · ")}
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
          {fatores.length ? (
            <dl>
              {fatores.map(linha => (
                <div key={linha.chave}>
                  <dt>{linha.nome}</dt>
                  <dd className={linha.valor < 0 ? "api-veto" : "api-alvo"}>
                    {percentagem(linha.valor)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Sem vantagem clara nos dados deste turno.</p>
          )}
          <small>
            Impactos em pontos percentuais, a partir de uma referência de 50%.
            Estimativas do modelo; não garantem o resultado da partida.
          </small>
        </details>
      )}
    </article>
  );
}
