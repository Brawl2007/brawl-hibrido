import { validateQueue } from "./queue.js";
import { captureProfile } from "./capture.js";

const STATE = "brawl-v54-queue";
const ALARM = "brawl-v54-next";
const PAGE_READY_DELAY_MS = 250;
let busy = false;
const read = async () => (await chrome.storage.local.get(STATE))[STATE];
const write = state => chrome.storage.local.set({ [STATE]: state });
let nextTimer;
const schedule = async () => {
  clearTimeout(nextTimer);
  // Alarms are a durable watchdog, not the normal page-to-page clock.
  await chrome.alarms.create(ALARM, { when: Date.now() + 30000 });
  nextTimer = setTimeout(() => void tick(), PAGE_READY_DELAY_MS);
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
    // Watchdog resumes a suspended worker. It never changes a blocked state.
    await chrome.alarms.create(ALARM, { when: Date.now() + 30000 });
    if (state.cursor >= state.urls.length) { state.running = false; state.message = "Recolha concluída. Exporta os resultados."; await write(state); await chrome.alarms.clear(ALARM); return; }
    const url = state.urls[state.cursor];
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
      if (Date.now() - state.waitSince > 60000) { state.running = false; state.message = "Carregamento demorou mais de 60 segundos. Retoma quando a página estiver pronta."; await write(state); }
      await schedule(); return;
    }
    if (source.url !== url) { state.running = false; state.message = "O endereço mudou. Verifica a página antes de retomar."; await write(state); return; }
    const [captured] = await chrome.scripting.executeScript({ target: { tabId: source.id }, func: captureProfile });
    const result = captured?.result;
    const latest = await read();
    if (!latest?.running || latest.id !== state.id) return; // pause/cancel won the race
    state = latest;
    if (result?.blocked) { state.running = false; state.message = result.error; await write(state); await chrome.alarms.clear(ALARM); return; }
    if (result?.profile) { state.profiles[url] = result.profile; delete state.errors[url]; state.consecutiveErrors = 0; }
    else { state.errors[url] = result?.error || "Não foi possível ler a página."; state.consecutiveErrors = (state.consecutiveErrors || 0) + 1; }
    state.cursor += 1;
    state.needsNavigation = true;
    state.message = result?.profile ? `Recolhida: ${result.profile.brawler} · ${result.profile.view}` : state.errors[url];
    if (state.consecutiveErrors >= 3) { state.running = false; state.message = "Três páginas sem leitura válida. Verifica o formato ou a disponibilidade antes de retomar."; }
    await write(state);
    if (!state.running) { await chrome.alarms.clear(ALARM); return; }
    if (state.cursor < state.urls.length) {
      const still = await read(); if (!still?.running || still.id !== state.id) return;
      await chrome.tabs.update(source.id, { url: state.urls[state.cursor] });
      // Save only the navigation timer; preserve a concurrent pause.
      const current = await read(); if (current?.id === state.id) await write({ ...current, needsNavigation: false, waitSince: Date.now() });
    }
    if (state.cursor >= state.urls.length) {
      const current = await read();
      if (current?.id === state.id) await write({ ...current, running: false, message: "Recolha concluída. Exporta os resultados." });
      clearTimeout(nextTimer); await chrome.alarms.clear(ALARM);
    } else await schedule();
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
      const urls = validateQueue(message.queue);
      state = { id: crypto.randomUUID(), urls, cursor: 0, profiles: {}, errors: {}, running: false, message: "Fila carregada. Inicia a recolha." };
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
      state.urls = Object.keys(state.errors); state.errors = {}; state.cursor = 0; state.tabId = undefined;
      state.message = "Fila de erros preparada. Carrega Iniciar."; await write(state);
    }
    respond({ ok: true, state: await read() });
  })().catch(error => respond({ ok: false, error: error.message }));
  return true;
});
