/**
 * O número da versão, num canto. Ver `shared/version.ts` para o porquê.
 *
 * Fica em cima, à direita. Em baixo ficava debaixo dos avisos que aparecem
 * nesse canto e, no telemóvel, fora do que se vê sem rolar.
 *
 * Não apanha cliques (`pointer-events-none`): serve para ler, nunca para
 * estorvar o que está por baixo.
 */
import { VERSAO_DO_SITE } from "@shared/version";

export default function VersaoDoSite() {
  return (
    <span
      aria-label={`Versão do site ${VERSAO_DO_SITE}`}
      className="site-version-badge"
    >
      {VERSAO_DO_SITE}
    </span>
  );
}
