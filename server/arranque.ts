import { setRuntimeApiKey, setRuntimeApiVia } from "./brawlStarsApi";
import { ensureAppSettingsTable, getStoredApiKey, getStoredApiVia } from "./appSettings";
import { ensureTables } from "./ensureTables";

/**
 * O trabalho de arranque, feito onde não há arranque.
 *
 * POR QUE ISTO EXISTE
 *
 * Criar as tabelas e carregar a chave da API guardada eram coisas que só o
 * `startLiveSync()` fazia — e o `startLiveSync()` só é chamado pelo servidor
 * de sempre, o `_core/index.ts`. Na Vercel a entrada é outra, o
 * `_core/index.vercel.ts`, e essa nunca o chamou: não há processo que fique de
 * pé, há uma função que acorda para responder a um pedido e volta a dormir.
 *
 * O resultado era silencioso e caro. Uma tabela nova acrescentada ao instalador
 * nunca chegava a ser criada, e a primeira gravação que dela dependesse falhava
 * com um erro de SQL — depois de o site ter subido e de parecer estar bem. Foi
 * o que aconteceu à `brawlscope_captures`.
 *
 * Aqui o mesmo trabalho corre uma vez por instância, à boleia do primeiro
 * pedido que ela atender. É a única altura em que há garantidamente um processo
 * vivo para o fazer.
 */
let arranque: Promise<void> | undefined;

/** Só para os testes. */
export function resetArranqueParaTestes() {
  arranque = undefined;
}

/**
 * Só o que passa pela base de dados precisa do arranque: as rotas `/api/`.
 * A página e os ficheiros do site servem-se sem esperar por ele.
 */
export function precisaDoArranque(caminho: string) {
  return caminho === "/api" || caminho.startsWith("/api/");
}

export function garantirArranque(): Promise<void> {
  if (!arranque) {
    arranque = executar().catch((erro) => {
      // Uma falha não pode ficar memorizada como "já feito": o pedido seguinte
      // tem de poder tentar outra vez. Nada aqui é fatal — sem base de dados o
      // site serve o catálogo do repositório, como sempre fez.
      arranque = undefined;
      console.warn("[Arranque] Preparação adiada para o próximo pedido:", erro);
    });
  }
  return arranque;
}

async function executar() {
  /**
   * As tabelas primeiro. Num alojamento sem terminal não há quem corra
   * `pnpm db:push`, e sem tabelas tudo o que se grave a seguir perde-se.
   */
  await ensureTables().catch((erro) => {
    console.warn("[Arranque] As tabelas não puderam ser garantidas:", erro);
  });

  /**
   * A chave da API oficial pode estar guardada na base de dados, quando não há
   * acesso às variáveis de ambiente do alojamento.
   */
  await ensureAppSettingsTable()
    .then(() => getStoredApiKey())
    .then(({ key, origin }) => {
      setRuntimeApiKey(key || null);
      if (key) console.log(`[Arranque] Chave da API oficial carregada (origem: ${origin}).`);
    })
    // Por onde a chave sai: direto à Supercell ou pelo proxy da RoyaleAPI.
    .then(() => getStoredApiVia())
    .then(({ via }) => setRuntimeApiVia(via))
    .catch(() => undefined);
}
