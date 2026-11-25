import { LOGO } from "@/lib/imagens";
import { VERSAO_DO_SITE } from "@shared/version";

/**
 * O rodapé, igual em todas as páginas.
 *
 * Não existia: as páginas acabavam a meio do chão, sem dizer de quem era o
 * site nem de onde vinham os retratos e os mapas. Os retratos e os mapas são
 * do Brawl Stars, e a política de conteúdo de fãs da Supercell pede que um
 * site de fãs o diga com estas palavras. É isso, mais os destinos e a versão.
 *
 * A faixa de cima é o corte VS (azul, amarelo, vermelho): a mesma diagonal
 * da barra da probabilidade no Draft.
 */
const DESTINOS = [
  { href: "/", label: "Início" },
  { href: "/draft", label: "Draft" },
  { href: "/partidas", label: "Partidas" },
  { href: "/matchups", label: "Matriz 1v1" },
  { href: "/brawlers", label: "Brawlers" },
] as const;

export function RodapeDoSite() {
  return (
    <footer className="rodape-do-site">
      <div className="rodape-do-site-conteudo">
        <a className="rodape-do-site-marca" href="/" aria-label="Brawl Híbrido, início">
          <img src={LOGO} alt="" width={34} height={34} />
          <span>Brawl Híbrido</span>
        </a>
        <nav aria-label="Destinos do site">
          {DESTINOS.map(({ href, label }) => <a key={href} href={href}>{label}</a>)}
        </nav>
        <small>
          Este conteúdo não é oficial nem é aprovado pela Supercell. Para mais informações, consulta a{" "}
          <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer">Política de Conteúdo de Fãs da Supercell</a>.
          {" "}Brawl Stars e os seus retratos e mapas pertencem à Supercell. Versão {VERSAO_DO_SITE}.
        </small>
      </div>
    </footer>
  );
}
