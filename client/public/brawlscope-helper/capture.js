/**
 * Injected in a normal, visible Chrome tab; no requests, cookies or hidden APIs.
 *
 * Uma função só, porque é assim que ela viaja: o `executeScript` serializa-a
 * inteira para dentro da página e lá dentro não há imports. Por isso a
 * ramificação por origem vive aqui, no princípio.
 */
export async function captureProfile() {
  const visible = element => Boolean(element && element.getClientRects().length);
  const bloqueado = texto => /verify you are human|checking your browser|just a moment|access denied|request blocked|unusual traffic|captcha|403\s*forbidden|too many requests/i.test(texto);

  /**
   * O TopBrawl é lido de outra maneira, e de propósito NÃO é interpretado aqui.
   *
   * A página traz os números em JSON dentro das suas etiquetas de script, não na
   * tabela visível. Trazer esse texto tal e qual, e deixar o servidor
   * interpretá-lo com o mesmo código de sempre, evita a coisa que mais estraga
   * este tipo de recolha: duas leituras da mesma página, uma de cada lado, a
   * divergirem em silêncio quando a fonte mudar o formato. Os números
   * continuariam a aparecer, só que errados.
   *
   * Vêm só as etiquetas de script, não a página toda: é onde os dados estão, e
   * é uma fração do tamanho.
   */
  if (location.hostname === "topbrawl.com" || location.hostname === "www.topbrawl.com") {
    const corpo = document.body?.innerText || "";
    if (bloqueado(corpo) || document.querySelector('iframe[src*="captcha"],iframe[src*="challenges.cloudflare"]')) {
      return { blocked: true, error: "O TopBrawl pediu verificação ou bloqueou o acesso. A fila foi pausada." };
    }
    /**
     * O índice da rotação: quais são os mapas de agora.
     *
     * Vem por interpretar, como as páginas de mapa e pela mesma razão — um
     * interpretador só, e é o do servidor. Duas leituras da mesma página
     * divergiriam em silêncio no dia em que a fonte mudasse o formato.
     *
     * Só o corpo da página, e nunca mais do que cabe num pedido: é onde as
     * ligações para cada mapa estão.
     */
    if (location.pathname === "/rankeds" || location.pathname === "/rankeds/") {
      const corpoHtml = document.body?.innerHTML || "";
      if (!/\/rankeds\/\d+/.test(corpoHtml)) {
        return { error: "Índice sem ligações para mapas; possível alteração do formato." };
      }
      return { rankedRotation: { url: location.href, capturedAt: new Date().toISOString(), html: corpoHtml.slice(0, 2_000_000) } };
    }

    const mapId = location.pathname.match(/^\/rankeds\/(\d+)/)?.[1];
    if (!mapId) return { error: "Endereço sem id de mapa; não foi importado." };

    const guiao = Array.from(document.querySelectorAll("script")).map(s => s.textContent || "").join("\n");
    // Sem o bloco de dados não há nada para ler, e um mapa vazio é pior do que
    // mapa nenhum: passaria por recolha feita e apagaria a leitura anterior.
    if (!/"brawlerId"\s*:\s*\d+/.test(guiao) && !/\\"brawlerId\\"\s*:\s*\d+/.test(guiao)) {
      return { error: "Página sem o bloco de dados dos brawlers; possível alteração do formato." };
    }
    const titulo = (document.querySelector("h1")?.innerText || "").replace(/\s+/g, " ").trim();
    return { rankedMap: { mapId, map: titulo || `Mapa ${mapId}`, url: location.href, capturedAt: new Date().toISOString(), scripts: guiao } };
  }

  const clean = element => (element?.innerText || "").replace(/\s+/g, " ").trim();
  const page = document.body?.innerText || "";
  if (bloqueado(page) || document.querySelector('iframe[src*="captcha"],iframe[src*="challenges.cloudflare"]')) {
    return { blocked: true, error: "O BrawlScope pediu verificação ou bloqueou o acesso. A fila foi pausada." };
  }
  const title = clean(document.querySelector("h1"));
  const brawler = title.match(/^(.+?) counters$/i)?.[1];
  if (!brawler && /forbidden|\b403\b|\b429\b/i.test(page)) return { blocked: true, error: "Acesso recusado pela fonte. Fila pausada." };
  if (!brawler) return { error: "Página sem título de ficha; não foi importada." };
  const summary = Array.from(document.querySelectorAll("summary")).find(s => /Every matchup/i.test(clean(s)));
  if (!summary) return { error: "Tabela Every matchup não encontrada; possível alteração do formato." };
  const details = summary.closest("details");
  const expectedCount = Number(clean(summary).match(/Every matchup\s*(\d+)/i)?.[1]);
  if (!details || !Number.isInteger(expectedCount)) return { error: "Contagem de confrontos não encontrada." };
  if (!expectedCount) return { error: "Sem amostra nesta vista; nenhuma ficha foi inventada." };
  if (!details.open) summary.click();
  let anchors = [];
  const readAnchors = () => {
    anchors = Array.from(details.querySelectorAll('a[href*="/counters/"]')).filter(a => visible(a) && /\d\s*%\s*vs/.test(clean(a)));
    return anchors.length === expectedCount;
  };
  if (!readAnchors()) {
    await new Promise(resolve => {
      const observer = new MutationObserver(() => {
        if (readAnchors()) { observer.disconnect(); resolve(); }
      });
      observer.observe(details, { childList: true, subtree: true, characterData: true });
      setTimeout(() => { observer.disconnect(); readAnchors(); resolve(); }, 30000);
    });
  }
  const number = s => Number(s.replace(/[−–]/g, "-").replace(/\s/g, "").replace(",", "."));
  function parseRow(anchor) {
    const paragraphs = Array.from(anchor.querySelectorAll("p"));
    const opponent = clean(paragraphs[0]);
    const text = clean(anchor);
    const rates = text.match(/(\d+(?:[.,]\d+)?)\s*%\s*vs\.?\s*(\d+(?:[.,]\d+)?)\s*%/);
    const deltaP = paragraphs.find(p => /^[+−–-]?\s*\d+(?:[.,]\d+)?$/.test(clean(p)));
    if (!opponent || !rates || !deltaP) throw new Error("Formato de linha desconhecido; nenhuma importação parcial.");
    const rate = number(rates[1]), average = number(rates[2]), delta = number(clean(deltaP));
    if (rate < 0 || rate > 100 || average < 0 || average > 100 || Math.abs(rate - average - delta) > .21) throw new Error("Percentagens e delta não correspondem.");
    return { opponent, rate, average, delta };
  }
  function literalRows(label) {
    const heading = Array.from(document.querySelectorAll("h3")).find(h => clean(h).toLowerCase() === label.toLowerCase());
    if (!heading) throw new Error(`Secção ausente: ${label}`);
    let node = heading;
    let list;
    // The heading may be wrapped with its help button, followed by the list.
    for (let depth = 0; node && depth < 3 && !list; depth++, node = node.parentElement) {
      let sibling = node.nextElementSibling;
      while (sibling && !/^(H1|H2|H3)$/.test(sibling.tagName)) {
        if (sibling.matches("ul,ol")) { list = sibling; break; }
        if (sibling.querySelector("h1,h2,h3")) break;
        const nested = sibling.querySelector("ul,ol");
        if (nested) { list = nested; break; }
        sibling = sibling.nextElementSibling;
      }
    }
    if (!list) throw new Error(`Lista ausente: ${label}`);
    return Array.from(list.querySelectorAll('a[href*="/counters/"]')).filter(visible).map(a => {
      const row = parseRow(a); return { brawler: row.opponent, delta: row.delta };
    });
  }
  try {
    const rows = anchors.map(parseRow);
    if (rows.length !== expectedCount || new Set(rows.map(r => r.opponent)).size !== expectedCount) throw new Error(`Tabela incompleta: ${rows.length}/${expectedCount}.`);
    const url = new URL(location.href);
    return { profile: { url: url.href, brawler, view: url.searchParams.get("mode") || "overall", capturedAt: new Date().toISOString(), expectedCount, rows,
      counteredBy: literalRows(`Counters ${brawler}`), targets: literalRows(`${brawler} punishes`), synergies: literalRows(`Drafts well with ${brawler}`) } };
  } catch (error) { return { error: error.message }; }
}
