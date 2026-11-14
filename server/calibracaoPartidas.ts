/**
 * A calibração do motor da API, corrida sobre as partidas guardadas (v185).
 * A conta está em `shared/calibracaoDoMotorApi.ts`; aqui lê-se os pacotes, uma
 * vez por dia, e guarda-se o resultado para o Draft o mostrar.
 */
import { criarCalibracao, type ResultadoDaCalibracao } from "@shared/calibracaoDoMotorApi";
import { desempacotar, diaDaBatalha, diaMenos } from "@shared/partidasCompactas";
import { getSettingFresh, setSetting } from "./appSettings";
import { lerArmazenamento } from "./migracaoCompacta";
import { contarPartidasEmPacotes, percorrerPacotes } from "./pacotesDePartidas";

export const CHAVE_DA_CALIBRACAO = "calibracaoDoMotorApi";
/** Uma volta por dia basta: os números mudam devagar. */
const VALIDADE_MS = 20 * 3_600_000;
const DIAS_DA_VALIDACAO = 7;
const DIAS_NO_TOTAL = 30;
/** Mais do que isto nas estatísticas só custava tempo: usa-se uma amostra repetível. */
const MAXIMO_NAS_ESTATISTICAS = 1_500_000;
/** Tempo mínimo que tem de sobrar para valer a pena começar (duas passagens pelos pacotes). */
const MINIMO_PARA_COMECAR_MS = 90_000;

export function lerCalibracaoGuardada(texto: string | null | undefined): ResultadoDaCalibracao | null {
  try {
    const lido = texto ? (JSON.parse(texto) as Partial<ResultadoDaCalibracao>) : null;
    return lido && typeof lido.geradoEm === "string" && lido.pesos && lido.qualidade ? (lido as ResultadoDaCalibracao) : null;
  } catch {
    return null;
  }
}

export async function calibrarPartidas(agora: Date, prazo: number): Promise<ResultadoDaCalibracao> {
  const segundos = Math.floor(agora.getTime() / 1000);
  const desdeDia = diaMenos(diaDaBatalha(segundos), DIAS_NO_TOTAL);
  const total = await contarPartidasEmPacotes();
  const calibracao = criarCalibracao({
    corteDeValidacao: segundos - DIAS_DA_VALIDACAO * 86_400,
    taxaDasEstatisticas: Math.min(1, MAXIMO_NAS_ESTATISTICAS / Math.max(1, total)),
  });
  const percorrer = (consumir: (b: { mapa: string; t: number; vencedores: string[]; derrotados: string[] }) => void) =>
    percorrerPacotes({ desdeDia }, (linha) => {
      if (Date.now() > prazo) throw new Error("A calibração ficou sem tempo.");
      for (const b of desempacotar(linha.dados)) consumir({ mapa: linha.mapId, t: b.t, vencedores: b.vencedores, derrotados: b.derrotados });
    });
  await percorrer((b) => calibracao.passagem1(b));
  calibracao.iniciarPassagem2();
  await percorrer((b) => calibracao.passagem2(b));
  return calibracao.terminar(agora);
}

/** Chamada pelo cron diário: calibra se já passou o dia, os pacotes são a fonte e há tempo. */
export async function calibrarSeForAltura(agora = new Date(), prazo = Date.now() + 120_000) {
  if ((await lerArmazenamento()) !== "compacto") return { estado: "sem_pacotes" as const };
  const guardada = lerCalibracaoGuardada(await getSettingFresh(CHAVE_DA_CALIBRACAO));
  if (guardada && agora.getTime() - Date.parse(guardada.geradoEm) < VALIDADE_MS) return { estado: "recente" as const };
  if (prazo - Date.now() < MINIMO_PARA_COMECAR_MS) return { estado: "sem_tempo" as const };
  const resultado = await calibrarPartidas(agora, prazo);
  await setSetting(CHAVE_DA_CALIBRACAO, JSON.stringify(resultado));
  return { estado: "feita" as const, aprovada: resultado.aprovada, motivo: resultado.motivo };
}
