import { RANKS_DO_FILTRO, type IdDoRank } from "@shared/ranksDoRanked";

/**
 * Rank das partidas da API: Todos, Diamante, Mítico, Lendário, Mestre+.
 * O mesmo nas Partidas, no Draft, nos Mapas e na Matriz — e o mesmo estado
 * (`useApiOficial`), para os números baterem de página para página.
 */
export function SeletorDeRank({ rank, onChange, className = "" }: { rank: IdDoRank | ""; onChange: (rank: IdDoRank | "") => void; className?: string }) {
  return (
    <div className={`partidas-grupo ${className}`.trim()} role="radiogroup" aria-label="Rank">
      <span>Rank</span>
      <button type="button" role="radio" aria-checked={rank === ""} className={rank === "" ? "is-active" : ""} onClick={() => onChange("")}>Todos</button>
      {RANKS_DO_FILTRO.map((opcao) => (
        <button key={opcao.id} type="button" role="radio" aria-checked={rank === opcao.id} className={rank === opcao.id ? "is-active" : ""} onClick={() => onChange(opcao.id)}>
          {opcao.nome}
        </button>
      ))}
    </div>
  );
}
