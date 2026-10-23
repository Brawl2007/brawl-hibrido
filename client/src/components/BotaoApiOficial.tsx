/**
 * O botão «API oficial», igual no Draft, nos Mapas e na Matriz 1v1.
 *
 * Mexe no mesmo interruptor em todas as páginas (`useApiOficial`): ligado, só
 * contam as partidas Ranked recolhidas da API da Supercell; desligado, voltam
 * as fontes (BrawlScope, Brawl Planet, TopBrawl, PL Prodigy) com os pesos.
 */
export function BotaoApiOficial({ ligada, onAlternar, className = "" }: { ligada: boolean; onAlternar: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={`mesa-fonte-api botao-api-oficial ${ligada ? "is-active" : ""} ${className}`.trim()}
      aria-pressed={ligada}
      onClick={onAlternar}
      title="Ligado: estatísticas das partidas oficiais; confrontos e duplas com poucos jogos recebem apoio das matrizes do projeto. Desligado: estatísticas das outras fontes, com os pesos."
    >
      <span className="mesa-fonte-api-caixa" aria-hidden="true">{ligada ? "✓" : ""}</span>
      API oficial
    </button>
  );
}
