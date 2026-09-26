/**
 * A qualidade dos gráficos do mapa 3D. Fica num ficheiro à parte, sem three.js:
 * o quadro do general decide a qualidade sem puxar o 3D para a página do Draft
 * (o 3D só se carrega quando é preciso).
 */
export type QualidadeDoMapa = "cinema" | "rapido";

/** A qualidade de origem: Cinema num computador, Rápido num telemóvel. */
export function qualidadeDeOrigem(): QualidadeDoMapa {
  if (typeof window === "undefined") return "rapido";
  const pequeno = window.matchMedia?.("(max-width: 900px)").matches;
  const tatil = window.matchMedia?.("(pointer: coarse)").matches;
  return pequeno || tatil ? "rapido" : "cinema";
}
