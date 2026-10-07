import { useCallback, useState } from "react";
import { defaultDraftApiRuleSettings, normalizarRegrasDaApi, type DraftApiRuleSettings } from "@shared/draftRules";

/**
 * As regras do Draft com «API oficial» (v170), guardadas neste navegador à
 * parte das regras das fontes — mexer numas não mexe nas outras.
 */
const CHAVE = "brawl-hibrido:draft-api-rules:v1";

function ler(): DraftApiRuleSettings {
  try {
    const texto = localStorage.getItem(CHAVE);
    return normalizarRegrasDaApi(texto ? JSON.parse(texto) : null);
  } catch {
    return defaultDraftApiRuleSettings;
  }
}

export function useRegrasDaApi() {
  const [regras, setRegras] = useState<DraftApiRuleSettings>(ler);
  const mudar = useCallback((novas: Partial<DraftApiRuleSettings>) => {
    setRegras((atuais) => {
      const limpas = normalizarRegrasDaApi({ ...atuais, ...novas });
      try {
        localStorage.setItem(CHAVE, JSON.stringify(limpas));
      } catch {
        // Sem armazenamento: vale só nesta visita.
      }
      return limpas;
    });
  }, []);
  const repor = useCallback(() => mudar(defaultDraftApiRuleSettings), [mudar]);
  const personalizadas = (Object.keys(defaultDraftApiRuleSettings) as Array<keyof DraftApiRuleSettings>).some((chave) => regras[chave] !== defaultDraftApiRuleSettings[chave]);
  return { regras, mudar, repor, personalizadas };
}
