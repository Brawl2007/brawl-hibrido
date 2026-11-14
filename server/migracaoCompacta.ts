/**
 * A migração das partidas para os pacotes compactos (v182), sem perder nenhuma.
 *
 * ESTADOS (em `app_settings`, lidos SEM cache a cada volta):
 *
 *   legado    — tudo como antes: partidas, ranks e agregados em tabelas próprias.
 *   a_migrar  — a recolha continua a gravar só no histórico antigo; no fim de
 *               cada volta, uma fatia dele é copiada para os pacotes. Quem lê
 *               (Draft, página Partidas) continua a usar o histórico antigo.
 *   compacto  — a cópia acabou e as contagens batem certo. A recolha grava só
 *               nos pacotes e quem lê usa-os. As tabelas antigas ficam
 *               intactas: apagá-las é um passo à parte, só com autorização.
 *
 * Como cada volta é a única a escrever (a base reserva a janela de 15 minutos),
 * a passagem para `compacto` é feita no fim de uma volta, com o histórico antigo
 * parado: não há escritas a meio.
 *
 * Uma volta interrompida a meio de um lote deixa `pendenteAte`: o lote é refeito
 * com deduplicação, para não ficarem partidas em duplicado.
 */
import { diaDaBatalha, diaMenos, inicioDoDia, type BatalhaCompacta } from "@shared/partidasCompactas";
import { getSettingFresh, setSetting } from "./appSettings";
import {
  contarPartidasAntigasDesde,
  contarPartidasEmPacotes,
  gravarEmPacotes,
  lerLoteDasPartidasAntigas,
  maiorIdDasPartidasAntigas,
  type PartidaParaGravar,
} from "./pacotesDePartidas";

export type ArmazenamentoDasPartidas = "legado" | "a_migrar" | "compacto";

export const CHAVE_DO_ARMAZENAMENTO = "armazenamentoDasPartidas";
export const CHAVE_DA_MIGRACAO = "migracaoDasPartidas";
/** Partidas copiadas de cada vez. */
export const LOTE_DA_MIGRACAO = 4_000;
/** Os pacotes guardam o mesmo que o histórico antigo: 30 dias, mais o dia de folga. */
export const DIAS_NOS_PACOTES = 31;

export type EstadoDaMigracao = {
  cursor: number;
  convertidas: number;
  ignoradas: number;
  pendenteAte?: number;
  diferenca?: number;
};

/** Falhas propagam-se: ler um estado errado mandaria partidas para o sítio errado. */
export async function lerArmazenamento(): Promise<ArmazenamentoDasPartidas> {
  const valor = await getSettingFresh(CHAVE_DO_ARMAZENAMENTO);
  return valor === "a_migrar" || valor === "compacto" ? valor : "legado";
}

async function lerMigracao(): Promise<EstadoDaMigracao> {
  try {
    const bruto = JSON.parse((await getSettingFresh(CHAVE_DA_MIGRACAO)) ?? "{}") as Partial<EstadoDaMigracao>;
    return {
      cursor: Number(bruto.cursor) || 0,
      convertidas: Number(bruto.convertidas) || 0,
      ignoradas: Number(bruto.ignoradas) || 0,
      pendenteAte: bruto.pendenteAte ? Number(bruto.pendenteAte) : undefined,
      diferenca: typeof bruto.diferenca === "number" ? bruto.diferenca : undefined,
    };
  } catch {
    return { cursor: 0, convertidas: 0, ignoradas: 0 };
  }
}

const guardarMigracao = (estado: EstadoDaMigracao) => setSetting(CHAVE_DA_MIGRACAO, JSON.stringify(estado));

/** Uma linha do histórico antigo como partida compacta; `null` se as equipas estiverem estragadas. */
export function converterPartidaAntiga(linha: {
  mapId: string; mode: string; battleTime: Date; winningTeam: string; losingTeam: string; rankMedio: number | null; todosNivel11: number | null;
}): PartidaParaGravar | null {
  const nomes = (texto: string) => {
    try {
      const lista: unknown = JSON.parse(texto);
      return Array.isArray(lista) && lista.every((nome) => typeof nome === "string") ? (lista as string[]) : null;
    } catch {
      return null;
    }
  };
  const vencedores = nomes(linha.winningTeam), derrotados = nomes(linha.losingTeam);
  if (!vencedores?.length || !derrotados?.length) return null;
  const batalha: BatalhaCompacta = {
    t: Math.floor(linha.battleTime.getTime() / 1000), vencedores, derrotados,
    rank: linha.rankMedio ?? 0, nivel11: linha.todosNivel11 === 1,
  };
  return { mapId: linha.mapId, mode: linha.mode, batalha };
}

/**
 * Faz avançar a migração dentro do tempo dado. Chamada no fim de cada volta da
 * recolha, e nunca a faz falhar: quem chama regista o erro e segue.
 */
export async function avancarMigracao(agora: Date, prazo: number) {
  let armazenamento = await lerArmazenamento();
  if (armazenamento === "compacto") return { armazenamento, convertidas: 0 };
  if (armazenamento === "legado") {
    await guardarMigracao({ cursor: 0, convertidas: 0, ignoradas: 0 });
    await setSetting(CHAVE_DO_ARMAZENAMENTO, "a_migrar");
    armazenamento = "a_migrar";
  }
  const estado = await lerMigracao();
  const hoje = diaDaBatalha(Math.floor(agora.getTime() / 1000));
  const corte = diaMenos(hoje, DIAS_NOS_PACOTES);
  const teto = await maiorIdDasPartidasAntigas();
  let convertidasNestaVolta = 0;

  while (estado.pendenteAte !== undefined || estado.cursor < teto) {
    if (Date.now() >= prazo) break;
    const recuperar = estado.pendenteAte !== undefined;
    const lote = await lerLoteDasPartidasAntigas(estado.cursor, estado.pendenteAte ?? teto, LOTE_DA_MIGRACAO);
    if (!lote.linhas.length) {
      estado.cursor = estado.pendenteAte ?? teto;
      estado.pendenteAte = undefined;
      await guardarMigracao(estado);
      break;
    }
    estado.pendenteAte = lote.ultimoId;
    await guardarMigracao(estado);
    const partidas: PartidaParaGravar[] = [];
    for (const linha of lote.linhas) {
      const convertida = converterPartidaAntiga(linha);
      if (!convertida) estado.ignoradas += 1;
      else if (diaDaBatalha(convertida.batalha.t) >= corte) partidas.push(convertida);
    }
    await gravarEmPacotes(partidas, recuperar ? "descartar" : "ignorar");
    estado.cursor = lote.ultimoId;
    estado.pendenteAte = undefined;
    estado.convertidas += partidas.length;
    convertidasNestaVolta += partidas.length;
    await guardarMigracao(estado);
  }

  if (estado.cursor < teto || estado.pendenteAte !== undefined) return { armazenamento, convertidas: convertidasNestaVolta, cursor: estado.cursor, teto };

  // Alcançou o fim do histórico antigo: confere antes de passar a compacto.
  const [antigas, empacotadas] = await Promise.all([
    contarPartidasAntigasDesde(new Date(inicioDoDia(corte) * 1000)),
    contarPartidasEmPacotes(),
  ]);
  const diferenca = empacotadas - (antigas - estado.ignoradas);
  if (diferenca !== 0) {
    await guardarMigracao({ ...estado, diferenca });
    return { armazenamento, convertidas: convertidasNestaVolta, cursor: estado.cursor, teto, diferenca };
  }
  await setSetting(CHAVE_DO_ARMAZENAMENTO, "compacto");
  return { armazenamento: "compacto" as const, convertidas: convertidasNestaVolta, cursor: estado.cursor, teto };
}

/** Para o painel de estado: onde vai a migração. */
export async function estadoDaMigracao() {
  const armazenamento = await lerArmazenamento();
  return { armazenamento, ...(armazenamento === "a_migrar" ? await lerMigracao() : {}) };
}
