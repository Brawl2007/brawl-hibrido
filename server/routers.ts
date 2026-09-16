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
import { getProcessHealth, listSyncJobStates, startSyncJob } from "./syncJobs";
import { probeAllSources } from "./sourceProbe";
import { BRAWL_STARS_API_KEY_SETTING, getStoredApiKey, setSetting } from "./appSettings";
import { probeOfficialApi, setRuntimeApiKey } from "./brawlStarsApi";
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
import { getBrawlPlanetMapTeamBoard } from "@shared/brawlPlanetMapTeams";
import { getSnapshotSynergies } from "@shared/counterSyncSnapshot";
import { brawlScopeSynergyData, normalizeBrawlScopeSynergyList } from "@shared/brawlScopeSynergyData";
import { getBrawlScopeColagemFeita, normalizarVistaBrawlScope, getBrawlScopeMatchupCoverage, getBrawlScopeMatchupMatrix, getPublicCounterSyncSnapshot, getSourceHealth, clearImportedBrawlScope, importBrawlScopePage, limparBloqueio, persistMatchupMatricesNow, syncCounterData } from "./counterSync";
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
        enabled: Boolean(config?.enabled),
        cronExpression: config?.cronExpression ?? "0 0 * * * *",
        lastStatus: config?.lastStatus ?? "idle",
        lastStartedAt: config?.lastStartedAt ?? null,
        lastCompletedAt: config?.lastCompletedAt ?? null,
        lastError: config?.lastError ?? null,
        snapshotVersion: snapshot.version,
        capturedAt: snapshot.capturedAt,
        nextRefreshAt: getNextRefreshAt(snapshot.capturedAt ? new Date(snapshot.capturedAt) : null),
        rowCount: snapshot.rowCount,
        sourceStatus: snapshot.sourceStatus,
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
    refresh: protectedProcedure.mutation(async ({ ctx }) => {
      exigirDono(ctx, "forçar uma atualização");
      return startSyncJob(RANKED_SYNC_JOB, () => syncRankedData("manual"));
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
      return {
        configured: Boolean(key),
        origin,
        // Só os últimos quatro caracteres, para se reconhecer qual é sem a expor.
        hint: key ? `····${key.slice(-4)}` : null,
      };
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
      const [config, snapshot, runs] = await Promise.all([
        getCounterSyncConfig(),
        getPublicCounterSyncSnapshot(),
        listCounterSyncRuns(8),
      ]);
      return {
        enabled: Boolean(config?.enabled),
        cronExpression: config?.cronExpression ?? "0 0 * * * *",
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
    refresh: protectedProcedure.mutation(async ({ ctx }) => {
      exigirDono(ctx, "forçar uma atualização");
      return startSyncJob(COUNTER_SYNC_JOB, () => syncCounterData("manual"));
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
        catch (error) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível confirmar a gravação do grupo. O progresso foi mantido; verifica a base de dados e retoma.", cause: error }); }
      }),
    importCapture: protectedProcedure.input(brawlScopeCaptureSchema)
      .mutation(async ({ ctx, input }) => {
        exigirDono(ctx, "importar um lote");
        await restoreBrawlScopeMatchupMatrices();
        const result = importBrawlScopeCapture(input);
        const persisted = await persistMatchupMatricesNow();
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
        enabled: Boolean(config?.enabled),
        cronExpression: config?.cronExpression ?? "0 5 * * * *",
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
