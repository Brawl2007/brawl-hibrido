import type { DraftSignal } from "@shared/draft";

export const umaCasa = (valor: number) => valor.toLocaleString("pt-PT", { maximumFractionDigits: 1 });
export const sinal = (valor: number) => `${valor >= 0 ? "+" : "−"}${Math.abs(valor).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Porque é que um par não conta, em poucas palavras (v170, com a API). */
export function motivoDoPar(par: { conta: boolean | string; motivo?: string; jogos?: number; percentagem?: number }, jogosMinimos: number, minimoPct: number) {
  if (par.conta && par.conta !== "nao") return "conta";
  if (par.motivo === "sem-jogos") return "não conta (sem jogos)";
  if (par.motivo === "poucos-jogos") {
    const faltam = Math.max(0, jogosMinimos - (par.jogos ?? 0));
    return faltam === 1 ? "não conta (falta 1 jogo)" : `não conta (faltam ${faltam} jogos)`;
  }
  return `não conta (${Math.round(100 - minimoPct)}–${Math.round(minimoPct)}%)`;
}

/**
 * Os confrontos e as duplas deste candidato, um por linha, com a percentagem
 * e se contam — o que a dica do cartão mostra por baixo dos fatores.
 */
export function paresDaDica(signal: DraftSignal) {
  const daApi = signal.bonusSources.regrasDaApi;
  const minimo = signal.bonusSources.minimoDoCounterPct ?? 50;
  const confrontos = (signal.bonusSources.confrontosAvaliados ?? []).map((confronto) => {
    if (daApi) {
      const texto = confronto.jogos ? `${umaCasa(confronto.percentagem)}% · ${confronto.jogos} j` : "sem jogos";
      const efeito = confronto.pontos ? `${sinal(confronto.pontos)} pts` : motivoDoPar(confronto, daApi.apiJogosMinimos, minimo);
      return { nome: confronto.inimigo, texto, efeito, conta: Boolean(confronto.pontos), desbonus: (confronto.pontos ?? 0) < 0 };
    }
    const efeito = confronto.conta === "nao" ? (confronto.delta ? `não conta (abaixo de ${Math.round(minimo)}%)` : "não conta (sem vantagem)") : confronto.conta === "bonus" ? "conta" : "conta (contra)";
    return { nome: confronto.inimigo, texto: `${umaCasa(confronto.percentagem)}%`, efeito, conta: confronto.conta !== "nao", desbonus: confronto.conta === "desbonus" };
  });
  const duplas = (signal.bonusSources.duplasAvaliadas ?? []).map((dupla) => {
    if (daApi) {
      const texto = dupla.jogos ? `${umaCasa(dupla.percentagem ?? 50)}% · ${dupla.jogos} j` : "sem jogos";
      const efeito = dupla.pontos ? `${sinal(dupla.pontos)} pts` : motivoDoPar(dupla, daApi.apiJogosMinimos, daApi.apiSinergiaMinima * 100);
      return { nome: dupla.aliado, texto, efeito, conta: Boolean(dupla.pontos), desbonus: (dupla.pontos ?? 0) < 0 };
    }
    const texto = typeof dupla.delta === "number" ? `${dupla.delta >= 0 ? "+" : ""}${umaCasa(dupla.delta)}%${dupla.fonte ? ` · ${dupla.fonte}` : ""}` : "sem número publicado";
    return { nome: dupla.aliado, texto, efeito: dupla.conta ? "conta" : "não conta", conta: dupla.conta, desbonus: false };
  });
  return { confrontos, duplas };
}
