import { restoreBrawlScopeMatchupMatrices } from "./counterSync";
import { captureBatchSchema, saveCaptureBatch } from "./captureBatch";
import { publishImportedCaptures } from "./counterSync";
import { readDraftRoles, saveDraftRole } from "./draftRoleSettings";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { VERSAO_DO_SITE } from "@shared/version";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { OWNER_LOGIN_OPEN_ID } from "@shared/ownerLogin";
import { checkOwnerPassword, isOwnerPasswordConfigured, isOwnerPasswordStrongEnough } from "./ownerLogin";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { COUNTER_SYNC_JOB, RANKED_SYNC_JOB } from "./syncJobNames";
import { getProcessHealth, listSyncJobStates, startSyncJob, arrancarEEsperar } from "./syncJobs";
import { rankedPaginasSchema, guardarPaginasRanked } from "./rankedImport";
import { RANKED_MAP_SOURCES } from "@shared/rankedMaps";
import { probeAllSources } from "./sourceProbe";
import { BRAWL_STARS_API_KEY_SETTING, BRAWL_STARS_API_VIA_SETTING, getSetting, getStoredApiKey, getStoredApiVia, setSetting } from "./appSettings";
import { IP_DO_PROXY_ROYALEAPI, normalizarCaminhoDaApi, probeOfficialApi, setRuntimeApiKey, setRuntimeApiVia } from "./brawlStarsApi";
import { ErroDoGeneral, guardarChaveDaGemini, lerChaveDaGemini, modelosDaGemini, pedirPlanoAoGeneral, rotularTerrenoComIA, testarChaveDaGemini } from "./generalIA";
import { guardarCorrecoesDeCasas, guardarRotulosDaIA, obterTerreno } from "./terrenoDoMapa";
import { obterCatalogo } from "./catalogoDeBuilds";
import { IDS_DAS_RESERVAS, fornecedorDaChave, fornecedorPorId, guardarChaveDeReserva, lerChavesDeReserva, listaDeFornecedores, modelosDasReservas, testarChaveDeReserva } from "./iaDeReserva";
import { TIPOS_DE_CASA, type TipoDeCasa } from "@shared/terrenoDoMapa";
import {
  addProdigyLink,
  deleteProdigyLink,
  getContextualCounterResolution,
  getCounterSyncConfig,
  getObservedMatchCollectionConfig,
  getObservedMatchCollectionCoverage,
  getObservedMatchupAggregate,
  listObservedMatchCollectionRuns,
  getProdigyLinks,
  getRankedSyncConfig,
  checkDatabase,
  listCounterSyncRuns,
  listRankedSyncRuns,
  ensureRankedSyncConfig,
} from "./db";
import { z } from "zod";
import { brawlScopeCaptureSchema } from "@shared/brawlScopeCapture";
import { importBrawlScopeCapture, getWreqStatus } from "./counterSync";
import { getNextRefreshAt, getPublicRankedSnapshot, syncRankedData } from "./rankedSync";
import { AGENDAMENTO_DA_RECOLHA } from "@shared/agendamento";
import { ROTACAO_GUARDADA_SETTING, lerRotacaoGuardada } from "@shared/rotacaoGuardada";
import { RECOLHA_AUTOMATICA_SETTING, lerRecolhaAutomatica } from "@shared/recolhaAutomatica";
import { getBrawlPlanetMapTeamBoard } from "@shared/brawlPlanetMapTeams";
import { getSnapshotSynergies } from "@shared/counterSyncSnapshot";
import { brawlScopeSynergyData, normalizeBrawlScopeSynergyList } from "@shared/brawlScopeSynergyData";
import { getBrawlScopeColagemFeita, normalizarVistaBrawlScope, getBrawlScopeMatchupCoverage, getBrawlScopeMatchupMatrix, getPublicCounterSyncSnapshot, getSourceHealth, clearImportedBrawlScope, importBrawlScopePage, limparBloqueio, persistMatchupMatricesNow, persistCaptures, syncCounterData } from "./counterSync";
import { fetchOfficialEvents, fetchOfficialRankings, isOfficialApiConfigured } from "./brawlStarsApi";
import { normalizeObservedMode, resolveObservedMapId } from "./observedMatchCollection";


/**
 * Exige que quem chama seja o dono do site.
 *
 * A mensagem antiga era "Apenas o proprietário pode forçar uma atualização." e
 * mais nada — verdadeira e completamente inútil: não dizia quem é o dono, nem
 * como se passa a ser. Quem via aquilo ficava sem saída nenhuma.
 *
 * Agora diz o que falta e o valor exato a configurar.
 */
function exigirDono(ctx: { user: { role: string; openId: string; email: string | null } }, acao: string) {
  if (ctx.user.role === "admin") return;
  const temDonoConfigurado = Boolean((process.env.OWNER_OPEN_ID ?? "").trim() || (process.env.OWNER_EMAIL ?? "").trim());
  throw new TRPCError({
    code: "FORBIDDEN",
    message: temDonoConfigurado
      ? `Só o dono do site pode ${acao}. Esta sessão está como utilizador normal. Para seres reconhecido como dono, define OWNER_OPEN_ID=${ctx.user.openId} nas variáveis de ambiente (ou OWNER_EMAIL=${ctx.user.email ?? "o teu email"}) e volta a entrar.`
      : `Só o dono do site pode ${acao}, e ainda não há nenhum dono definido. Sai e volta a entrar: sem dono configurado, a primeira sessão a entrar fica como dono. Para fixar de vez, define OWNER_OPEN_ID=${ctx.user.openId}.`,
  });
}

export const appRouter = router({
  /**
   * O general por IA (Gemini). Tudo do dono: a chave é dele, e cada plano
   * gasta do limite gratuito dele. Ver `server/generalIA.ts`.
   */
  general: router({
    /**
     * O terreno de um mapa (paredes, mato, água, objetivos), lido da imagem.
     * Público: é informação do mapa, igual para toda a gente, e fica guardado
     * depois da primeira leitura. Só aceita o id numérico.
     */
    terreno: publicProcedure
      .input(z.object({ mapaId: z.string().regex(/^\d{5,9}$/) }))
      .query(({ input }) => obterTerreno(input.mapaId)),
    /** De onde veio a lista de builds e quantos itens tem (sem a lista): para confirmar que chega. */
    catalogo: publicProcedure.query(async () => {
      const catalogo = await obterCatalogo();
      return catalogo
        ? { origem: catalogo.origem, brawlers: Object.keys(catalogo.brawlers).length, engrenagens: catalogo.engrenagens.length, lidoEm: catalogo.lidoEm }
        : null;
    }),
    /** O dono corrige o tipo de um grupo de cor à mão. */
    corrigirTerreno: protectedProcedure
      .input(z.object({ mapaId: z.string().regex(/^\d{5,9}$/), rotulos: z.array(z.object({ id: z.string().max(2), tipo: z.enum(TIPOS_DE_CASA as unknown as [string, ...string[]]) })).max(40) }))
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "corrigir o terreno");
        const terreno = await obterTerreno(input.mapaId);
        if (!terreno) throw new TRPCError({ code: "NOT_FOUND", message: "Não consegui ler o terreno deste mapa." });
        return guardarRotulosDaIA(terreno, input.rotulos);
      }),
    /** O dono corrige casas soltas à mão (um jarro lido como parede, uma parede que faltou). `null` volta ao que a imagem diz. */
    corrigirCasas: protectedProcedure
      .input(z.object({
        mapaId: z.string().regex(/^\d{5,9}$/),
        casas: z.array(z.object({
          coluna: z.number().int().min(0).max(20),
          linha: z.number().int().min(0).max(32),
          tipo: z.enum(TIPOS_DE_CASA as unknown as [string, ...string[]]).nullable(),
        })).min(1).max(60),
      }))
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "corrigir o terreno");
        const terreno = await obterTerreno(input.mapaId);
        if (!terreno) throw new TRPCError({ code: "NOT_FOUND", message: "Não consegui ler o terreno deste mapa." });
        return guardarCorrecoesDeCasas(terreno, input.casas as Array<{ coluna: number; linha: number; tipo: TipoDeCasa | null }>);
      }),
    /** A IA volta a olhar para a imagem e diz o que é cada grupo de cor. */
    rotularTerreno: protectedProcedure
      .input(z.object({ mapaId: z.string().regex(/^\d{5,9}$/) }))
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "pedir à IA para ler o terreno");
        const terreno = await obterTerreno(input.mapaId);
        if (!terreno) throw new TRPCError({ code: "NOT_FOUND", message: "Não consegui ler o terreno deste mapa." });
        try {
          return await rotularTerrenoComIA(terreno);
        } catch (erro) {
          throw new TRPCError({ code: "BAD_REQUEST", message: erro instanceof Error ? erro.message : "A IA falhou." });
        }
      }),
    estado: protectedProcedure.query(async ({ ctx }) => {
      exigirDono(ctx, "ver a chave da IA");
      const { key, origin } = await lerChaveDaGemini();
      const reservas = await lerChavesDeReserva();
      return {
        configured: Boolean(key),
        origin,
        hint: key ? `····${key.slice(-4)}` : null,
        // As IAs de reserva: de quem é cada chave e os últimos quatro caracteres. A chave nunca sai daqui.
        reservas: reservas.map((r) => ({ id: r.fornecedor.id, nome: r.fornecedor.nome, origin: r.origin, hint: `····${r.key.slice(-4)}` })),
        fornecedores: listaDeFornecedores(),
      };
    }),
    /** Os modelos que cada chave tem, para o dono escolher qual faz o plano. Não gasta pedidos de geração. */
    modelos: protectedProcedure.query(async ({ ctx }) => {
      exigirDono(ctx, "ver os modelos da IA");
      const gemini = await modelosDaGemini().catch(() => null);
      const reservas = await modelosDasReservas().catch(() => ({}));
      return { gemini, reservas };
    }),
    guardarChaveDeReserva: protectedProcedure
      .input(z.object({ fornecedor: z.enum(["auto", ...IDS_DAS_RESERVAS]).default("auto"), key: z.string().trim().max(256) }))
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "guardar a chave da IA de reserva");
        const pelaForma = input.key ? fornecedorDaChave(input.key) : null;
        if (input.fornecedor === "auto" && !input.key) return { saved: false, test: { ok: false, reason: "Diz de que IA é a chave a apagar." } };
        if (input.fornecedor === "auto" && !pelaForma) {
          return { saved: false, test: { ok: false, reason: "Não reconheço esta chave pela forma. Escolhe de que IA é (Mistral e Requesty não têm forma própria)." } };
        }
        // Uma chave com a forma de outra IA foi colada no sítio errado.
        if (input.fornecedor !== "auto" && pelaForma && pelaForma.id !== input.fornecedor) {
          return { saved: false, test: { ok: false, reason: `Esta chave parece da ${pelaForma.nome}, não da ${fornecedorPorId(input.fornecedor).nome}.` } };
        }
        if (input.key && (input.key.length < 20 || /\s/.test(input.key))) return { saved: false, test: { ok: false, reason: "Esta chave não parece completa." } };
        const id = input.fornecedor === "auto" ? pelaForma!.id : input.fornecedor;
        await guardarChaveDeReserva(id, input.key || null);
        return { saved: Boolean(input.key), fornecedor: id, test: input.key ? await testarChaveDeReserva(id) : { ok: false, reason: "Chave apagada." } };
      }),
    guardarChave: protectedProcedure
      .input(z.object({ key: z.string().trim().max(256) }))
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "guardar a chave da IA");
        await guardarChaveDaGemini(input.key || null);
        return { saved: Boolean(input.key), test: input.key ? await testarChaveDaGemini() : { ok: false, reason: "Chave apagada." } };
      }),
    pedirPlano: protectedProcedure
      .input(z.object({
        mapa: z.string().trim().min(1).max(80),
        modoId: z.string().trim().max(40),
        mapaId: z.string().regex(/^\d{5,9}$/).nullish(),
        nossos: z.array(z.object({ brawler: z.string().trim().min(1).max(40), funcao: z.string().trim().max(20) })).min(1).max(5),
        deles: z.array(z.object({ brawler: z.string().trim().min(1).max(40), funcao: z.string().trim().max(20) })).max(5),
        duelos: z.array(z.object({ nosso: z.string().trim().max(40), deles: z.string().trim().max(40), vantagem: z.number().min(0).max(100) })).max(5),
        nosNome: z.string().trim().max(20),
        numeros: z.array(z.object({ brawler: z.string().trim().max(40), lado: z.enum(["nos", "eles"]), vitoria: z.number().min(0).max(100).nullable(), uso: z.number().min(0).max(100).nullable() })).max(10).optional(),
        dadosDe: z.string().max(40).nullish(),
        elo: z.string().max(20).nullish(),
        // Qual IA faz o plano. Os modelos só valem se estiverem na lista da chave (o servidor confere).
        ia: z.object({
          rapido: z.boolean().optional(),
          principal: z.enum(["gemini", "reserva", ...IDS_DAS_RESERVAS]).nullish(),
          soEssa: z.boolean().optional(),
          modelos: z.record(z.string().max(20), z.string().trim().max(160).nullable()).optional(),
          // A forma antiga, de um separador aberto antes da mudança.
          ordem: z.enum(["gemini-primeiro", "reserva-primeiro", "so-gemini", "so-reserva"]).optional(),
          modeloGemini: z.string().trim().max(80).nullish(),
          modeloReserva: z.string().trim().max(160).nullish(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "pedir um plano à IA");
        const { ia, ...pedido } = input;
        try {
          return await pedirPlanoAoGeneral(pedido, fetch, ia ?? {});
        } catch (erro) {
          const mensagem = erro instanceof ErroDoGeneral || erro instanceof Error ? erro.message : "A IA falhou.";
          throw new TRPCError({ code: erro instanceof ErroDoGeneral ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR", message: mensagem });
        }
      }),
  }),
  draftRoles: router({
    list: publicProcedure.query(() => readDraftRoles()),
    set: protectedProcedure.input(z.object({ brawler: z.string().trim().min(1).max(80), role: z.enum(["mid", "side", "flex"]).nullable() })).mutation(({ ctx, input }) => {
      exigirDono(ctx, "alterar funções dos brawlers");
      return saveDraftRole(input.brawler, input.role);
    }),
  }),
  brawlApi: router({
    events: publicProcedure.query(async () => {
      const events = await fetchOfficialEvents();
      return {
        events,
        source: events.length > 0 ? "official_api" : "fallback",
        fetchedAt: new Date().toISOString(),
      };
    }),
    rankings: publicProcedure.query(async () => {
      const rankings = await fetchOfficialRankings("global", "brawlers");
      return {
        rankings,
        source: rankings.length > 0 ? "official_api" : "fallback",
        fetchedAt: new Date().toISOString(),
      };
    }),
  }),
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    /**
     * O formulário de entrada precisa de saber se há palavra-passe definida.
     *
     * Sem isto, quem publica o site numa casa nova e se esquece da variável vê
     * apenas "palavra-passe errada" e não faz ideia porquê — a palavra-passe
     * não estava errada, não existia. Não revela nada útil a estranhos: que um
     * site tem ou não tem dono configurado não ajuda ninguém a entrar.
     */
    ownerLoginState: publicProcedure.query(() => ({
      configured: isOwnerPasswordConfigured(),
      strongEnough: isOwnerPasswordStrongEnough(),
      alreadySignedIn: false,
    })),
    ownerLogin: publicProcedure
      .input(z.object({ password: z.string().max(200) }))
      .mutation(async ({ ctx, input }) => {
        const veredito = checkOwnerPassword(input.password);
        if (!veredito.ok) {
          const mensagens: Record<string, string> = {
            "not-configured": "Este site ainda não tem palavra-passe de dono. Define OWNER_PASSWORD no alojamento e reinicia.",
            "too-short": "A palavra-passe definida no alojamento é curta de mais. Usa pelo menos 8 caracteres.",
            wrong: "Palavra-passe errada.",
            locked: `Demasiadas tentativas. Tenta outra vez daqui a ${Math.ceil((veredito.retryAfterMs ?? 0) / 60000)} minuto(s).`,
          };
          throw new TRPCError({
            code: veredito.reason === "wrong" || veredito.reason === "locked" ? "UNAUTHORIZED" : "PRECONDITION_FAILED",
            message: mensagens[veredito.reason],
          });
        }

        // Password and signed session authenticate the owner independently of MySQL.
        const sessionToken = await sdk.signSession(
          { openId: OWNER_LOGIN_OPEN_ID, appId: "brawl-hibrido", name: "Dono" },
          { expiresInMs: ONE_YEAR_MS },
        );
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true as const, isOwner: true };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  rankedSync: router({
    snapshot: publicProcedure.query(async () => {
      await ensureRankedSyncConfig();
      const snapshot = await getPublicRankedSnapshot();
      return {
        ...snapshot,
        nextRefreshAt: getNextRefreshAt(snapshot.capturedAt ? new Date(snapshot.capturedAt) : null),
      };
    }),
    status: publicProcedure.query(async () => {
      await ensureRankedSyncConfig();
      const [config, snapshot, runs] = await Promise.all([
        getRankedSyncConfig(),
        getPublicRankedSnapshot(),
        listRankedSyncRuns(8),
      ]);
      return {
        /**
         * O agendamento a sério, e não a coluna morta da base. Ver
         * `shared/agendamento.ts`: o que está na base sobrou da plataforma
         * anterior e não manda em nada.
         */
        agendamento: AGENDAMENTO_DA_RECOLHA,
        lastStatus: config?.lastStatus ?? "idle",
        lastStartedAt: config?.lastStartedAt ?? null,
        lastCompletedAt: config?.lastCompletedAt ?? null,
        lastError: config?.lastError ?? null,
        snapshotVersion: snapshot.version,
        capturedAt: snapshot.capturedAt,
        nextRefreshAt: getNextRefreshAt(snapshot.capturedAt ? new Date(snapshot.capturedAt) : null),
        rowCount: snapshot.rowCount,
        sourceStatus: snapshot.sourceStatus,
        /**
         * Quando cada fonte foi mesmo lida — que não é `capturedAt`, a hora a
         * que esta sincronização correu. Ver `shared/idadeDosDados.ts`.
         */
        sourceReadAt: snapshot.sourceReadAt,
        /**
         * O que a recolha AUTOMÁTICA fez da última vez.
         *
         * `runs` mostra execuções, mas não distingue o que morreu do que nunca
         * escreveu o fim: uma recolha morta a meio fica lá como "a correr". Ver
         * `shared/recolhaAutomatica.ts` — foi assim que a falha das 05:00
         * passou um dia inteiro sem ninguém saber.
         */
        ultimaRecolhaAutomatica: lerRecolhaAutomatica(await getSetting(RECOLHA_AUTOMATICA_SETTING)),
        runs,
      };
    }),
    /**
     * Quadro literal do Brawl Planet: as dez composições de três brawlers
     * publicadas para o mapa Ranked pedido. Sem `map`, devolve o quadro de cada
     * mapa presente na snapshot. Nenhuma equipa é inferida.
     */
    mapTeams: publicProcedure
      .input(z.object({ map: z.string().trim().min(1).max(120).optional() }).optional())
      .query(async ({ input }) => {
        const snapshot = await getPublicRankedSnapshot();
        const teams = snapshot.payload?.mapTeams ?? [];
        const mapNames = input?.map
          ? [input.map]
          : Array.from(new Set(teams.map((team) => team.map)));
        return {
          capturedAt: snapshot.capturedAt,
          sourceStatus: snapshot.sourceStatus,
          maps: mapNames.map((map) => ({
            map,
            teams: getBrawlPlanetMapTeamBoard(teams, map),
          })),
        };
      }),
    /**
     * Arranca a sincronização e responde já.
     *
     * Não espera pelo fim de propósito. Uma recolha manual completa leva
     * minutos; à espera dela, o pedido morria no gateway e o botão ficava a
     * girar para sempre. O progresso lê-se em `syncJobs.state`.
     */
    /**
     * A rotação Ranked cabe num pedido, por isso é esperada.
     *
     * São cerca de vinte páginas com duas em paralelo. Esperar por elas faz o
     * botão dizer a verdade: quando responde, está feito. Antes respondia já e
     * o trabalho ficava congelado com a instância, que é como quem diz, o botão
     * anunciava uma atualização que muitas vezes não acontecia.
     */
    refresh: protectedProcedure.mutation(async ({ ctx }) => {
      exigirDono(ctx, "forçar uma atualização");
      return arrancarEEsperar(RANKED_SYNC_JOB, () => syncRankedData("manual"));
    }),

    /**
     * A fila de mapas para a extensão percorrer.
     *
     * O `topbrawl.com` responde 403 a pedidos vindos daqui — e das outras redes
     * de nuvem que foram testadas. As páginas abrem no navegador de quem usa o
     * site, e é de lá que passam a ser lidas.
     */
    filaDeMapas: protectedProcedure.query(async ({ ctx }) => {
      exigirDono(ctx, "exportar a fila de mapas");
      /**
       * A fila sai da rotação LIDA, e não da lista escrita à mão.
       *
       * Enquanto saía da lista do projeto, uma rotação nova não chegava aqui:
       * a extensão continuava a recolher os mapas que já tinham saído e nunca
       * pedia os que entraram. E como o índice do TopBrawl responde 403 ao
       * site, isso não se corrige sozinho — só quando alguém editasse a lista.
       */
      const guardada = lerRotacaoGuardada(await getSetting(ROTACAO_GUARDADA_SETTING));
      const mapas = guardada?.maps.map((mapa) => mapa.id)
        ?? RANKED_MAP_SOURCES.map(([, id]) => id);
      return {
        format: "brawlhibrido-queue-v1" as const,
        /**
         * O índice vai à frente, e vai SEMPRE.
         *
         * É a página que diz quais são os mapas de agora. Pô-la em cada
         * passagem é o que tira esta atualização do calendário de alguém: a
         * rotação seguinte entra na fila seguinte, sem ninguém publicar nada.
         */
        urls: [
          "https://topbrawl.com/rankeds",
          ...mapas.map((id) => `https://topbrawl.com/rankeds/${id}?rows=106`),
        ],
        /** De onde veio esta lista, para o ecrã o poder dizer. */
        rotacao: guardada
          ? { origem: "extensao" as const, mapas: guardada.maps.length, lidaEm: guardada.capturedAt }
          : { origem: "projeto" as const, mapas: RANKED_MAP_SOURCES.length, lidaEm: null },
      };
    }),

    /**
     * Recebe as páginas lidas pela extensão. O texto vem por interpretar: há um
     * interpretador só, e é o do servidor. Ver `server/rankedImport.ts`.
     */
    importarPaginas: protectedProcedure.input(rankedPaginasSchema)
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "importar mapas do TopBrawl");
        try { return await guardarPaginasRanked(input); }
        catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Não foi possível guardar os mapas.",
            cause: error,
          });
        }
      }),
  }),
  syncJobs: router({
    /** Estado das sincronizações em segundo plano; é isto que move o botão. */
    state: publicProcedure.query(() => ({
      ...listSyncJobStates([RANKED_SYNC_JOB, COUNTER_SYNC_JOB]),
      /**
       * Saúde do processo junto ao estado dos trabalhos. Um tempo de vida que
       * nunca passa de segundos significa que o servidor está a reiniciar em
       * ciclo — que é o que se vê como "Service Unavailable" no site.
       */
      __process: getProcessHealth(),
    })),
    /**
     * Estado da base de dados.
     *
     * Uma instalação nova sem `pnpm db:push` tem as tabelas por criar, e o que
     * se via era "Failed query: select ... from ranked_sync_config" — uma
     * mensagem que não diz a ninguém o que fazer. Isto diz.
     */
    database: publicProcedure.query(() => checkDatabase()),
    /**
     * Estado da chave da API oficial, sem nunca a devolver.
     *
     * Mostra só se existe e de onde vem. Um segredo que a interface consegue
     * ler é um segredo que sai pelo primeiro ecrã partilhado.
     */
    apiKeyState: protectedProcedure.query(async ({ ctx }) => {
      exigirDono(ctx, "ver o estado da chave");
      const { key, origin } = await getStoredApiKey();
      const { via, origin: viaOrigin } = await getStoredApiVia();
      return {
        configured: Boolean(key),
        origin,
        // Só os últimos quatro caracteres, para se reconhecer qual é sem a expor.
        hint: key ? `····${key.slice(-4)}` : null,
        via: normalizarCaminhoDaApi(via),
        viaOrigin,
        proxyIp: IP_DO_PROXY_ROYALEAPI,
      };
    }),
    /**
     * Liga ou desliga o proxy da RoyaleAPI e testa logo a chave pelo novo caminho.
     *
     * Na Vercel o IP de saída muda a cada pedido e a Supercell recusa a chave;
     * pelo proxy os pedidos saem sempre do mesmo IP. Ver `URL_PROXY_ROYALEAPI`.
     */
    setApiVia: protectedProcedure
      .input(z.object({ via: z.enum(["oficial", "royaleapi"]) }))
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "mudar o caminho da API oficial");
        await setSetting(BRAWL_STARS_API_VIA_SETTING, input.via);
        setRuntimeApiVia(input.via);
        const teste = await probeOfficialApi();
        return { via: input.via, test: teste };
      }),
    /**
     * Guarda a chave na base de dados e testa-a de imediato.
     *
     * Existe porque a variável de ambiente deixou de ser alcançável: sem acesso
     * à plataforma de alojamento, o site ficava impossível de configurar mesmo
     * com o dono à frente dele. Testar logo a seguir a gravar evita o pior
     * cenário — guardar uma chave errada e só descobrir daí a quinze minutos.
     */
    setApiKey: protectedProcedure
      .input(z.object({ key: z.string().trim().max(512) }))
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "definir a chave da API oficial");
        const limpa = input.key.trim();
        await setSetting(BRAWL_STARS_API_KEY_SETTING, limpa || null);
        setRuntimeApiKey(limpa || null);
        const teste = await probeOfficialApi();
        return { saved: Boolean(limpa), test: teste };
      }),
    /**
     * Diagnóstico: descarrega UMA página de cada fonte e diz o que o parser
     * conseguiu extrair. Protegido porque faz pedidos externos, e limitado a
     * uma página por fonte precisamente para não poder ser usado como recolha.
     */
    probe: protectedProcedure.mutation(async ({ ctx }) => {
      exigirDono(ctx, "correr o diagnóstico");
      return probeAllSources();
    }),
    /**
     * Esquece o recuo acumulado das origens.
     *
     * Sem isto, uma correção só podia ser confirmada esperando pelo fim do
     * bloqueio — e o bloqueio crescia a cada tentativa falhada. Limpar é o que
     * torna possível mudar uma configuração e testar já a seguir.
     */
    clearBackoff: protectedProcedure
      .input(z.object({ host: z.string().trim().min(1).max(120).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "limpar o recuo das fontes");
        return { cleared: limparBloqueio(input?.host) };
      }),
  }),
  counterSync: router({
    snapshot: publicProcedure.query(async () => {
      return (await getPublicCounterSyncSnapshot()) ?? null;
    }),
    /**
     * Matriz completa de matchups de uma vista ("overall" ou um modo), tal como
     * a sincronização a leu das fichas públicas. Fica de fora do evento SSE por
     * ser grande; o cliente pede a vista que está a usar e guarda-a em cache.
     */
    /**
     * Que fichas já foram coladas, por vista. Ver `getBrawlScopeColagemFeita`:
     * é o que permite ao site dizer qual é a próxima em vez de deixar a
     * contabilidade à memória de quem está a colar.
     */
    /**
     * Duas coisas com nomes próprios, e de propósito.
     *
     * Isto já devolveu `views: <nomes colados>` e logo a seguir espalhava a
     * cobertura, que traz um `views` seu — com contagens, não com nomes. O
     * segundo apagava o primeiro em silêncio, e o ecrã rebentava a tentar
     * percorrer uma lista que afinal era `{ profiles, pairs }`.
     *
     * Cada uma no seu campo: não há nada que se sobreponha a nada.
     */
    colagemFeita: publicProcedure.query(async () => {
      await restoreBrawlScopeMatchupMatrices();
      return {
        feitas: getBrawlScopeColagemFeita(),
        cobertura: getBrawlScopeMatchupCoverage(),
      };
    }),
    matchups: publicProcedure
      .input(z.object({ view: z.string().trim().min(1).max(32).optional() }).optional())
      .query(async ({ input }) => {
        await restoreBrawlScopeMatchupMatrices();
        // Devolve-se a vista JÁ normalizada: é com esta chave que o cliente
        // guarda a matriz, e é por esta que depois a procura.
        const view = normalizarVistaBrawlScope(input?.view ?? "overall");
        const matrix = getBrawlScopeMatchupMatrix(view) ?? null;
        return {
          view,
          ...getBrawlScopeMatchupCoverage(),
          matrix,
        };
      }),
    /**
     * Top 10 literal de sinergia ("Pair with") do BrawlScope para um brawler.
     * A leitura live tem prioridade; o catálogo estático responde apenas quando
     * a snapshot ainda não publicou listas para esse titular. Uma resposta vazia
     * significa "a fonte não publicou", nunca "não há sinergia".
     */
    synergy: publicProcedure
      .input(z.object({
        brawler: z.string().trim().min(1).max(64),
        modeId: z.string().trim().min(1).max(64).nullable().optional(),
      }))
      .query(async ({ input }) => {
        const snapshot = await getPublicCounterSyncSnapshot();
        const modeId = input.modeId ?? undefined;
        const live = getSnapshotSynergies(snapshot?.payload, input.brawler, "brawlscope", modeId);
        if (live.length) {
          return {
            brawler: input.brawler,
            modeId: live[0].modeId ?? null,
            origin: "live" as const,
            capturedAt: snapshot?.capturedAt ?? null,
            teammates: live.map((entry) => ({ brawler: entry.teammate, delta: entry.delta ?? null, rank: entry.rank, sourceUrl: entry.sourceUrl })),
          };
        }

        const staticKey = Object.keys(brawlScopeSynergyData).find((key) =>
          key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") === input.brawler.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""),
        );
        const entry = staticKey ? brawlScopeSynergyData[staticKey] : undefined;
        return {
          brawler: input.brawler,
          modeId: null,
          origin: entry ? ("static" as const) : ("none" as const),
          capturedAt: snapshot?.capturedAt ?? null,
          teammates: entry
            ? normalizeBrawlScopeSynergyList(entry.teammates, entry.brawler).map((teammate, index) => ({
                brawler: teammate.brawler,
                delta: teammate.delta ?? null,
                rank: index + 1,
                sourceUrl: entry.sourceUrl,
              }))
            : [],
        };
      }),

    status: publicProcedure.query(async () => {
      await restoreBrawlScopeMatchupMatrices();
      const [config, snapshot, runs] = await Promise.all([
        getCounterSyncConfig(),
        getPublicCounterSyncSnapshot(),
        listCounterSyncRuns(8),
      ]);
      return {
        /**
         * O agendamento a sério, e não a coluna morta da base. Ver
         * `shared/agendamento.ts`: o que está na base sobrou da plataforma
         * anterior e não manda em nada.
         */
        agendamento: AGENDAMENTO_DA_RECOLHA,
        lastStatus: config?.lastStatus ?? "idle",
        lastStartedAt: config?.lastStartedAt ?? null,
        lastCompletedAt: config?.lastCompletedAt ?? null,
        lastError: config?.lastError ?? null,
        snapshotVersion: snapshot?.version ?? null,
        capturedAt: snapshot?.capturedAt ?? null,
        relationCount: snapshot?.relationCount ?? 0,
        sourceStatus: snapshot?.payload.sourceStates ?? null,
        /**
         * A versão que está mesmo a correr.
         *
         * Publicar aqui é uma questão de diagnóstico: o número aparece no canto
         * do ecrã, mas o canto do ecrã não se lê de fora. Sem isto, responder a
         * "isto já é a versão nova?" obrigava a pedir a quem está ao computador
         * que fosse olhar — e uma resposta errada aí manda corrigir outra vez
         * uma coisa que já estava corrigida.
         */
        versao: VERSAO_DO_SITE,
        /** Qual cliente HTTP está de facto a fazer os pedidos ao BrawlScope. */
        wreq: getWreqStatus(),
        /** Saúde das origens públicas: bloqueios, 429 e falhas consecutivas. */
        sourceHealth: getSourceHealth(),
        matchupCoverage: getBrawlScopeMatchupCoverage(),
        runs,
      };
    }),
    /**
     * Os counters NÃO cabem num pedido, e isso é dito em vez de escondido.
     *
     * Só o Brawl Planet são mais de cem fichas, espaçadas para não abusar da
     * fonte; com o PL Prodigy e o Brawl Calculator são minutos. Nenhuma função
     * vive tanto tempo.
     *
     * Espera-se à mesma pelo orçamento, porque o que couber fica feito de
     * verdade — antes o trabalho parava no instante da resposta. O que sobra
     * fica assinalado em `concluido: false`, e quem chama mostra isso a quem
     * carregou no botão, em vez de anunciar uma atualização que não aconteceu.
     */
    refresh: protectedProcedure.mutation(async ({ ctx }) => {
      exigirDono(ctx, "forçar uma atualização");
      return arrancarEEsperar(COUNTER_SYNC_JOB, () => syncCounterData("manual"));
    }),
    /**
     * Importa uma ficha do BrawlScope colada à mão.
     *
     * A recolha automática desta fonte acabou — responde 403 a este servidor e
     * quem a mantém não respondeu ao contacto. Não é contornada por trás. Mas as
     * páginas são públicas e abrem no navegador de qualquer pessoa: quando o
     * dono do site copia uma e a cola aqui, não há automatismo nenhum a bater à
     * porta deles.
     *
     * Grava logo na snapshot em vez de esperar pelo ciclo: perder uma colagem
     * manual num reinício é muito pior do que perder uma recolha automática,
     * que se repete sozinha.
     */
    importCapturesBatch: protectedProcedure.input(captureBatchSchema)
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "importar um lote");
        try { return await saveCaptureBatch(input); }
        // Os grupos já confirmados estão gravados, cada um nas suas linhas. Só
        // este ficou por gravar, e retomar daqui repete-o sem duplicar nada.
        catch (error) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Este grupo não ficou gravado. Os grupos anteriores estão confirmados; carrega em Retomar importação para repetir a partir deste.", cause: error }); }
      }),
    importCapture: protectedProcedure.input(brawlScopeCaptureSchema)
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "importar um lote");
        await restoreBrawlScopeMatchupMatrices();
        const result = importBrawlScopeCapture(input);
        // A ficha tem linha própria, como as do lote. Não se reescreve a
        // snapshot inteira para guardar uma ficha.
        const persisted = await persistCaptures([input]);
        if (!persisted.saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ficha apenas em memória. Persistência falhou; retoma o lote quando a base de dados estiver disponível." });
        return { ...result, persisted: true };
      }),
    publishCaptures: protectedProcedure.mutation(async ({ ctx }) => {
      exigirDono(ctx, "publicar as fichas importadas");
      try { return await publishImportedCaptures(); }
      catch (error) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Publicação não confirmada. As fichas importadas permanecem guardadas; verifica a base e tenta publicar novamente.", cause: error }); }
    }),
    importPage: protectedProcedure
      .input(z.object({
        html: z.string().min(1).max(4_000_000),
        view: z.string().trim().max(32).optional(),
        url: z.string().trim().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "importar uma ficha");
        await restoreBrawlScopeMatchupMatrices();
        const resultado = importBrawlScopePage(input.html, { view: input.view || undefined, url: input.url || undefined });
        if (!resultado.ok) return { ...resultado, persisted: false, coverage: getBrawlScopeMatchupCoverage() };
        const gravacao = await persistMatchupMatricesNow().catch(() => ({ saved: false as const }));

        /**
         * A ficha colada entra na matriz de imediato — é de lá que saem as
         * percentagens de cada confronto. As LISTAS de counters do perfil não:
         * essas vêm da snapshot publicada, e a snapshot só é refeita quando
         * corre um ciclo de recolha.
         *
         * O resultado era desconcertante de propósito nenhum: quem colava via
         * "105 confrontos lidos", via os números certos no Draft, e no perfil do
         * brawler continuava a ver as listas antigas — durante até quinze
         * minutos, ou para sempre se o site reiniciasse pelo meio.
         *
         * Refazer a snapshot aqui resolve isso. Não vai buscar nada ao
         * BrawlScope (está bloqueado, e o ciclo sabe disso): junta o que já está
         * em memória, incluindo esta ficha. Corre em segundo plano para a
         * resposta não ficar à espera, e arrancar duas vezes seguidas não faz
         * duas recolhas — o trabalho em curso absorve a segunda.
         */
        const publicacao = startSyncJob(COUNTER_SYNC_JOB, () => syncCounterData("manual"));

        return {
          ...resultado,
          persisted: gravacao.saved,
          republishing: publicacao.started,
          coverage: getBrawlScopeMatchupCoverage(),
        };
      }),
    /**
     * Apaga fichas coladas, de uma vista ou de todas.
     *
     * Colar a ficha errada, ou no modo errado, tem de ter volta — sem isso, um
     * engano fica lá até alguém reiniciar o servidor com sorte.
     */
    clearImported: protectedProcedure
      .input(z.object({ view: z.string().trim().max(32).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "apagar fichas coladas");
        const apagado = clearImportedBrawlScope(input?.view || undefined);
        const gravacao = await persistMatchupMatricesNow().catch(() => ({ saved: false as const }));
        return { ...apagado, persisted: gravacao.saved, coverage: getBrawlScopeMatchupCoverage() };
      }),
  }),
  counterRelations: router({
    resolve: publicProcedure
      .input(z.object({
        attacker: z.string().trim().min(1).max(64),
        defender: z.string().trim().min(1).max(64),
        mapId: z.string().trim().min(1).max(128).nullable().optional(),
        mode: z.string().trim().min(1).max(64).nullable().optional(),
      }))
      .query(async ({ input }) => {
        return getContextualCounterResolution(input);
      }),
  }),
  observedMatches: router({
    status: publicProcedure.query(async () => {
      const [config, coverage, runs] = await Promise.all([
        getObservedMatchCollectionConfig(),
        getObservedMatchCollectionCoverage(),
        listObservedMatchCollectionRuns(5),
      ]);
      return {
        /**
         * O agendamento a sério, e não a coluna morta da base. Ver
         * `shared/agendamento.ts`: o que está na base sobrou da plataforma
         * anterior e não manda em nada.
         */
        agendamento: AGENDAMENTO_DA_RECOLHA,
        lastStatus: config?.lastStatus ?? "idle",
        lastCompletedAt: config?.lastCompletedAt ?? null,
        lastError: config?.lastError ?? null,
        coverage,
        runs,
        /**
         * Sem chave da API oficial não há batalhas nenhumas para recolher — e
         * uma tabela vazia por falta de chave é indistinguível de uma tabela
         * vazia por falta de jogos. Dizê-lo evita a pergunta.
         */
        officialApiConfigured: isOfficialApiConfigured(),
      };
    }),
    matchup: publicProcedure
      .input(z.object({
        mapName: z.string().trim().min(1).max(128),
        modeId: z.string().trim().min(1).max(64),
        brawler: z.string().trim().min(1).max(64),
        opponent: z.string().trim().min(1).max(64),
      }))
      .query(async ({ input }) => {
        const mapId = resolveObservedMapId(input.mapName);
        if (!mapId) return { found: false as const, samples: 0, winRate: null, mapId: null };
        const aggregate = await getObservedMatchupAggregate({
          mapId,
          mode: normalizeObservedMode(input.modeId),
          brawler: input.brawler,
          opponent: input.opponent,
        });
        const samples = aggregate?.samples ?? 0;
        return {
          found: Boolean(aggregate && samples > 0),
          mapId,
          samples,
          wins: aggregate?.wins ?? 0,
          losses: aggregate?.losses ?? 0,
          winRate: samples > 0 ? Number(((aggregate?.wins ?? 0) / samples * 100).toFixed(1)) : null,
        };
      }),
  }),
  prodigyGuides: router({
    list: publicProcedure.query(async () => {
      return getProdigyLinks();
    }),
    add: protectedProcedure
      .input(
        z.object({
          brawlerName: z.string().min(1, "Nome do brawler obrigatório"),
          url: z.string().url("URL de guia inválido"),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return addProdigyLink(input);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return deleteProdigyLink(input.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
