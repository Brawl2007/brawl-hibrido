import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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

describe("as outras páginas também sem rolar tanto (v144)", () => {
  it("o Início mostra uma secção de cada vez, em abas, e o menu de cima escolhe a aba", () => {
    const home = ler("client/src/pages/Home.tsx");
    for (const id of ["maps", "rotation-averages", "sources", "ranking-laboratory", "formula"]) expect(home).toContain(`{aba === "${id}" && (`);
    expect(home).toContain("if (eAba) setAba(id as AbaDoInicio);");
  });

  it("Brawlers e a ficha de cada brawler também em abas, e as listas longas mostram 24", () => {
    const brawlers = ler("client/src/pages/Brawlers.tsx");
    expect(brawlers).toContain('{aba === "alcance" && <AttackRangeTable');
    expect(brawlers).toContain("filteredCatalog.slice(0, verTodos || query.trim() ? filteredCatalog.length : 24)");
    const ficha = ler("client/src/pages/BrawlerDetail.tsx");
    expect(ficha).toContain('{aba === "counters" &&');
    expect(ficha).toContain('{aba === "todos" && <BrawlScopeMatchupMatrix');
    expect(ler("client/src/pages/MatchupMatrix.tsx")).toContain("row.slice(0, verTodos || query.trim() ? row.length : 24)");
  });
});

describe("o plano da IA chega antes da partida", () => {
  const quadro = ler("client/src/components/QuadroDoGeneral.tsx");
  it("pede-se sozinho quando o draft fecha, uma vez por draft", () => {
    expect(quadro).toContain("if (temPlanoDaIA || pedirPlano.isPending || jaPediuSozinho.current === chave) return;");
    expect(quadro).toContain("jaPediuSozinho.current = chave;");
  });
  it("rápido e automático vêm ligados de origem, e o servidor recebe o rápido", () => {
    expect(quadro).toContain('return { principal: "gemini", soEssa: false, modelos: {}, rapido: true, automatico: true };');
    expect(quadro).toContain("rapido: escolhaDaIA.rapido,");
    expect(ler("server/routers.ts")).toContain("rapido: z.boolean().optional(),");
  });
});

describe("a pesquisa das sugestões", () => {
  it("apaga-se assim que o brawler é escolhido", () => {
    const draft = ler("client/src/pages/Draft.tsx");
    const escolher = draft.slice(draft.indexOf("const assignBrawler = useCallback"), draft.indexOf("}, [scheduleContextualAnalysis]);"));
    expect(escolher).toContain('setQuery("");');
  });
});

describe("o mapa 3D: menos texto e a cena da partida", () => {
  const q3d = ler("client/src/components/Quadro3D.tsx");
  const quadro = ler("client/src/components/QuadroDoGeneral.tsx");

  it("nada de balões de texto por cima uns dos outros", () => {
    // Os avisos de ameaça eram balões de 7 casas; ficou um ⚠ pequeno.
    expect(q3d).not.toContain("desenharAmeaca(");
    // As notas escritas no mapa vêm desligadas.
    expect(quadro).toContain("const [notasNoMapa, setNotasNoMapa] = useState(false);");
  });

  it("cada brawler ataca à maneira da classe", () => {
    const habilidades = ler("client/src/components/habilidades3D.ts");
    expect(habilidades).toContain('case "Lançador": return "arco";');
    expect(habilidades).toContain('case "Artilheiro": return "reto";');
    expect(habilidades).toMatch(/case "Tank":\s*case "Assassino": return "investida";/);
    expect(quadro).toContain("classe: getBrawlerClass(linha.brawler)");
  });

  it("um só plano de drone, luta a luta, com câmara lenta em cada uma", () => {
    expect(q3d).toContain('new THREE.CatmullRomCurve3(poses.map((p) => p.pos), false, "centripetal")');
    expect(q3d).toContain("filme.relogio += (agora - filme.ultimo) * lento;");
    expect(q3d).toContain("animarTiro(tiro, i, filme!.relogio)");
  });

  it("a cena arranca sozinha quando o plano chega, com legendas uma de cada vez", () => {
    const sucesso = quadro.slice(quadro.indexOf("const pedirPlano = trpc.general.pedirPlano.useMutation"), quadro.indexOf("const rotularTerreno"));
    expect(sucesso).toContain("setCinema(cenaDe(novo));");
    // A legenda segue o drone (uma por luta), não um relógio à parte.
    expect(quadro).toContain('<p key={etapa} className="qg-legenda">{legendaDaEtapa}</p>');
    expect(quadro).toContain("onEtapaDoCinema={setEtapa}");
  });
});

describe("gráficos Cinema", () => {
  const real = ler("client/src/components/realismo3D.ts");
  const q3d = ler("client/src/components/Quadro3D.tsx");
  it("luz de céu, tons neutros e brilho só no que passa do branco", () => {
    expect(real).toContain("renderer.toneMapping = THREE.NeutralToneMapping;");
    expect(real).toContain("scene.environment = ambiente;");
    expect(real).toContain("new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.55, 1.0)");
    // O céu físico não vai para o fundo: o brilho espalhava-o e o mapa ficava branco.
    expect(real).not.toContain("scene.add(ceu)");
  });
  it("o 3D não entra na página do Draft: a escolha da qualidade vive sem three.js", () => {
    expect(ler("client/src/components/qualidadeDoMapa.ts")).not.toMatch(/from "three/);
    expect(ler("client/src/components/QuadroDoGeneral.tsx")).not.toMatch(/from "\.\/realismo3D"/);
    expect(ler("client/src/components/QuadroDoGeneral.tsx")).toContain("key={qualidade}");
  });
  it("mato de lâminas ao vento e água que ondula, só no modo Cinema", () => {
    expect(q3d).toContain("if (real) {\n            c.grupoDoTerreno.add(criarMatoDeLaminas(");
    expect(q3d).toContain("materialDaAgua.userData.ondula = true;");
  });
});

describe("os bonecos com corpo", () => {
  const bonecos = ler("client/src/components/bonecos3D.ts");
  const q3d = ler("client/src/components/Quadro3D.tsx");
  it("cada classe tem a sua forma e arma", () => {
    for (const classe of ["Tank", "Assassino", "Artilheiro", "Lançador", "Destruidor", "Controlador", "Suporte"]) {
      expect(bonecos, classe).toMatch(new RegExp(`${classe}: \\{ largura`));
    }
    expect(bonecos).toContain('case "Artilheiro": {');
    expect(bonecos).toContain('case "Lançador": {');
  });
  it("o corpo substitui o pau, olha para a base adversária e mantém a cara no lugar do retrato", () => {
    expect(q3d).toContain("haste.add(criarCorpo(ficha.classe, COR_DO_LADO[ficha.lado]));");
    expect(q3d).toContain('haste.rotation.y = haste.userData.rotacao = ficha.lado === "nos" ? 0 : Math.PI;');
    expect(q3d).toContain("const ALTURA_DO_RETRATO = ALTURA_DA_CARA;");
  });
});

describe("os modelos originais, os ataques e os supers de cada brawler", () => {
  const q3d = ler("client/src/components/Quadro3D.tsx");
  const modelos = ler("client/src/components/modelosDosBrawlers.ts");
  const quadro = ler("client/src/components/QuadroDoGeneral.tsx");

  it("os .glb da pasta entram sozinhos e só se descarregam quando o mapa os pede", () => {
    expect(modelos).toContain('import.meta.glob("../modelos/brawlers/*.glb", { query: "?url", import: "default" })');
    expect(modelos).not.toContain("eager");
    expect(existsSync(resolve(process.cwd(), "client/src/modelos/brawlers/LEIA-ME.md"))).toBe(true);
    // O modelo troca o boneco; sem modelo fica o boneco.
    expect(q3d).toContain("if (temModelo(ficha.nome)) {");
    expect(q3d).toContain("grupo.userData.boneco = boneco;");
    // A malha é partilhada com a cópia em memória: não se deita fora ao redesenhar.
    expect(q3d).toContain("if (o.userData.partilhado) return;");
  });

  it("o super não se confunde com o ataque, e sem super usa o ataque", () => {
    expect(modelos.indexOf("super: /super|ulti|especial/i")).toBeLessThan(modelos.indexOf("ataque: /attack"));
    expect(modelos).toContain('(acao === "super" ? acoes.get("ataque") : undefined)');
  });

  it("as animações andam, e abrandam na câmara lenta", () => {
    expect(q3d).toContain("* (filme ? filme.lento : 1)");
    expect(q3d).toContain('animar(objeto, t >= 1 ? "parado" : "anda");');
    expect(q3d).toContain('animar(atacante, f >= viagem ? "parado" : ehSuper ? "super" : corre ? "anda" : "ataque");');
  });

  it("a câmara como no jogo: alta, sempre com o mesmo ângulo, e fica guardada", () => {
    expect(q3d).toContain('if (filme.camara === "jogo") {');
    expect(q3d).toContain("new THREE.Vector3(0, 13.5, 7.8).multiplyScalar(zoom)");
    expect(quadro).toContain('<option value="jogo">Como no jogo</option>');
    expect(quadro).toContain('const CHAVE_DA_CAMARA = "brawl-hibrido:camara-da-cena:v1";');
    expect(quadro).toMatch(/duracaoMs: Math\.max\([^\n]*camara,/);
  });
});
