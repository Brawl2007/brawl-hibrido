/**
 * A idade real dos dados que estão no ecrã.
 *
 * POR QUE ISTO EXISTE
 *
 * A snapshot tinha uma data só — `capturedAt`, a hora em que a sincronização
 * correu. Parecia a resposta à pergunta "isto é de quando?", e não era.
 *
 * O TopBrawl recusa pedidos vindos do alojamento, por isso os números dele
 * entram por capturas feitas no navegador de quem usa o site. A sincronização
 * automática corre uma vez por dia, volta a publicar essas mesmas capturas e
 * carimba-as com a hora de agora. O ecrã dizia "Dados há 2 min" por cima de
 * números lidos no dia anterior — e dados frescos e dados velhos ficavam
 * indistinguíveis, que é a pior forma de os velhos ficarem.
 *
 * A correção é guardar QUANDO CADA FONTE FOI MESMO LIDA e mostrar isso. A
 * sincronização continua a ter a sua hora, porque também interessa saber se ela
 * corre; deixa é de ser apresentada como a idade dos dados.
 */

/** Quando cada fonte da ranqueada foi mesmo lida na origem. */
export type LeituraPorFonte = {
  topBrawl?: string | null;
  brawlPlanet?: string | null;
};

/**
 * A partir de quando uma fonte deixa de merecer confiança silenciosa.
 *
 * A recolha automática corre uma vez por dia. Um dia inteiro sem leitura nova é
 * portanto o normal esperado; dois dias já quer dizer que alguma coisa parou —
 * e é aí que o ecrã tem de o dizer em vez de continuar calado.
 */
export const LIMITE_DE_CONFIANCA_MS = 48 * 60 * 60 * 1000;

function paraMilissegundos(valor: string | null | undefined) {
  if (!valor) return null;
  const tempo = new Date(valor).getTime();
  return Number.isFinite(tempo) ? tempo : null;
}

/**
 * A leitura mais antiga entre as fontes com dados.
 *
 * O mais antigo e não o mais recente: a pergunta que interessa é há quanto
 * tempo alguma coisa do que está no ecrã deixou de ser verificada, e um mapa
 * lido agora não rejuvenesce os outros vinte e cinco.
 */
export function leituraMaisAntiga(fontes: LeituraPorFonte | null | undefined): string | null {
  const tempos = [paraMilissegundos(fontes?.topBrawl), paraMilissegundos(fontes?.brawlPlanet)]
    .filter((tempo): tempo is number => tempo !== null);
  if (!tempos.length) return null;
  return new Date(Math.min(...tempos)).toISOString();
}

/** Idade em linguagem corrente. Sem precisão ao segundo de propósito. */
export function idadeEmPalavras(lidoEm: string | null | undefined, agora = Date.now()): string | null {
  const tempo = paraMilissegundos(lidoEm);
  if (tempo === null) return null;
  const minutos = Math.max(0, Math.round((agora - tempo) / 60_000));
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/** Já passou do limite em que o silêncio deixa de ser honesto? */
export function dadosVelhos(lidoEm: string | null | undefined, agora = Date.now()): boolean {
  const tempo = paraMilissegundos(lidoEm);
  if (tempo === null) return false;
  return agora - tempo > LIMITE_DE_CONFIANCA_MS;
}

/**
 * A frase que o ecrã mostra, já decidida aqui.
 *
 * Fica num sítio só para a interface e o painel não poderem discordar sobre a
 * idade dos mesmos dados — foi assim que a versão anterior chegou a dizer
 * "agora mesmo" sobre dados de ontem.
 */
export function descreverFrescura(fontes: LeituraPorFonte | null | undefined, agora = Date.now()) {
  const lidoEm = leituraMaisAntiga(fontes);
  const idade = idadeEmPalavras(lidoEm, agora);
  return {
    lidoEm,
    idade,
    velho: dadosVelhos(lidoEm, agora),
    /** Sem leitura declarada não se inventa uma: diz-se que não se sabe. */
    rotulo: idade ? `Dados lidos ${idade}` : "Idade dos dados desconhecida",
  };
}

/** Qualidade e meia-vida das partidas oficiais; datas inválidas não ganham peso. */
export function calcularPesoPartidaObservada(
  partida: { battleTimeIso: string; eloMedioRank: "mitico" | "lendario" | "mestre" | "abaixo"; todosNivel11: boolean },
  agoraMs: number = Date.now()
): number {
  const pesoElo =
    partida.eloMedioRank === "mestre"
      ? 3.0
      : partida.eloMedioRank === "lendario"
      ? 1.8
      : partida.eloMedioRank === "mitico"
      ? 1.0
      : 0.35;

  const pesoNivel = partida.todosNivel11 ? 1.0 : 0.15;

  const dataMs = Date.parse(partida.battleTimeIso);
  const diasDecorridos = Number.isFinite(dataMs)
    ? Math.max(0, (agoraMs - dataMs) / (1000 * 60 * 60 * 24))
    : Infinity;
  const decaimentoTemporal = Math.pow(0.5, diasDecorridos / 14);

  return pesoElo * pesoNivel * decaimentoTemporal;
}
