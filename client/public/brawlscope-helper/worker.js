import { validateQueue } from "./queue.js";
import { captureProfile } from "./capture.js";

const STATE = "brawl-v54-queue";
const ALARM = "brawl-v54-next";
const PAGE_READY_DELAY_MS = 250;
const MAX_PAGE_WAIT_MS = 180000;
const MAX_CAPTURE_RETRIES = 3;

/**
 * O ritmo é por origem, porque as fontes não têm a mesma paciência.
 *
 * 250 ms entre páginas é o que o BrawlScope sempre aguentou. O TopBrawl não:
 * uma corrida a esse ritmo levou com uma verificação à terceira página. Quatro
 * navegações por segundo é um ritmo que nenhum humano tem, e é razoável que a
 * fonte o trate como o que parece.
 *
 * Abrandar não é um truque para não ser apanhado — é pedir menos. Esta extensão
 * não muda IP, não falsifica identificação nem mexe em cookies, e não é para
 * aqui que vai começar. Se a fonte quiser mesmo recusar, recusa, e a recolha
 * para.
 */
const PAUSA_POR_ORIGEM = { "https://topbrawl.com": 1200 };

/**
 * Um intervalo exatamente igual entre pedidos é, ele próprio, uma assinatura de
 * automatismo. O desvio não esconde nada — só evita o padrão perfeito.
 */
const variar = (ms) => Math.round(ms * (1 + Math.random() * 0.4));
const pausaPara = (url) => {
  try { return PAUSA_POR_ORIGEM[new URL(url).origin] ?? PAGE_READY_DELAY_MS; }
  catch { return PAGE_READY_DELAY_MS; }
};

/**
 * Quanto esperar depois de uma verificação, antes de tentar a MESMA página.
 *
 * Antes não se esperava nada: a primeira verificação parava a recolha inteira e
 * ficava à espera de alguém voltar ao computador. Numa fila de 27 páginas, isso
 * significou parar na terceira e não recolher mais nada nessa sessão.
 *
 * Esperar mais a cada vez é o comportamento certo dos dois lados: insiste
 * menos do que insistia e dá tempo real à fonte, em vez de bater outra vez à
 * porta no segundo seguinte. Três tentativas e desiste — a partir daí a recusa
 * é para levar a sério.
 */
const ESPERAS_APOS_BLOQUEIO_MS = [2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000];
const emMinutos = (ms) => Math.round(ms / 60000);
let busy = false;
const read = async () => (await chrome.storage.local.get(STATE))[STATE];
const write = state => chrome.storage.local.set({ [STATE]: state });
let nextTimer;
const schedule = async (atrasoMs = PAGE_READY_DELAY_MS) => {
  clearTimeout(nextTimer);
  // Alarms are a durable watchdog, not the normal page-to-page clock.
  await chrome.alarms.create(ALARM, { when: Date.now() + Math.max(30000, atrasoMs + 15000) });
  nextTimer = setTimeout(() => void tick(), atrasoMs);
};
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== "complete") return;
  void read().then(state => { if (state?.running && state.tabId === tabId) void schedule(); });
});
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") }));

// Exactly one page at a time. Durable state survives worker suspension/restarts.
async function tick() {
  if (busy) return;
  busy = true;
  try {
    let state = await read();
    if (!state?.running) return;

    /**
     * A espera depois de uma verificação é respeitada aqui, e não onde foi
     * decidida — porque há três caminhos que acordam esta função (o alarme, o
     * temporizador e a página acabar de carregar) e qualquer um deles
     * atropelaria a espera se ela não fosse verificada no princípio.
     */
    if (state.esperarAte && Date.now() < state.esperarAte) {
      await chrome.alarms.create(ALARM, { when: state.esperarAte });
      return;
    }
    if (state.esperarAte) { state.esperarAte = 0; await write(state); }

    // Watchdog resumes a suspended worker. It never changes a blocked state.
    await chrome.alarms.create(ALARM, { when: Date.now() + 30000 });
    if (state.cursor >= state.urls.length) { state.running = false; state.message = "Recolha concluída. Exporta os resultados."; await write(state); await chrome.alarms.clear(ALARM); return; }
    const url = state.urls[state.cursor];
    /** O intervalo até à página seguinte, decidido pela origem dela. */
    let proximaPausa = PAGE_READY_DELAY_MS;
    let source;
    if (state.tabId) { try { source = await chrome.tabs.get(state.tabId); } catch { /* manually closed */ } }
    if (!source) {
      source = await chrome.tabs.create({ url, active: false });
      state.tabId = source.id; state.needsNavigation = false; state.waitSince = Date.now(); await write(state); await schedule(); return;
    }
    if (state.needsNavigation) {
      await chrome.tabs.update(source.id, { url });
      const current = await read();
      if (current?.id === state.id) await write({ ...current, needsNavigation: false, waitSince: Date.now() });
      await schedule(); return;
    }
    // Never navigate past a redirect/challenge. Human intervention pauses this queue.
    if (source.status !== "complete") {
      if (Date.now() - state.waitSince > MAX_PAGE_WAIT_MS) { state.running = false; state.message = "Carregamento demorou mais de 3 minutos. Verifica a página antes de retomar."; await write(state); }
      await schedule(); return;
    }
    if (source.url !== url) {
      /**
       * Um endereço que muda a meio já não é sempre a mesma coisa.
       *
       * Esta guarda existe para nunca se passar por cima de um desvio — um
       * desafio, uma página de entrada, um redireccionamento para fora. Isso
       * continua a parar tudo, e deve.
       *
       * Mas apareceu um caso que não é nada disso: um MAPA QUE SAIU DA ROTAÇÃO.
       * O Beach Ball saiu, a fila tinha sido exportada antes de o site saber
       * disso, e a página dele passou a redireccionar. Resultado: a recolha
       * parou aos 22 de 27, com 21 mapas bons já lidos e cinco por ler, por
       * causa de um mapa que já não existe.
       *
       * E isto não é um azar: é o que TEM de acontecer sempre que a rotação
       * muda, porque a fila é exportada antes de a rotação nova ser conhecida.
       * Parar tudo à primeira transforma cada mudança de rotação numa recolha
       * falhada.
       *
       * A distinção é a origem. Dentro do mesmo sítio, é a fonte a dizer que
       * aquela página já não é aquilo — um erro daquela página, e segue-se. Para
       * fora, é outra coisa qualquer, e aí pára-se como sempre.
       */
      let mesmaOrigem = false;
      try { mesmaOrigem = new URL(source.url).origin === new URL(url).origin; } catch { mesmaOrigem = false; }
      if (!mesmaOrigem) {
        state.running = false;
        state.message = `O endereço saiu de ${new URL(url).origin} para ${source.url}. Verifica a página antes de retomar.`;
        await write(state); return;
      }
      state.errors[url] = `A fonte redireccionou para ${source.url} — provavelmente este mapa saiu da rotação. Ignorado; a recolha seguiu.`;
      state.consecutiveErrors = (state.consecutiveErrors || 0) + 1;
      state.pageRetries = 0;
      state.cursor += 1;
      state.needsNavigation = true;
      state.message = state.errors[url];
      // Três seguidos deixa de ser um mapa que saiu e passa a ser outra coisa.
      if (state.consecutiveErrors >= 3) { state.running = false; state.message = "Três páginas seguidas redireccionaram. Verifica a fonte antes de retomar."; }
      await write(state);
      if (!state.running) { await chrome.alarms.clear(ALARM); return; }
      if (state.cursor < state.urls.length) {
        await chrome.tabs.update(source.id, { url: state.urls[state.cursor] });
        const atual = await read();
        if (atual?.id === state.id) await write({ ...atual, needsNavigation: false, waitSince: Date.now(), pageRetries: 0 });
        await schedule(variar(pausaPara(state.urls[state.cursor])));
      } else {
        const atual = await read();
        if (atual?.id === state.id) await write({ ...atual, running: false, message: "Recolha concluída. Exporta os resultados." });
        clearTimeout(nextTimer); await chrome.alarms.clear(ALARM);
      }
      return;
    }
    const [captured] = await chrome.scripting.executeScript({ target: { tabId: source.id }, func: captureProfile });
    const result = captured?.result;
    const latest = await read();
    if (!latest?.running || latest.id !== state.id) return; // pause/cancel won the race
    state = latest;
    if (result?.blocked) {
      /**
       * Uma verificação não é o fim da recolha — é um "agora não".
       *
       * O que NÃO muda: nunca se passa à página seguinte depois de um
       * bloqueio, e nunca se tenta contorná-lo. Espera-se, e tenta-se outra
       * vez a MESMA página, cada vez mais tarde.
       */
      const jaTentadas = state.blocksSeen || 0;
      state.ultimoBloqueio = { url, sinal: result.sinal || null, quando: new Date().toISOString() };
      if (jaTentadas < ESPERAS_APOS_BLOQUEIO_MS.length) {
        const espera = ESPERAS_APOS_BLOQUEIO_MS[jaTentadas];
        state.blocksSeen = jaTentadas + 1;
        state.esperarAte = Date.now() + espera;
        // Voltar a carregar a mesma página quando a espera acabar.
        state.needsNavigation = true;
        state.message = `${result.error} Nova tentativa da mesma página daqui a ${emMinutos(espera)} min (${state.blocksSeen}/${ESPERAS_APOS_BLOQUEIO_MS.length}). Podes deixar o Chrome aberto.`;
        await write(state);
        await chrome.alarms.create(ALARM, { when: state.esperarAte });
        return;
      }
      state.running = false; state.blocksSeen = 0; state.esperarAte = 0;
      state.message = `${result.error} Já esperei ${ESPERAS_APOS_BLOQUEIO_MS.map(emMinutos).join(", ")} minutos e a resposta foi a mesma. Exporta o que já foi recolhido e tenta mais tarde.`;
      await write(state); await chrome.alarms.clear(ALARM); return;
    }
    // Uma leitura boa fecha o assunto: a contagem de bloqueios recomeça.
    if (result?.profile || result?.rankedMap || result?.rankedRotation) state.blocksSeen = 0;
    if (result?.profile) { state.profiles[url] = result.profile; delete state.errors[url]; state.consecutiveErrors = 0; state.pageRetries = 0; }
    /**
     * Um mapa do TopBrawl vem por outro caminho: texto por interpretar, que o
     * servidor lê. Fica guardado à parte das fichas para os dois poderem viajar
     * no mesmo ficheiro sem se confundirem — uma fila pode misturar os dois.
     */
    else if (result?.rankedMap) { state.rankedMaps = { ...(state.rankedMaps || {}), [url]: result.rankedMap }; delete state.errors[url]; state.consecutiveErrors = 0; state.pageRetries = 0; }
    /**
     * O índice da rotação é um só, e por isso não é um dicionário por endereço:
     * a leitura mais recente substitui a anterior. É ele que diz quais são os
     * mapas de agora — sem ele, uma rotação nova passa despercebida.
     */
    else if (result?.rankedRotation) { state.rankedRotation = result.rankedRotation; delete state.errors[url]; state.consecutiveErrors = 0; state.pageRetries = 0; }
    else {
      state.pageRetries = (state.pageRetries || 0) + 1;
      if (state.pageRetries < MAX_CAPTURE_RETRIES) {
        state.message = `Aguardando a tabela… nova tentativa ${state.pageRetries + 1}/${MAX_CAPTURE_RETRIES}.`;
        await write(state); await schedule(); return;
      }
      state.pageRetries = 0;
      state.errors[url] = result?.error || "Não foi possível ler a página.";
      state.consecutiveErrors = (state.consecutiveErrors || 0) + 1;
    }
    state.cursor += 1;
    state.needsNavigation = true;
    state.message = result?.profile ? `Recolhida: ${result.profile.brawler} · ${result.profile.view}`
      : result?.rankedMap ? `Mapa recolhido: ${result.rankedMap.map}`
      : result?.rankedRotation ? "Rotação lida: o site fica a saber os mapas de agora."
      : state.errors[url];
    if (state.consecutiveErrors >= 3) { state.running = false; state.message = "Três páginas sem leitura válida. Verifica o formato ou a disponibilidade antes de retomar."; }
    await write(state);
    if (!state.running) { await chrome.alarms.clear(ALARM); return; }
    if (state.cursor < state.urls.length) {
      const still = await read(); if (!still?.running || still.id !== state.id) return;
      await chrome.tabs.update(source.id, { url: state.urls[state.cursor] });
      // Save only the navigation timer; preserve a concurrent pause.
      const current = await read(); if (current?.id === state.id) await write({ ...current, needsNavigation: false, waitSince: Date.now(), pageRetries: 0 });
      proximaPausa = variar(pausaPara(state.urls[state.cursor]));
    }
    if (state.cursor >= state.urls.length) {
      const current = await read();
      if (current?.id === state.id) await write({ ...current, running: false, message: "Recolha concluída. Exporta os resultados." });
      clearTimeout(nextTimer); await chrome.alarms.clear(ALARM);
    } else await schedule(proximaPausa);
  } catch (error) {
    const state = await read();
    if (state) await write({ ...state, running: false, message: `Pausado: ${error.message}. Exporta o que já foi recolhido.` });
  } finally { busy = false; }
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) void tick(); });
chrome.runtime.onStartup.addListener(async () => {
  const state = await read(); if (state) await write({ ...state, running: false, message: "Navegador reiniciado. Retoma quando quiseres." });
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("panel.html")) return;
  (async () => {
    let state = await read();
    if (message.action === "load") {
      if (busy || state?.running) throw new Error("Pausa a recolha antes de carregar outra fila.");
      const { urls, rejeitados } = validateQueue(message.queue);
      /**
       * Endereços recusados ficam à vista, mas NÃO em `errors`.
       *
       * `errors` é o que o botão de repetição volta a pôr na fila. Um endereço
       * recusado por não ser reconhecido não pode voltar por essa porta — seria
       * transformar a lista de recusados numa forma de contornar a validação, e
       * a extensão acabaria a visitar exatamente o que se recusou a visitar.
       *
       * Ficam num campo só deles, que o painel mostra e a repetição ignora.
       */
      state = {
        id: crypto.randomUUID(), urls, cursor: 0, profiles: {}, rankedMaps: {}, rankedRotation: null,
        errors: {}, rejeitados, running: false,
        message: rejeitados.length
          ? `Fila carregada com ${urls.length} endereços · ${rejeitados.length} não reconhecidos por esta versão. Se forem muitos, atualiza a extensão.`
          : "Fila carregada. Inicia a recolha.",
      };
      await write(state);
    } else if (message.action === "start") {
      if (!state || busy) throw new Error("Aguarda a operação atual ou carrega uma fila.");
      state.running = true; state.consecutiveErrors = 0; state.message = "A recolher…"; await write(state); await schedule();
    } else if (message.action === "pause") {
      clearTimeout(nextTimer);
      if (state) { state.running = false; state.message = "Pausado. Nenhuma nova ficha será iniciada."; await write(state); }
      await chrome.alarms.clear(ALARM);
    } else if (message.action === "retry") {
      if (!state || state.running || busy) throw new Error("Pausa antes de repetir erros.");
      /**
       * A repetição volta a passar pela validação, e não confia na lista.
       *
       * `errors` é escrito a partir do que aconteceu durante a recolha, e um
       * dia pode passar a ser escrito a partir de outra coisa. Revalidar aqui
       * custa nada e garante que esta porta nunca serve para visitar um
       * endereço que a fila recusaria.
       */
      const { urls: paraRepetir } = validateQueue({ format: "brawlhibrido-queue-v1", urls: Object.keys(state.errors) });
      state.urls = paraRepetir; state.errors = {}; state.rejeitados = []; state.cursor = 0; state.tabId = undefined;
      state.message = "Fila de erros preparada. Carrega Iniciar."; await write(state);
    }
    respond({ ok: true, state: await read() });
  })().catch(error => respond({ ok: false, error: error.message }));
  return true;
});
