import { useCallback, useMemo, useState } from "react";
import {
  CONFIG_PADRAO,
  configDoPreset,
  normalizarConfigDoMotorApi,
  picksAPartirDasRegras,
  presetDaConfig,
  reequilibrarPick,
  type ConfigDoMotorApi,
  type DistribuicaoDoPick,
  type IdDoPreset,
  type SecaoEscalar,
} from "@shared/configDoMotorApi";
import { configCalibrada, type PesosCalibrados } from "@shared/calibracaoDoMotorApi";
import { defaultDraftApiRuleSettings, normalizarRegrasDaApi } from "@shared/draftRules";
import { readDraftRulePreference, toDraftRuleSettings } from "@/lib/draftRules";

/**
 * A configuração do motor do Draft com «API oficial» (v183), guardada neste
 * navegador. Ver `shared/configDoMotorApi.ts`.
 */
export const CHAVE_DA_CONFIG_DO_MOTOR_API = "brawl-hibrido:config-motor-api:v1";
const CHAVE_DAS_REGRAS_DA_API = "brawl-hibrido:draft-api-rules:v1";

/**
 * Quem já tinha pesos por pick e influência dos bans guardados (v170–v182)
 * não os perde: a primeira configuração parte deles.
 */
function configAPartirDoQueJaExistia(): ConfigDoMotorApi {
  const config = normalizarConfigDoMotorApi(CONFIG_PADRAO);
  try {
    config.picks = picksAPartirDasRegras(toDraftRuleSettings(readDraftRulePreference()));
    const texto = localStorage.getItem(CHAVE_DAS_REGRAS_DA_API);
    const regras = normalizarRegrasDaApi(texto ? JSON.parse(texto) : null);
    if (regras.apiPesoBan !== defaultDraftApiRuleSettings.apiPesoBan) config.bans.peso = regras.apiPesoBan;
  } catch {
    // Sem armazenamento ou texto estragado: valores de fábrica.
  }
  return normalizarConfigDoMotorApi(config);
}

function ler(): ConfigDoMotorApi {
  try {
    const texto = localStorage.getItem(CHAVE_DA_CONFIG_DO_MOTOR_API);
    if (texto) return normalizarConfigDoMotorApi(JSON.parse(texto));
  } catch {
    // Texto estragado: recomeça-se do que já existia.
  }
  return configAPartirDoQueJaExistia();
}

function guardar(config: ConfigDoMotorApi) {
  try {
    localStorage.setItem(CHAVE_DA_CONFIG_DO_MOTOR_API, JSON.stringify(config));
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
}

export function useConfigDoMotorApi() {
  const [config, setConfig] = useState<ConfigDoMotorApi>(ler);
  const aplicar = useCallback((fazer: (atual: ConfigDoMotorApi) => ConfigDoMotorApi) => {
    setConfig((atual) => {
      const nova = normalizarConfigDoMotorApi(fazer(structuredClone(atual)));
      guardar(nova);
      return nova;
    });
  }, []);
  const mudarCampo = useCallback((secao: SecaoEscalar, campo: string, valor: number) =>
    aplicar((c) => { (c[secao] as unknown as Record<string, number>)[campo] = valor; return c; }), [aplicar]);
  const mudarPick = useCallback((pick: number, campo: keyof DistribuicaoDoPick, valor: number) =>
    aplicar((c) => { c.picks[pick] = reequilibrarPick(c.picks[pick], campo, valor); return c; }), [aplicar]);
  const mudarProporcao = useCallback((pick: number, valor: number) =>
    aplicar((c) => { c.tetoDosBonus.proporcao[pick] = valor; return c; }), [aplicar]);
  const aplicarPreset = useCallback((id: IdDoPreset) => aplicar(() => configDoPreset(id)), [aplicar]);
  const aplicarCalibracao = useCallback((pesos: PesosCalibrados) => aplicar(() => configCalibrada(pesos)), [aplicar]);
  const preset = useMemo(() => presetDaConfig(config), [config]);
  return { config, preset, mudarCampo, mudarPick, mudarProporcao, aplicarPreset, aplicarCalibracao, repor: () => aplicarPreset("padrao") };
}
