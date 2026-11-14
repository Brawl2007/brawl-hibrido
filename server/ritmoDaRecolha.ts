/**
 * O ritmo da recolha de partidas (v184): quantos jogadores se leem por volta e
 * quantos pedidos correm ao mesmo tempo.
 *
 * POR QUE EXISTE
 *
 * Eram sempre 120 jogadores, oito de cada vez: ~60 mil partidas novas por dia,
 * enquanto a lista de 50 mil jogadores esperava ~8 dias entre leituras — e a API
 * só guarda as últimas 25 partidas de cada um. A recolha sobe devagar enquanto
 * a API aguenta, e corta logo que ela começa a recusar pedidos.
 *
 * A Supercell não publica o limite de pedidos da chave, por isso o ritmo
 * descobre-se: +60 jogadores por volta limpa (e +1 pedido em simultâneo) até ao
 * teto; com respostas 429 corta-se para metade. Função pura: ler e gravar o
 * estado fica na recolha.
 */
export type RitmoDaRecolha = { jogadores: number; concorrencia: number };

export const RITMO_INICIAL: RitmoDaRecolha = { jogadores: 240, concorrencia: 10 };
export const LIMITES_DO_RITMO = { jogadoresMin: 120, jogadoresMax: 720, concorrenciaMin: 4, concorrenciaMax: 12 } as const;
export const PASSO_DE_SUBIDA = 60;
/** Parte mínima das leituras de cada volta que ficam para os rankings (descoberta de jogadores novos). */
export const FRACAO_DOS_RANKINGS = 0.12;

export type ResultadoDaLeitura = {
  /** Pedidos feitos à API nesta volta. */
  pedidos: number;
  /** Respostas 429 (limite de pedidos). */
  limitados: number;
  /** Outras falhas: 5xx, 403, rede, tempo esgotado. */
  falhas: number;
  /** Todos os jogadores previstos foram lidos antes do limite de tempo. */
  completa: boolean;
  /**
   * Pode subir? Só depois da migração para os pacotes: enquanto as partidas
   * ainda se gravam nas tabelas antigas (~18 linhas por partida), mais leituras
   * enchiam a base mais depressa. Cortar por limite de pedidos vale sempre.
   */
  podeSubir?: boolean;
};

const limitar = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(valor)));

export function normalizarRitmo(valor: unknown): RitmoDaRecolha {
  const bruto = (valor && typeof valor === "object" ? valor : {}) as Partial<RitmoDaRecolha>;
  const numero = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? v : padrao);
  return {
    jogadores: limitar(numero(bruto.jogadores, RITMO_INICIAL.jogadores), LIMITES_DO_RITMO.jogadoresMin, LIMITES_DO_RITMO.jogadoresMax),
    concorrencia: limitar(numero(bruto.concorrencia, RITMO_INICIAL.concorrencia), LIMITES_DO_RITMO.concorrenciaMin, LIMITES_DO_RITMO.concorrenciaMax),
  };
}

export function lerRitmo(texto: string | null | undefined): RitmoDaRecolha {
  try {
    return normalizarRitmo(texto ? JSON.parse(texto) : null);
  } catch {
    return { ...RITMO_INICIAL };
  }
}

/** O ritmo da volta seguinte, dado o que aconteceu nesta. */
export function ajustarRitmoDaRecolha(ritmo: RitmoDaRecolha, r: ResultadoDaLeitura): RitmoDaRecolha {
  const atual = normalizarRitmo(ritmo);
  if (r.pedidos <= 0) return atual;
  if (r.limitados >= 3 || r.limitados / r.pedidos >= 0.02) {
    // A API recusou pedidos: metade dos jogadores e menos pedidos ao mesmo tempo.
    return normalizarRitmo({ jogadores: atual.jogadores / 2, concorrencia: atual.concorrencia - 2 });
  }
  if (!r.completa) {
    // O tempo acabou antes de ler todos: pede-se menos na volta seguinte.
    return normalizarRitmo({ jogadores: atual.jogadores * 0.8, concorrencia: atual.concorrencia });
  }
  if (r.falhas / r.pedidos > 0.1 || r.podeSubir === false) return atual;
  return normalizarRitmo({ jogadores: atual.jogadores + PASSO_DE_SUBIDA, concorrencia: atual.concorrencia + 1 });
}

/** Quantos dos lugares ficam para a lista; os rankings têm sempre uma fatia mínima. */
export function lugaresDaListaNaVolta(total: number) {
  return Math.max(0, total - Math.ceil(total * FRACAO_DOS_RANKINGS));
}
