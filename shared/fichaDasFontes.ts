/**
 * A ficha de um brawler pelas fontes — a Matriz 1v1 com o botão «API»
 * desligado.
 *
 * Os confrontos são os do Draft (`getMatchupValue`): o delta do BrawlScope
 * mais as confirmações do PL Prodigy e do Brawl Planet, com os pesos de
 * sempre.
 * As duplas são o «Pair with» do BrawlScope. As fontes não publicam trios nem
 * contagens de jogos: isso só existe com a API ligada.
 */
import { describeMatchupValue, getMatchupValue } from "./counterMatchupValue";
import { getBrawlScopeSynergyTeammates } from "./counterSourceRelations";

export type ConfrontoDasFontes = { adversario: string; valor: number; texto: string };
export type DuplaDasFontes = { aliado: string; delta: number | null };

const DESTAQUES = 10;

/**
 * Cada confronto é lido do lado do ADVERSÁRIO, como na API e no BrawlScope:
 * `getMatchupValue(adversário, brawler)` é o que o Draft daria ao adversário
 * se o escolhessem contra ele. Positivo = counter; negativo = é castigado. O
 * texto das fontes fica com o mesmo sinal do número ao lado.
 */
export function fichaDasFontes(brawler: string, adversarios: readonly string[], modeId?: string) {
  const mesmo = (a: string, b: string) => a.toLocaleLowerCase("en") === b.toLocaleLowerCase("en");
  const confrontos: ConfrontoDasFontes[] = adversarios
    .filter((nome) => !mesmo(nome, brawler))
    .map((adversario) => {
      const valor = getMatchupValue(adversario, brawler, modeId);
      return { adversario, valor: valor.base === null ? 0 : valor.total, texto: describeMatchupValue(valor) };
    })
    .sort((a, b) => b.valor - a.valor || a.adversario.localeCompare(b.adversario, "pt-PT"));
  const duplas: DuplaDasFontes[] = getBrawlScopeSynergyTeammates(brawler, modeId, true)
    .map((relacao) => ({ aliado: relacao.brawler, delta: relacao.delta ?? null }));
  return {
    confrontos,
    duplas,
    /** Quem leva vantagem sobre ele: o maior valor primeiro. */
    counters: confrontos.filter((linha) => linha.valor > 0).slice(0, DESTAQUES),
    /** Quem ele castiga: o valor mais negativo primeiro. */
    castiga: confrontos.filter((linha) => linha.valor < 0).reverse().slice(0, DESTAQUES),
  };
}
