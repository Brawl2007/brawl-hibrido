import React from "react";
import type { RankedDraftEntry } from "@shared/draft";

type Motor = NonNullable<RankedDraftEntry["motor"]>;

const sinal = (valor: number) => `${valor >= 0 ? "+" : "−"}${Math.abs(valor).toFixed(1)}`;

/** As contribuições do modelo escolhido; pp dos dados e pontos são unidades distintas. */
export function DetalhesDoMotor({ motor, pontos, expanded }: { motor: Motor; pontos: number; expanded: boolean }) {
  const pl = motor.nome === "plprodigy";
  const soma = motor.partes.reduce((total, parte) => total + parte.valor, 0);
  const contexto = motor.contexto;
  const descrever = (relacoes: Array<{ brawler: string; pp: number }>) => relacoes
    .filter((relacao) => relacao.pp !== 0)
    .map((relacao) => `${relacao.brawler} ${sinal(relacao.pp)} pp`).join(" · ") || "Sem sinal disponível";
  return (
    <span className="recommendation-bonus-breakdown" aria-label="Cálculo do motor escolhido">
      <small className="recommendation-motor">
        {pl ? `Soma ponderada ${soma.toFixed(1)}% → ${pontos.toFixed(2)} pts` : `Total ${pontos.toFixed(2)} pts`}
      </small>
      {motor.partes.filter((parte) => expanded || Math.abs(parte.valor) >= 0.05).map((parte) => (
        <small key={parte.nome} className={`recommendation-bonus-chip ${parte.valor < 0 ? "is-penalty" : ""}`}>
          <span className="recommendation-bonus-label">{parte.nome}</span>
          <b>{sinal(parte.valor)} {pl ? "% da soma" : "pts"}</b>
        </small>
      ))}
      {expanded && <>
        <small className="recommendation-factor-line">{pl
          ? "A soma passa pela escala estimada local. As partes acima não são pontos finais nem taxa de vitória."
          : "Base + counter + sinergia − risco. Os fatores acima somam os pontos finais."}</small>
        {contexto && <>
          <small className="recommendation-counter-line">Contra inimigos: {descrever(contexto.counters)}</small>
          <small className="recommendation-counter-line">Com aliados: {descrever(contexto.sinergias)}</small>
          {pl ? <small className="recommendation-counter-line">Ban: {contexto.inimigosPorRevelar === 0
            ? "desligado — os três inimigos já estão revelados"
            : contexto.countersBanidos.length ? `counters removidos: ${contexto.countersBanidos.join(", ")}` : "nenhum counter removido com sinal disponível"}</small>
            : <small className="recommendation-counter-line">Risco disponível: {contexto.riscos.length
              ? contexto.riscos.map((relacao) => `${relacao.brawler} −${relacao.pp.toFixed(1)} pp`).join(" · ")
              : "nenhum com sinal disponível"}</small>}
        </>}
        <small className="recommendation-source-line">pp = diferença em pontos percentuais nos dados. Modelo local inspirado no site; fórmula completa não confirmada.</small>
      </>}
    </span>
  );
}
