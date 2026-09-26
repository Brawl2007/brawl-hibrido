import { useRankedSync } from "@/contexts/RankedSyncContext";
import { ELOS_BRAWL_PLANET, mapaTemElo } from "@shared/elosBrawlPlanet";

/**
 * Escolha do elo para os números do Brawl Planet. Aparece nos mapas e no
 * Draft; a escolha é a mesma nos dois sítios (ver `useEloBrawlPlanet`).
 *
 * Diz sempre o que muda e o que não muda: o TopBrawl não separa por elo, e há
 * mapas sem jogos suficientes num elo — nesses fica All ranks, e está escrito.
 */
export function SeletorDeElo({ mapa }: { mapa?: string }) {
  const { elo, setElo, elosDisponiveis, snapshot } = useRankedSync();
  const elos = snapshot?.elosBrawlPlanet;
  const semElosAinda = elosDisponiveis.length === 0;
  // Um elo guardado antes de haver dados não pode parecer ativo: o que se vê é All ranks.
  const ativo = semElosAinda ? "all" : elo;
  const jogos = mapa ? elos?.jogos?.[mapa]?.[elo] : undefined;
  const nomeDoElo = ELOS_BRAWL_PLANET.find((item) => item.id === elo)?.nome ?? "All ranks";

  let nota: string;
  if (semElosAinda) nota = "Os elos chegam com a próxima recolha diária. Até lá, All ranks.";
  else if (elo === "all") nota = "Diamond 1 para cima, todos juntos. O TopBrawl não separa por elo.";
  else if (mapa && !mapaTemElo(elos, mapa, elo)) nota = `Poucos jogos de ${nomeDoElo} em ${mapa}: o Brawl Planet não publica, por isso aqui fica All ranks.`;
  else nota = `${typeof jogos === "number" ? `${jogos.toLocaleString("pt-PT")} jogos de ${nomeDoElo}${mapa ? ` em ${mapa}` : ""}. ` : ""}Só muda a parte do Brawl Planet; o TopBrawl não separa por elo.`;

  return (
    <div className="seletor-elo" title={nota}>
      <div className="seletor-elo-botoes" role="radiogroup" aria-label="Elo dos números do Brawl Planet">
        <span className="seletor-elo-rotulo">Elo</span>
        {ELOS_BRAWL_PLANET.map((item) => {
          const disponivel = item.id === "all" || elosDisponiveis.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={ativo === item.id}
              className={ativo === item.id ? "is-active" : ""}
              disabled={!disponivel}
              title={disponivel ? undefined : "Ainda não recolhido"}
              onClick={() => setElo(item.id)}
            >
              {item.nome}
            </button>
          );
        })}
      </div>
      <small className="seletor-elo-nota">{nota}</small>
    </div>
  );
}
