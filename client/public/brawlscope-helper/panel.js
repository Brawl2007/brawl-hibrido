const $ = id => document.getElementById(id);
let state;
async function action(action, extra = {}) {
  try {
    const result = await chrome.runtime.sendMessage({ action, ...extra });
    if (!result?.ok) throw new Error(result?.error || "Operação indisponível.");
    state = result.state; render(); $("error").textContent = "";
  } catch (error) { $("error").textContent = error.message; }
}
/**
 * A versão vem do manifesto, e não de um número escrito à mão.
 *
 * O cabeçalho dizia "v61" enquanto o manifesto já ia na 95. Quem seguisse a
 * instrução "confirma que diz v95" olhava para aqui, via v61 e concluía que a
 * atualização tinha falhado — quando podia estar certa. Um número escrito à mão
 * em dois sítios acaba sempre por discordar de si próprio.
 */
const VERSAO = chrome.runtime.getManifest().version;

function render() {
  const mapas = Object.keys(state?.rankedMaps || {}).length;
  const rejeitados = state?.rejeitados ?? [];
  $("versao").textContent = `BRAWL HÍBRIDO · RECOLHA v${VERSAO}`;
  $("status").textContent = state
    ? `${state.cursor}/${state.urls.length} páginas processadas · ${Object.keys(state.profiles).length} fichas${mapas ? ` · ${mapas} mapas` : ""}${state.rankedRotation ? " · rotação lida" : ""} · ${Object.keys(state.errors).length} erros. ${state.message}`
    : "Carrega a fila exportada no site.";
  $("progress").max = state?.urls.length || 1; $("progress").value = state?.cursor || 0;

  const semFila = !state;
  const acabou = Boolean(state) && state.cursor >= state.urls.length;
  $("start").disabled = semFila || state.running || acabou;
  $("pause").disabled = !state?.running; $("retry").disabled = !state || state.running || !Object.keys(state.errors).length;
  $("queue").disabled = !!state?.running;
  $("export").disabled = !state || (!Object.keys(state.profiles).length && !Object.keys(state.rankedMaps || {}).length && !state.rankedRotation);
  $("errors").textContent = Object.entries(state?.errors || {}).map(([url, error]) => `${url}: ${error}`).join("\n");

  /**
   * A espera depois de uma verificação tem de ser visível.
   *
   * Sem isto, uma extensão a esperar dois minutos é indistinguível de uma
   * extensão encravada — e quem está à frente dela carrega em Pausar,
   * desistindo de uma recolha que ia continuar sozinha.
   */
  const esperaAte = state?.esperarAte && state.esperarAte > Date.now() ? state.esperarAte : 0;
  if (esperaAte) {
    const segundos = Math.ceil((esperaAte - Date.now()) / 1000);
    const emMin = Math.floor(segundos / 60);
    $("status").textContent += ` · retoma daqui a ${emMin ? `${emMin} min ${segundos % 60}s` : `${segundos}s`}`;
  }

  // Um botão cinzento sem explicação parece um botão avariado.
  const porque = semFila
    ? "Iniciar está desativado porque ainda não há fila carregada. Escolhe o ficheiro exportado pelo site na caixa acima. Se ao escolhê-lo aparecer um erro a vermelho, a extensão está mais antiga do que o site: descarrega o ZIP outra vez e carrega Recarregar em chrome://extensions."
    : state.running
      ? "A recolha está a correr. Usa Pausar para a interromper."
      : acabou
        ? "Esta fila chegou ao fim. Exporta os resultados e, se precisares de mais, carrega uma fila nova no site."
        : "";
  $("porque-cinzento").textContent = porque;
  $("porque-cinzento").hidden = !porque;

  $("bloco-rejeitados").hidden = !rejeitados.length;
  $("rejeitados").textContent = rejeitados.map(({ url, motivo }) => `${url}: ${motivo}`).join("\n");

  // A última verificação, com o sinal exato. É o que permite dizer se foi a
  // fonte a recusar ou o nosso leitor a enganar-se.
  const bloqueio = state?.ultimoBloqueio;
  $("bloco-bloqueio").hidden = !bloqueio;
  $("bloqueio").textContent = bloqueio
    ? `${bloqueio.quando}\n${bloqueio.url}\nsinal encontrado na página: ${bloqueio.sinal ?? "(não registado)"}`
    : "";
}

/**
 * Enquanto uma espera decorre, o painel volta a desenhar-se sozinho.
 *
 * A contagem decrescente que não conta é pior do que não haver contagem: parece
 * que parou. O estado só muda quando a recolha retoma, por isso o redesenho tem
 * de vir daqui.
 */
setInterval(() => { if (state?.esperarAte && state.esperarAte > Date.now()) render(); }, 1000);
$("queue").onchange = async event => {
  try {
    if (state && Object.keys(state.profiles).length && !confirm("Exportaste os resultados atuais? Carregar outra fila substitui o progresso local da extensão.")) return;
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 2000000) throw new Error("Fila demasiado grande.");
    await action("load", { queue: JSON.parse(await file.text()) });
  } catch (error) { $("error").textContent = error.message; }
};
for (const name of ["start", "pause", "retry"]) $(name).onclick = () => action(name);
/**
 * Um ficheiro por tipo de recolha.
 *
 * As fichas do BrawlScope e os mapas do TopBrawl entram no site por portas
 * diferentes, e um ficheiro que misturasse os dois obrigaria quem importa a
 * saber qual é qual. Exporta-se o que houver: numa fila só de mapas sai só o
 * ficheiro dos mapas.
 */
function descarregar(nome, conteudo) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(conteudo)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export").onclick = () => {
  const fichas = Object.values(state.profiles || {});
  const mapas = Object.values(state.rankedMaps || {});
  if (fichas.length) descarregar("brawlscope-resultados.json", { format: "brawlhibrido-captures-v1", profiles: fichas, errors: state.errors });
  /**
   * A rotação viaja no MESMO ficheiro dos mapas, de propósito.
   *
   * Um segundo ficheiro seria um segundo passo, e um segundo passo é um passo
   * que se esquece — foi assim que a rotação ficou desatualizada sem ninguém
   * reparar. Quem importa os mapas importa a rotação com eles.
   */
  if (mapas.length || state.rankedRotation) {
    descarregar("topbrawl-mapas.json", {
      format: "brawlhibrido-ranked-paginas-v1",
      maps: mapas,
      ...(state.rankedRotation ? { rotation: state.rankedRotation } : {}),
      errors: state.errors,
    });
  }
};
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes["brawl-v54-queue"]) { state = changes["brawl-v54-queue"].newValue; render(); } });
await action("status");
