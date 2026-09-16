const $ = id => document.getElementById(id);
let state;
async function action(action, extra = {}) {
  try {
    const result = await chrome.runtime.sendMessage({ action, ...extra });
    if (!result?.ok) throw new Error(result?.error || "Operação indisponível.");
    state = result.state; render(); $("error").textContent = "";
  } catch (error) { $("error").textContent = error.message; }
}
function render() {
  $("status").textContent = state ? `${state.cursor}/${state.urls.length} páginas processadas · ${Object.keys(state.profiles).length} fichas recolhidas · ${Object.keys(state.errors).length} erros. ${state.message}` : "Carrega a fila exportada no site.";
  $("progress").max = state?.urls.length || 1; $("progress").value = state?.cursor || 0;
  $("start").disabled = !state || state.running || state.cursor >= state.urls.length;
  $("pause").disabled = !state?.running; $("retry").disabled = !state || state.running || !Object.keys(state.errors).length;
  $("queue").disabled = !!state?.running;
  $("export").disabled = !state || !Object.keys(state.profiles).length;
  $("errors").textContent = Object.entries(state?.errors || {}).map(([url, error]) => `${url}: ${error}`).join("\n");
}
$("queue").onchange = async event => {
  try {
    if (state && Object.keys(state.profiles).length && !confirm("Exportaste os resultados atuais? Carregar outra fila substitui o progresso local da extensão.")) return;
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 2000000) throw new Error("Fila demasiado grande.");
    await action("load", { queue: JSON.parse(await file.text()) });
  } catch (error) { $("error").textContent = error.message; }
};
for (const name of ["start", "pause", "retry"]) $(name).onclick = () => action(name);
$("export").onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "brawlhibrido-captures-v1", profiles: Object.values(state.profiles), errors: state.errors })], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = "brawlscope-resultados.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes["brawl-v54-queue"]) { state = changes["brawl-v54-queue"].newValue; render(); } });
await action("status");
