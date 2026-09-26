import type { TipoDeMarcador, TipoDeSeta } from "@shared/quadroDoGeneral";

/** Cores das setas e dos símbolos, as mesmas no 3D e na lista ao lado. */
export const COR_DA_SETA: Record<TipoDeSeta, string> = { avanco: "#3ddc84", recuo: "#ffb020", rotacao: "#4aa8ff" };
export const COR_DO_MARCADOR: Record<TipoDeMarcador, string> = {
  ataque: "#ff6b3d",
  defesa: "#37c8ff",
  controlo: "#4aa8ff",
  posicao: "#e8eef7",
  emboscada: "#b56cff",
  flanco: "#3ddc84",
  cobertura: "#c9a26b",
  gadget: "#3ddc84",
  destruir: "#ff9f1c",
  agua: "#2ec4f0",
  abertura: "#7ee787",
  perigo: "#ff4d6d",
  foco: "#ffd23f",
};
