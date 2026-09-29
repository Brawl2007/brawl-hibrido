import { useCallback, useState } from "react";
import { CONFIG_DO_MOTOR, lerConfigDoMotor, type ConfigDoMotor } from "@shared/motoresDoDraft";

/**
 * O motor do Draft escolhido nos Ajustes (Brawl Híbrido, PL Prodigy ou
 * MetaPick) e as barras de cada um, guardados neste navegador.
 */
const CHAVE = "draft-motor";

export function useMotorDoDraft() {
  const [config, setConfig] = useState<ConfigDoMotor>(() => {
    try {
      return lerConfigDoMotor(localStorage.getItem(CHAVE));
    } catch {
      return CONFIG_DO_MOTOR;
    }
  });
  const mudar = useCallback((nova: ConfigDoMotor) => {
    const limpa = lerConfigDoMotor(JSON.stringify(nova));
    setConfig(limpa);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(limpa));
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
  }, []);
  return { config, mudar };
}
