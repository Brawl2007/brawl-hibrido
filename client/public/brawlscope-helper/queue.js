/**
 * A fila só aceita endereços que a recolha sabe ler.
 *
 * Passou a haver duas origens. O TopBrawl entrou porque responde 403 a pedidos
 * vindos de qualquer alojamento na nuvem — a Vercel e os servidores do GitHub
 * foram testados e levaram os dois 403 —, mas abre sem problema no navegador de
 * quem usa o site. Ler de lá é o único caminho que resta.
 */
export function validateQueue(input) {
  if (input?.format !== "brawlhibrido-queue-v1" || !Array.isArray(input.urls) || !input.urls.length || input.urls.length > 2500) throw new Error("Ficheiro de fila inválido.");
  const modes = ["gemGrab", "brawlBall", "knockout", "heist", "hotZone", "bounty"];
  return [...new Set(input.urls.map(value => {
    const url = new URL(value);
    if (url.username || url.password) throw new Error("A fila não pode conter credenciais.");

    if (url.origin === "https://topbrawl.com") {
      /**
       * O índice da rotação entra na fila como qualquer mapa.
       *
       * É ele que diz QUAIS são os mapas de agora. Sem ele, a fila só sabe os
       * mapas que estavam na lista escrita à mão do projeto — e quando a
       * rotação muda, continua a recolher os que já saíram e ignora os que
       * entraram, exatamente o que aconteceu.
       */
      if (url.pathname === "/rankeds" || url.pathname === "/rankeds/") {
        if ([...url.searchParams.keys()].length) throw new Error("O índice da rotação não leva parâmetros.");
        url.hash = "";
        return url.href;
      }
      if (!/^\/rankeds\/\d{1,20}$/.test(url.pathname)) throw new Error("Só páginas de mapa do TopBrawl.");
      // `rows` é o único parâmetro útil: pede a tabela completa em vez da primeira página.
      if ([...url.searchParams.keys()].some(k => k !== "rows")) throw new Error("Parâmetro inesperado num mapa do TopBrawl.");
      url.hash = "";
      return url.href;
    }

    if (url.origin !== "https://brawlscope.com" || !/^\/counters\/[a-z0-9-]+$/.test(url.pathname)) throw new Error("A fila só pode conter fichas do BrawlScope ou mapas do TopBrawl, em HTTPS.");
    if ([...url.searchParams.keys()].some(k => k !== "mode") || (url.searchParams.has("mode") && !modes.includes(url.searchParams.get("mode")))) throw new Error("Modo inválido na fila.");
    url.hash = "";
    return url.href;
  }))];
}
