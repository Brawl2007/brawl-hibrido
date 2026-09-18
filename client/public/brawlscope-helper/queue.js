/**
 * A fila só aceita endereços que a recolha sabe ler.
 *
 * Passou a haver duas origens. O TopBrawl entrou porque responde 403 a pedidos
 * vindos de qualquer alojamento na nuvem — a Vercel e os servidores do GitHub
 * foram testados e levaram os dois 403 —, mas abre sem problema no navegador de
 * quem usa o site. Ler de lá é o único caminho que resta.
 *
 * UM ENDEREÇO RECUSADO NÃO DEITA A FILA TODA FORA
 *
 * Antes deitava, e isso rebentou na primeira vez que o site aprendeu um
 * endereço novo. O site passou a pôr o índice da rotação à frente da fila; uma
 * extensão mais antiga não conhece esse endereço, recusava-o, e com ele
 * recusava as outras duzentas. O painel mostrava "Só páginas de mapa do
 * TopBrawl" — uma frase sobre um endereço, para um problema que era de versão —
 * e o botão Iniciar ficava cinzento sem nada a explicar porquê.
 *
 * A propriedade que interessa é a extensão NUNCA VISITAR um endereço que não
 * conhece. Recusar um a um garante isso na mesma. Deitar a fila fora não
 * acrescentava segurança nenhuma: só tornava a falha total e muda.
 *
 * Devolve `{ urls, rejeitados }`. Só atira quando não sobrar nada para visitar,
 * porque aí não há recolha nenhuma a fazer.
 */
export function validateQueue(input) {
  if (input?.format !== "brawlhibrido-queue-v1" || !Array.isArray(input.urls) || !input.urls.length || input.urls.length > 2500) throw new Error("Ficheiro de fila inválido.");
  const modes = ["gemGrab", "brawlBall", "knockout", "heist", "hotZone", "bounty"];

  const aceites = [];
  const rejeitados = [];
  for (const value of input.urls) {
    try {
      aceites.push(umEndereco(value, modes));
    } catch (error) {
      rejeitados.push({ url: String(value), motivo: error.message });
    }
  }

  const urls = [...new Set(aceites)];
  if (!urls.length) {
    /**
     * Nenhum endereço reconhecido é quase sempre uma questão de versão: o site
     * já exporta uma fila que esta extensão ainda não sabe ler. Dizê-lo poupa a
     * procura no sítio errado — o ficheiro está bom, a extensão é que é velha.
     */
    throw new Error(`Nenhum dos ${input.urls.length} endereços é reconhecido por esta versão da extensão. Provavelmente a extensão está mais antiga do que o site: descarrega o ZIP outra vez e carrega Recarregar em chrome://extensions. (Primeiro: ${rejeitados[0]?.motivo})`);
  }
  return { urls, rejeitados };
}

function umEndereco(value, modes) {
  const url = new URL(value);
  if (url.username || url.password) throw new Error("A fila não pode conter credenciais.");

  if (url.origin === "https://topbrawl.com") {
    /**
     * O índice da rotação entra na fila como qualquer mapa.
     *
     * É ele que diz QUAIS são os mapas de agora. Sem ele, a fila só sabe os
     * mapas que estavam na lista escrita à mão do projeto — e quando a rotação
     * muda, continua a recolher os que já saíram e ignora os que entraram.
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
}
