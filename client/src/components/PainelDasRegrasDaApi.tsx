import { RotateCcw } from "lucide-react";
import { LIMITES_DAS_REGRAS_DA_API, type DraftApiRuleSettings } from "@shared/draftRules";

/**
 * As «Regras da API» (v170): o Draft com «API oficial» ligado.
 *
 * Counter e sinergia seguem a mesma lógica: um par conta com jogos
 * suficientes neste mapa e a 55% ou mais (soma) ou a 45% ou menos (tira). Os
 * pontos são SOMADOS — a diferença para o normal dele × o peso.
 */
type Campo = { chave: keyof DraftApiRuleSettings; nome: string; ajuda: string; formato: "pct" | "jogos" | "peso" | "interruptor" };

const CAMPOS: Campo[] = [
  { chave: "apiCounterMinimo", nome: "Counter mínimo", formato: "pct", ajuda: "O counter soma com esta vitória ou mais contra o inimigo neste mapa (e acima do normal dele). Ao contrário — o inimigo com esta vitória contra ele — tira (counterado)." },
  { chave: "apiSinergiaMinima", nome: "Sinergia mínima", formato: "pct", ajuda: "A dupla soma com esta vitória ou mais neste mapa (e acima da vitória dele sozinho); com 100 menos isto ou menos, tira (anti-sinergia). A mesma lógica do counter." },
  { chave: "apiJogosMinimos", nome: "Jogos mínimos do par", formato: "jogos", ajuda: "Um confronto ou uma dupla com menos jogos neste mapa não conta. Com poucos jogos, a sorte e o azar pesam demais." },
  { chave: "apiPesoCounter", nome: "Peso do counter", formato: "peso", ajuda: "Pontos = peso × o que ganha a mais do que o normal dele (Nita 53% no mapa, 58% contra o Bull: +5). 2 dobra, 0,5 corta a metade. Junta-se o ajuste do counter por pick." },
  { chave: "apiPesoSinergia", nome: "Peso da sinergia", formato: "peso", ajuda: "Pontos = peso × o que a dupla ganha a mais (ou a menos) do que ele sozinho." },
  { chave: "apiPesoBan", nome: "Peso do ban", formato: "peso", ajuda: "Banir um counter dele (quem lhe ganha a 55% ou mais) dá peso × a vantagem desse counter. Começa em 0,5: era só uma ameaça possível. Só enquanto o adversário não revelou os três." },
  { chave: "apiPressaoPorAliado", nome: "Pressão por aliado", formato: "interruptor", ajuda: "Tira pontos quando um inimigo já escolhido countera este brawler e também um aliado teu (com a regra do counterado da API)." },
];

function mostrar(campo: Campo, valor: number) {
  if (campo.formato === "pct") return `${Math.round(valor * 100)}% · tira com ${Math.round((1 - valor) * 100)}% ou menos`;
  if (campo.formato === "jogos") return `${valor} jogos`;
  return `× ${valor.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PainelDasRegrasDaApi({ regras, ligada, personalizadas, onChange, onReset }: {
  regras: DraftApiRuleSettings;
  /** Se a «API oficial» está ligada agora (as regras só contam com ela). */
  ligada: boolean;
  personalizadas: boolean;
  onChange: (novas: Partial<DraftApiRuleSettings>) => void;
  onReset: () => void;
}) {
  return (
    <fieldset className="draft-rules-section regras-da-api">
      <legend>Regras da API</legend>
      <p className={`regras-da-api-estado ${ligada ? "is-ativa" : ""}`}>
        {ligada
          ? "Em uso agora: a «API oficial» está ligada. As regras das fontes, abaixo, não contam."
          : "Só contam com a «API oficial» ligada. Agora mandam as regras das fontes, abaixo."}
      </p>
      <p>Counter e sinergia com a mesma lógica: com jogos suficientes, 55% ou mais soma e 45% ou menos tira. Os pontos são somados (a diferença × o peso), não uma percentagem da base — o mesmo confronto vale o mesmo para quem está em cima e para quem está em baixo.</p>
      <div className="motor-grelha">
        {CAMPOS.map((campo) => {
          const id = `regra-api-${campo.chave}`;
          const valor = regras[campo.chave];
          if (campo.formato === "interruptor") {
            return (
              <label className="motor-barra" htmlFor={id} key={campo.chave} title={campo.ajuda}>
                <span className="motor-barra-topo"><b>{campo.nome}</b><output htmlFor={id}>{valor >= 0.5 ? "ligada" : "desligada"}</output></span>
                <input id={id} type="checkbox" checked={valor >= 0.5} onChange={(evento) => onChange({ [campo.chave]: evento.target.checked ? 1 : 0 })} />
                <small>{campo.ajuda}</small>
              </label>
            );
          }
          const limites = LIMITES_DAS_REGRAS_DA_API[campo.chave];
          // Os jogos vão até 200 na barra (o motor aceita até 500).
          const max = campo.formato === "jogos" ? 200 : limites.max;
          return (
            <label className="motor-barra" htmlFor={id} key={campo.chave} title={campo.ajuda}>
              <span className="motor-barra-topo"><b>{campo.nome}</b><output htmlFor={id}>{mostrar(campo, valor)}</output></span>
              <input id={id} type="range" min={limites.min} max={max} step={limites.passo} value={valor} onChange={(evento) => onChange({ [campo.chave]: Number(evento.target.value) })} />
              <small>{campo.ajuda}</small>
            </label>
          );
        })}
      </div>
      <div className="draft-rules-actions">
        <span>{personalizadas ? "Guardadas neste navegador." : "Valores recomendados: 55%, 20 jogos, counter e sinergia a 1, ban a 0,5."}</span>
        <button type="button" onClick={onReset} disabled={!personalizadas}><RotateCcw size={15} /> Restaurar padrão</button>
      </div>
    </fieldset>
  );
}
