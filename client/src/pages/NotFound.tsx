import { BarraDoSite } from "@/components/BarraDoSite";
import { MobileNav } from "@/components/MobileNav";

/**
 * A página que não existe. Era a do modelo do projeto (branca, em inglês, sem
 * menu) e parecia de outro site; agora tem o menu e o tema do resto.
 */
export default function NotFound() {
  return (
    <div className="pagina-inexistente">
      <BarraDoSite />
      <main>
        <strong className="bh-display">404</strong>
        <h1>Esta página não existe</h1>
        <p>O endereço pode estar mal escrito, ou a página mudou de sítio.</p>
        <div className="pagina-inexistente-acoes">
          <a className="is-principal" href="/draft">Abrir o Draft</a>
          <a href="/">Ir para o início</a>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
