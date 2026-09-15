/** Injected in a normal, visible Chrome tab; no requests, cookies or hidden APIs. */
export async function captureProfile() {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = element => Boolean(element && element.getClientRects().length);
  const clean = element => (element?.innerText || "").replace(/\s+/g, " ").trim();
  const page = document.body?.innerText || "";
  if (/verify you are human|checking your browser|just a moment|access denied|request blocked|unusual traffic|captcha|403\s*forbidden|too many requests/i.test(page) || document.querySelector('iframe[src*="captcha"],iframe[src*="challenges.cloudflare"]')) {
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
  for (let attempt = 0; attempt < 40; attempt++) {
    anchors = Array.from(details.querySelectorAll('a[href*="/counters/"]')).filter(a => visible(a) && /\d\s*%\s*vs/.test(clean(a)));
    if (anchors.length === expectedCount) break;
    await delay(250);
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
