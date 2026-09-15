export function validateQueue(input) {
  if (input?.format !== "brawlhibrido-queue-v1" || !Array.isArray(input.urls) || !input.urls.length || input.urls.length > 2500) throw new Error("Ficheiro de fila inválido.");
  const modes = ["gemGrab", "brawlBall", "knockout", "heist", "hotZone", "bounty"];
  return [...new Set(input.urls.map(value => {
    const url = new URL(value);
    if (url.origin !== "https://brawlscope.com" || url.username || url.password || !/^\/counters\/[a-z0-9-]+$/.test(url.pathname)) throw new Error("A fila só pode conter fichas HTTPS do BrawlScope.");
    if ([...url.searchParams.keys()].some(k => k !== "mode") || (url.searchParams.has("mode") && !modes.includes(url.searchParams.get("mode")))) throw new Error("Modo inválido na fila.");
    url.hash = "";
    return url.href;
  }))];
}
