import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A arrumação da v143, pedida assim: "menu em cima como o PL Prodigy", "o
 * quadro Azul contra Vermelha numa tela junto com as sugestões, troca de mapa,
 * equipas sugeridas, pick agora, quem escolhe primeiro", "um mapa só no fim —
 * o normal vira o 3D", e "funções e regras numa mini-lista pequena para
 * clicar". Estes testes seguram cada uma dessas decisões.
 */
const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf8");
const PAGINAS = ["client/src/pages/Home.tsx", "client/src/pages/Draft.tsx", "client/src/pages/Brawlers.tsx", "client/src/pages/BrawlerDetail.tsx", "client/src/pages/MatchupMatrix.tsx"];

describe("o menu em cima", () => {
  it("todas as páginas usam a mesma barra, e nenhuma volta à barra lateral", () => {
    for (const pagina of PAGINAS) {
      const fonte = ler(pagina);
      expect(fonte, pagina).toMatch(/<BarraDoSite ativo=/);
      expect(fonte, pagina).not.toContain('className="app-sidebar');
    }
  });

  it("os sete destinos, pela ordem do site", () => {
    const barra = ler("client/src/components/BarraDoSite.tsx");
    const rotulos = [...barra.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(rotulos).toEqual(["Início", "Mapas", "Draft", "Matriz 1v1", "Brawlers", "Fontes", "Como funciona"]);
  });

  it("no telemóvel os destinos saem de cima, porque a barra de baixo já os tem", () => {
    const css = ler("client/src/layout-v143.css");
    const bloco = css.slice(css.indexOf("@media (max-width: 900px) {"));
    expect(bloco).toContain(".barra-do-site-destinos { display: none; }");
    for (const pagina of PAGINAS) expect(ler(pagina), pagina).toMatch(/<MobileNav pathname=/);
  });

  it("a folha nova vem depois das outras, senão perde a cascata", () => {
    const main = ler("client/src/main.tsx");
    const posicao = (folha: string) => main.indexOf(`/${folha}";`);
    expect(posicao("arena-v55.css")).toBeGreaterThan(0);
    expect(posicao("layout-v143.css")).toBeGreaterThan(posicao("arena-v55.css"));
  });
});

describe("o Draft num só ecrã", () => {
  const draft = ler("client/src/pages/Draft.tsx");

  it("Azul à esquerda, sugestões ao meio, Vermelha à direita", () => {
    const azul = draft.indexOf('<TeamBoard team="blue"');
    const centro = draft.indexOf('<div className="mesa-centro">');
    const vermelha = draft.indexOf('<TeamBoard team="red"');
    expect(azul).toBeGreaterThan(0);
    expect(azul).toBeLessThan(centro);
    expect(centro).toBeLessThan(vermelha);
  });

  it("mapa, quem começa e a tua equipa ficam na barra de cima do tabuleiro", () => {
    const barra = draft.slice(draft.indexOf('<section className="draft-contextbar"'), draft.indexOf('<div className="draft-content">'));
    expect(barra).toContain('aria-label="Mapa do draft"');
    expect(barra).toContain('aria-label="Quem escolhe primeiro"');
    expect(barra).toContain('aria-label="A tua equipa"');
    expect(barra).toContain("<SeletorDeElo");
  });

  it("de quem é a vez aparece em grande, com o pick ou ban", () => {
    expect(draft).toContain('`${activeDraftStep.kind === "ban" ? "Ban" : "Pick"} da ${activeDraftStep.team === "blue" ? "Azul" : "Vermelha"}');
  });

  it("as equipas sugeridas e os counters estão ao centro, em abas, sem ocupar a página", () => {
    const centro = draft.slice(draft.indexOf('<div className="mesa-centro">'), draft.indexOf('<TeamBoard team="red"'));
    expect(centro).toContain('{abaDoCentro === "sugestoes" &&');
    expect(centro).toContain('{abaDoCentro === "equipas" && <MapTeamBoardPanel');
    expect(centro).toContain('{abaDoCentro === "sinais" &&');
  });
});

describe("ajustes numa mini-lista", () => {
  const draft = ler("client/src/pages/Draft.tsx");

  it("regras, funções, ordem e fontes só abrem no painel ao lado", () => {
    const painel = draft.indexOf("<Sheet open={painelAberto !== null}");
    expect(painel).toBeGreaterThan(0);
    for (const componente of ["<DraftRulesPanel", "<DraftRoleEditor", "<ScrimSetup", "<SourceHealthPanel", "<DraftScoreReference"]) {
      // Uma só vez, e dentro do painel.
      expect(draft.split(componente).length - 1, componente).toBe(1);
      expect(draft.indexOf(componente), componente).toBeGreaterThan(painel);
    }
  });

  it("a lista abre num menu pequeno, e as funções só aparecem ao dono", () => {
    expect(draft).toContain("<DropdownMenuTrigger asChild>");
    expect(draft).toContain('{ id: "funcoes", label: "Funções (Mid, Lane, Flex)", soDono: true }');
    expect(draft).toContain("PAINEIS_DO_DRAFT.filter((painel) => !painel.soDono || ehDono)");
  });

  it("no painel, as funções são uma linha por brawler", () => {
    expect(draft).toContain("<DraftRoleEditor noPainel");
    const editor = ler("client/src/components/DraftRoleEditor.tsx");
    expect(editor).toContain('if (noPainel) return <div className="funcoes-painel">{lista}</div>;');
  });
});

describe("um só mapa no fim do draft", () => {
  const draft = ler("client/src/pages/Draft.tsx");
  const final = draft.slice(draft.indexOf('<section className="draft-final"'), draft.indexOf("</section>", draft.indexOf("<LaneMatchupDesk myTeam={myTeam} semMapa")));

  it("o mapa é o 3D, e os duelos ficam só com os pontos", () => {
    expect(final).toContain("<QuadroDoGeneral");
    expect(final).toContain("<LaneMatchupDesk myTeam={myTeam} semMapa");
    expect(draft).toContain('{!semMapa && <div className="duel-map-layout">');
    // Não há outro quadro de duelos na página além deste.
    expect(draft.split("<LaneMatchupDesk ").length - 1).toBe(1);
  });

  it("quando o último slot fecha, a página desce até ao mapa", () => {
    expect(draft).toContain("secaoFinalRef.current?.scrollIntoView(");
    expect(draft).toContain('<section className="draft-final" ref={secaoFinalRef}');
  });
});
