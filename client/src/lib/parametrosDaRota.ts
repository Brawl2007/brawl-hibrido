/**
 * Ler e escrever a parte `?…` do endereço sem recarregar a página.
 *
 * O estado que tem de sobreviver a um "voltar", a um recarregar ou a um link
 * partilhado (o mapa escolhido, a pesquisa, o brawler-base da Matriz) vive no
 * endereço. Escreve-se com `replaceState` por omissão: mudar de mapa não deve
 * encher o histórico de entradas que o botão "voltar" teria de desfazer uma a
 * uma.
 */
export function lerParametro(nome: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(nome);
}

export function escreverParametros(mudancas: Record<string, string | null | undefined>, modo: "replace" | "push" = "replace") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [nome, valor] of Object.entries(mudancas)) {
    if (valor === null || valor === undefined || valor === "") url.searchParams.delete(nome);
    else url.searchParams.set(nome, valor);
  }
  const destino = `${url.pathname}${url.search}${url.hash}`;
  if (destino === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  if (modo === "push") window.history.pushState(window.history.state, "", destino);
  else window.history.replaceState(window.history.state, "", destino);
}

/** Uma vez por carregamento: o utilizador pediu menos movimento ao sistema? */
export function prefereMenosMovimento() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** "73,18" — vírgula decimal e casas fixas, como nas tabelas. */
export function formatarDecimal(valor: number | null | undefined, casas = 2) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-PT", { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: false });
}

/** "+7,45%" / "−17,15%" com o sinal tipográfico de menos. */
export function formatarPercentagemComSinal(valor: number, casas = 2) {
  const absoluto = formatarDecimal(Math.abs(valor), casas);
  if (valor > 0) return `+${absoluto}%`;
  if (valor < 0) return `−${absoluto}%`;
  return `${absoluto}%`;
}
