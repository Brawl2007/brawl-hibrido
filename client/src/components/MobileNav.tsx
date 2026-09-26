import { Crosshair, Gauge, Layers3, Sparkles } from "lucide-react";

/**
 * Navegação inferior para telemóvel.
 *
 * Existe por causa de um problema concreto: em ecrãs pequenos a barra lateral é
 * empurrada para fora do ecrã, e a página do Draft — ao contrário do Início —
 * não tinha botão nenhum para a trazer de volta. Quem abrisse o Draft no
 * telemóvel ficava sem maneira de ir a lado nenhum.
 *
 * Uma barra inferior é melhor do que uma gaveta para este site. Durante uma
 * partida a mão está em baixo e o tempo de draft é curto: um destino a um toque,
 * sempre visível, vale mais do que um menu que é preciso abrir primeiro.
 *
 * Os alvos têm 56px de altura. Abaixo dos 44px recomendados, um polegar falha —
 * e falhar um toque a meio de um draft é pior do que qualquer questão estética.
 */
const DESTINOS = [
  { href: "/", label: "Início", icon: Gauge, match: (path: string) => path === "/" },
  { href: "/draft", label: "Draft", icon: Sparkles, match: (path: string) => path.startsWith("/draft") },
  { href: "/brawlers", label: "Brawlers", icon: Crosshair, match: (path: string) => path.startsWith("/brawlers") },
  { href: "/matchups", label: "Matriz 1v1", icon: Layers3, match: (path: string) => path.startsWith("/matchups") },
] as const;

export function MobileNav({ pathname }: { pathname?: string }) {
  const atual = pathname ?? (typeof window === "undefined" ? "/" : window.location.pathname);

  return (
    <nav className="mobile-nav" aria-label="Navegação principal">
      {DESTINOS.map(({ href, label, icon: Icon, match }) => {
        const ativo = match(atual);
        return (
          <a
            key={href}
            href={href}
            className={`mobile-nav-item ${ativo ? "is-active" : ""}`}
            aria-current={ativo ? "page" : undefined}
          >
            <Icon size={19} strokeWidth={2.2} />
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
