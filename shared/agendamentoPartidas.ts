/** Partidas têm um relógio próprio; o cron diário dos mapas não as agenda. */
export const INTERVALO_DAS_PARTIDAS_MS = 15 * 60_000;
export const RECOLHA_PRESA_MS = 10 * 60_000;
// Alguns agendadores enviam o pedido segundos antes do minuto marcado.
const MARGEM_DO_AGENDADOR_MS = 30_000;
const MARGEM_DO_ALERTA_MS = 90_000;

export const AGENDAMENTO_DAS_PARTIDAS = {
  intervaloMinutos: 15,
  cron: "3,18,33,48 * * * *",
  descricao: "a cada 15 minutos; GitHub Actions pode atrasar",
  fonte: ".github/workflows/recolher-partidas.yml",
  horarioPrincipal: "00, 15, 30 e 45 de cada hora",
  urlAgendador: "https://brawl-hibrido.vercel.app/api/partidas/agendar",
} as const;

type EstadoGuardado = {
  lastStatus?: string | null;
  lastStartedAt?: Date | string | null;
  lastCompletedAt?: Date | string | null;
  lastError?: string | null;
};

function instante(valor: Date | string | null | undefined) {
  const ms = valor ? new Date(valor).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** Uma janela por quarto de hora, sem saltar uma volta por poucos segundos de variação. */
export function inicioDaJanelaDasPartidas(agora = new Date()) {
  return new Date(Math.floor((agora.getTime() + MARGEM_DO_AGENDADOR_MS) / INTERVALO_DAS_PARTIDAS_MS)
    * INTERVALO_DAS_PARTIDAS_MS - MARGEM_DO_AGENDADOR_MS);
}

export function proximaHoraDasPartidas(desde = new Date()) {
  return new Date(inicioDaJanelaDasPartidas(desde).getTime() + MARGEM_DO_AGENDADOR_MS + INTERVALO_DAS_PARTIDAS_MS);
}

export function podeRecolherAgora(config: EstadoGuardado | undefined, agora = new Date()) {
  const inicio = instante(config?.lastStartedAt);
  const proximaPrevista = proximaHoraDasPartidas(inicio === null ? agora : new Date(inicio)).toISOString();
  if (inicio !== null && config?.lastStatus === "running" && agora.getTime() - inicio < RECOLHA_PRESA_MS) {
    return { pode: false as const, motivo: "Já há uma recolha a correr.", proximaPrevista };
  }
  if (inicio !== null && inicio >= inicioDaJanelaDasPartidas(agora).getTime()) {
    return { pode: false as const, motivo: "Esta janela de 15 minutos já teve uma recolha.", proximaPrevista };
  }
  return { pode: true as const, proximaPrevista };
}

/** Descreve o que aconteceu; uma hora prevista não é prova de execução. */
export function estadoDaCadenciaDasPartidas(config: EstadoGuardado | undefined, temChave: boolean, agora = new Date()) {
  const inicio = instante(config?.lastStartedAt);
  const concluida = instante(config?.lastCompletedAt);
  const proxima = proximaHoraDasPartidas(inicio === null ? agora : new Date(inicio));
  const atrasada = inicio !== null && agora.getTime() > proxima.getTime() + MARGEM_DO_ALERTA_MS;
  const aCorrer = config?.lastStatus === "running" && inicio !== null && agora.getTime() - inicio < RECOLHA_PRESA_MS;
  const estado = !temChave ? "sem_chave" : inicio === null ? "sem_recolhas"
    : aCorrer ? "a_recolher" : config?.lastStatus === "failed" ? "falhou"
    : atrasada || config?.lastStatus === "running" ? "atrasada" : "em_dia";
  return {
    estado,
    intervaloMinutos: 15,
    ultimaTentativa: inicio === null ? null : new Date(inicio).toISOString(),
    ultimaConclusao: config?.lastStatus === "success" && concluida !== null ? new Date(concluida).toISOString() : null,
    proximaPrevista: proxima.toISOString(),
    erro: config?.lastError ?? null,
  };
}
