import type { MouseEvent, ReactNode } from "react";
import { LOGO } from "@/lib/imagens";

/**
 * A barra de cima, igual em todas as páginas.
 *
 * Antes cada página tinha a sua barra lateral de 248px, com um selo "WORKSPACE
 * LIVE", um cartão de publicidade a si própria e um rodapé — e mesmo assim os
 * destinos eram os mesmos sete. Ocupava um quinto do ecrã para dizer pouco. Em
 * cima, numa linha, os destinos cabem todos e o conteúdo ganha a largura toda.
 *
 * No telemóvel os destinos saem daqui (a barra de baixo, `MobileNav`, já os tem
 * à mão do polegar) e fica só o nome do site e as ações da página.
 */
export const DESTINOS_DO_SITE = [
  { id: "inicio", label: "Início", href: "/" },
  { id: "mapas", label: "Mapas", href: "/#maps" },
  { id: "draft", label: "Draft", href: "/draft" },
  { id: "matriz", label: "Matriz 1v1", href: "/matchups" },
  { id: "brawlers", label: "Brawlers", href: "/brawlers" },
  { id: "fontes", label: "Fontes", href: "/#sources" },
  { id: "como", label: "Como funciona", href: "/#formula" },
] as const;

export type DestinoDoSite = (typeof DESTINOS_DO_SITE)[number]["id"];

export function BarraDoSite({ ativo, children, onSecao }: {
  /** O destino desta página (nenhum, numa página que não está no menu). */
  ativo?: DestinoDoSite;
  /** As ações desta página (estado das fontes, atualizar, limpar…). */
  children?: ReactNode;
  /**
   * Na página inicial, "Mapas", "Fontes" e "Como funciona" são secções da
   * própria página: quem a mostra desliza até lá em vez de recarregar.
   */
  onSecao?: (secao: string) => void;
}) {
  const clicar = (href: string) => (evento: MouseEvent<HTMLAnchorElement>) => {
    if (!onSecao || !href.startsWith("/#")) return;
    evento.preventDefault();
    onSecao(href.slice(2));
  };
  return (
    <header className="barra-do-site">
      <a className="barra-do-site-marca" href="/" aria-label="Brawl Híbrido, início">
        <img src={LOGO} alt="" />
        <span>Brawl Híbrido</span>
      </a>
      <nav className="barra-do-site-destinos" aria-label="Navegação principal">
        {DESTINOS_DO_SITE.map(({ id, label, href }) => (
          <a
            key={id}
            href={href}
            onClick={clicar(href)}
            className={id === ativo ? "is-active" : undefined}
            aria-current={id === ativo ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      {children ? <div className="barra-do-site-acoes">{children}</div> : null}
    </header>
  );
}
