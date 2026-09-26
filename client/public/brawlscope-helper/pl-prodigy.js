/*
 * Brawl Híbrido → PL Prodigy: preenche a ferramenta de draft com o draft que
 * fizeste no Brawl Híbrido.
 *
 * Só corre quando a página abre com `#bh=…` no endereço — o que o botão
 * "Abrir no PL Prodigy" do Brawl Híbrido põe lá. Faz os mesmos cliques que
 * farias à mão (Reset, mapa, bans, picks), na tua sessão e com os teus usos.
 * Não lê nada por trás, não mexe em cookies nem em pedidos de rede.
 *
 * Os seletores são os marcadores `data-plp-tutorial-target` que a própria
 * página usa no tutorial: são os que menos mudam quando o site é redesenhado.
 * Se algum desaparecer, isto pára e diz qual, em vez de clicar às cegas.
 */
(() => {
  const PREFIXO = "#bh=";
  if (!location.hash.startsWith(PREFIXO)) return;

  let pedido = null;
  try {
    pedido = JSON.parse(decodeURIComponent(location.hash.slice(PREFIXO.length)));
  } catch {
    return;
  }
  // Tira o draft do endereço: recarregar a página não volta a preencher.
  history.replaceState(null, "", location.pathname + location.search);
  if (!pedido || pedido.v !== 1) return;

  const nomes = (lista, maximo) => (Array.isArray(lista) ? lista : [])
    .filter((nome) => typeof nome === "string" && nome.trim())
    .map((nome) => nome.trim().slice(0, 40))
    .slice(0, maximo);
  const draft = {
    mapa: typeof pedido.mapa === "string" ? pedido.mapa.trim().slice(0, 60) : null,
    nossos: nomes(pedido.nossos, 3),
    deles: nomes(pedido.deles, 3),
    bans: nomes(pedido.bans, 6),
  };

  const alvo = (nome) => `[data-plp-tutorial-target~="${nome}"]`;
  const chave = (texto) => String(texto ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
  const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
  async function esperar(condicao, limiteMs = 8000, passoMs = 120) {
    const fim = Date.now() + limiteMs;
    for (;;) {
      const valor = condicao();
      if (valor) return valor;
      if (Date.now() > fim) return null;
      await pausa(passoMs);
    }
  }

  // --- o que a página mostra agora ------------------------------------------
  const cartao = (nome) => [...document.querySelectorAll(alvo("brawler-choice"))]
    .find((el) => chave(el.querySelector("img")?.alt) === chave(nome));
  const nomeDoBotao = (botao) => (botao.getAttribute("aria-label") ?? "").replace(/^Remove\s+/i, "").replace(/\s+from the (lineup|bans)$/i, "");
  /** Picks da esquerda (antes do "VS") e da direita (depois). */
  function picks() {
    const vs = document.querySelector('img[alt="VS"]');
    const lados = { esquerda: [], direita: [] };
    for (const botao of document.querySelectorAll(alvo("lineup-selected-pick"))) {
      const antesDoVs = vs ? Boolean(botao.compareDocumentPosition(vs) & Node.DOCUMENT_POSITION_FOLLOWING) : true;
      lados[antesDoVs ? "esquerda" : "direita"].push({ nome: nomeDoBotao(botao), botao });
    }
    return lados;
  }
  const bans = () => [...document.querySelectorAll(alvo("lineup-selected-ban"))].map(nomeDoBotao);
  const tem = (lista, nome) => lista.some((item) => chave(item.nome ?? item) === chave(nome));

  // --- aviso no canto da página ---------------------------------------------
  const caixa = document.createElement("div");
  caixa.setAttribute("role", "status");
  caixa.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;padding:12px 14px;border-radius:10px;background:#0b1220;color:#e8eefc;font:13px/1.45 system-ui,sans-serif;border:1px solid #f5c542;box-shadow:0 10px 30px rgba(0,0,0,.5)";
  const avisar = (texto) => { caixa.textContent = `Brawl Híbrido · ${texto}`; if (!caixa.isConnected) document.body.appendChild(caixa); };

  async function modo(qual) {
    const botao = document.querySelector(`${alvo("pick-ban-toggle")} button[value="${qual}"]`);
    if (!botao) throw new Error(`não encontrei o botão ${qual === "bans" ? "Bans" : "Picks"}`);
    if (botao.getAttribute("aria-pressed") !== "true") { botao.click(); await esperar(() => botao.getAttribute("aria-pressed") === "true", 2000); }
  }

  async function escolherMapa(nome) {
    const input = document.querySelector(`${alvo("map-select")} input`);
    if (!input) throw new Error("não encontrei o seletor de mapa");
    if (chave(input.value) === chave(nome)) return true;
    const escrever = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    input.focus();
    escrever.call(input, nome);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const opcao = await esperar(() => [...document.querySelectorAll('[role="option"]')].find((el) => chave(el.textContent) === chave(nome)), 4000);
    if (!opcao) { input.blur(); return false; }
    opcao.click();
    return Boolean(await esperar(() => chave(input.value) === chave(nome), 3000));
  }

  async function banir(nome) {
    const el = cartao(nome);
    if (!el) return false;
    el.click();
    return Boolean(await esperar(() => tem(bans(), nome), 3000));
  }

  /*
   * A vez (TURN) diz de que lado cai o próximo pick, mas a página não diz qual
   * posição do botão é qual lado — e pode mudar a vez sozinha depois de cada
   * pick. Por isso aprende-se: vê-se onde caiu um pick e em que posição estava
   * o botão nesse momento. A partir daí, acerta-se a vez ANTES de cada clique.
   */
  let ladoComTurnLigado = null;
  const botaoDaVez = () => document.querySelector(alvo("turn-switch"));
  const turnLigado = () => botaoDaVez()?.getAttribute("aria-pressed") === "true";
  const oposto = (lado) => (lado === "esquerda" ? "direita" : "esquerda");
  async function acertarVez(lado) {
    const botao = botaoDaVez();
    if (!botao || ladoComTurnLigado === null) return;
    const quer = ladoComTurnLigado === lado;
    if (turnLigado() !== quer) { botao.click(); await esperar(() => turnLigado() === quer, 2000); }
  }

  /** Clica no brawler; se cair do lado errado, tira-o, acerta a vez e volta a pôr. */
  async function escolher(nome, lado) {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      await acertarVez(lado);
      const el = cartao(nome);
      if (!el) return false;
      const ligadoAntes = turnLigado();
      el.click();
      const ondeFicou = await esperar(() => (tem(picks()[lado], nome) ? lado : tem(picks()[oposto(lado)], nome) ? oposto(lado) : null), 3000);
      if (ondeFicou && botaoDaVez()) ladoComTurnLigado = ligadoAntes ? ondeFicou : oposto(ondeFicou);
      if (ondeFicou === lado) return true;
      if (ondeFicou) {
        picks()[ondeFicou].find((item) => chave(item.nome) === chave(nome))?.botao.click();
        await esperar(() => !tem(picks()[ondeFicou], nome), 2000);
      } else if (ladoComTurnLigado === null) {
        // Nada aconteceu e ainda não se sabe a vez: tenta com a outra.
        botaoDaVez()?.click();
        await pausa(200);
      } else {
        return false;
      }
    }
    return false;
  }

  async function preencher() {
    avisar("a preparar o draft…");
    const grelha = await esperar(() => document.querySelector(alvo("brawler-grid")) && document.querySelector(alvo("brawler-choice")), 20000);
    if (!grelha) throw new Error("a grelha de brawlers não apareceu (a página mudou?)");

    const reset = document.querySelector(alvo("reset-draft"));
    if (reset) { reset.click(); await esperar(() => !document.querySelector(alvo("lineup-selected-pick")) && !document.querySelector(alvo("lineup-selected-ban")), 3000); }

    const falhas = [];
    if (draft.mapa && !(await escolherMapa(draft.mapa))) falhas.push(`mapa ${draft.mapa}`);

    if (draft.bans.length) {
      await modo("bans");
      for (const nome of draft.bans) if (!(await banir(nome))) falhas.push(`ban ${nome}`);
    }
    await modo("picks");
    // Pela ordem de um draft (1-2-2-1): 1 nosso, 2 deles, 2 nossos, 1 deles.
    // Se a ferramenta mudar a vez sozinha, a ordem certa poupa correções.
    const [n, d] = [draft.nossos, draft.deles];
    const ordem = [[n[0], "esquerda"], [d[0], "direita"], [d[1], "direita"], [n[1], "esquerda"], [n[2], "esquerda"], [d[2], "direita"]]
      .filter(([nome]) => nome);
    for (const [nome, lado] of ordem) if (!(await escolher(nome, lado))) falhas.push(`pick ${nome}`);

    const feitos = ordem.length + draft.bans.length + (draft.mapa ? 1 : 0) - falhas.length;
    avisar(falhas.length
      ? `preenchi ${feitos} de ${feitos + falhas.length}. Faltou: ${falhas.join(", ")}. Escolhe esses à mão.`
      : `draft preenchido: ${draft.mapa ?? "mapa atual"}, ${ordem.length} picks, ${draft.bans.length} bans.`);
    setTimeout(() => caixa.remove(), falhas.length ? 15000 : 6000);
  }

  preencher().catch((erro) => avisar(`não consegui preencher: ${erro?.message ?? erro}. Faz o draft à mão.`));
})();
