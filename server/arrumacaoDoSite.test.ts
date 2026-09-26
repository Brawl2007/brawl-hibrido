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

describe("v150: revisão do site (telemóvel, textos, retratos, títulos)", () => {
  const css = ler("client/src/layout-v143.css");
  it("a pesquisa do Draft não vira um quadrado no telemóvel, e a barra 50/50 fica em cima", () => {
    expect(css).toContain(".mesa-centro .recommendation-toolbar { flex-direction: row; flex-wrap: wrap; align-items: center; }");
    expect(css).toContain(".mesa-centro .recommendation-toolbar .draft-search { flex: 1 1 100%;");
    expect(css).toContain(".mesa-centro .draft-probability-center.is-compacto { order: 0; width: auto; min-height: 0;");
    expect(css).toContain(".brawlers-toolbar > .brawler-search { flex: 0 0 auto; }");
  });
  it("no Draft já não há a seta ↑ que levava ao Início", () => {
    expect(ler("client/src/pages/Draft.tsx")).not.toContain("draft-back-home");
  });
  it("a página que não existe está em português, com o menu do site", () => {
    const pagina = ler("client/src/pages/NotFound.tsx");
    expect(pagina).toContain("<BarraDoSite />");
    expect(pagina).toContain("Esta página não existe");
    expect(pagina).not.toMatch(/Page Not Found|Go Home/);
  });
  it("sem inglês nem nomes técnicos à vista", () => {
    const ficha = ler("client/src/pages/BrawlerDetail.tsx");
    expect(ficha).not.toMatch(/strong against|Struggles against|Ranked SSE|Win Rate \$\{/i);
    expect(ler("client/src/pages/Brawlers.tsx")).not.toMatch(/"cópia do site"|rankedSync\.version \?/);
    expect(ler("client/src/pages/Home.tsx")).not.toContain('"Meta snapshot"');
    expect(ler("client/src/components/MobileNav.tsx")).toContain('label: "Matriz 1v1"');
  });
  it("os retratos mostram as iniciais quando a imagem falha", () => {
    expect(ler("client/src/components/Retrato.tsx")).toContain("onError={() => setFalhou(src)}");
    for (const pagina of ["Draft", "Home", "Brawlers", "BrawlerDetail", "MatchupMatrix"]) {
      const fonte = ler(`client/src/pages/${pagina}.tsx`);
      expect(fonte, pagina).toContain("<Retrato ");
      // Retratos como imagem de fundo não sabem que falharam.
      expect(fonte, pagina).not.toMatch(/avatar"? style=\{[^}]*backgroundImage/);
    }
  });
});

describe("v151: telemóvel e rapidez", () => {
  const q3d = ler("client/src/components/Quadro3D.tsx");
  const quadro = ler("client/src/components/QuadroDoGeneral.tsx");
  it("no mapa 3D, um dedo desce a página e dois dedos rodam e aproximam", () => {
    expect(q3d).toContain("controls.touches = { TWO: THREE.TOUCH.DOLLY_ROTATE };");
    expect(q3d).toContain('renderer.domElement.style.touchAction = "pan-y";');
    // Agarrar um brawler (ou desenhar) continua a ser do mapa.
    expect(q3d).toContain('if (ferramenta !== "mover" || emAlgo) evento.preventDefault();');
    expect(q3d).toContain('addEventListener("touchstart", aoTocar, { passive: false })');
    expect(q3d).toContain('removeEventListener("touchstart", aoTocar)');
  });
  it("no telemóvel, as opções do mapa ficam atrás de um botão", () => {
    expect(quadro).toContain('className="quadro-general-mais" aria-expanded={opcoesAbertas}');
    expect(ler("client/src/layout-v143.css")).toContain(".quadro-general-barra:not(.com-opcoes) > .quadro-general-vistas");
  });
  it("o general e a importação de lotes não vêm no primeiro carregamento do Draft", () => {
    const draft = ler("client/src/pages/Draft.tsx");
    expect(draft).not.toMatch(/^import \{ QuadroDoGeneral \}/m);
    expect(draft).toContain("const QuadroDoGeneral = lazy(carregarQuadroDoGeneral);");
    // Escrito aos bocados: o verificador de imports lê cadeias parecidas com imports, até nos testes.
    expect(ler("client/src/components/FilaDeColagem.tsx")).toContain("const ImportarLote = lazy(() => imp" + 'ort("./Importar' + 'Lote"));');
  });
});

describe("a pré-visualização quando se partilha o link", () => {
  const html = ler("client/index.html");
  it("título, descrição e imagem com endereço completo, no HTML", () => {
    expect(html).toContain('<meta property="og:title" content="Brawl Híbrido — Draft do Ranked com dados" />');
    expect(html).toContain('<meta property="og:image" content="https://brawl-hibrido.vercel.app/partilha.png" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(existsSync(resolve(process.cwd(), "client/public/partilha.png"))).toBe(true);
  });
  it("a imagem tem 1200×630 e cabe no limite do WhatsApp (menos de 300 KB)", () => {
    const png = readFileSync(resolve(process.cwd(), "client/public/partilha.png"));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeLessThan(300 * 1024);
  });
});

/**
 * v152 — letras maiores. Havia 241 tamanhos entre 6 e 9 px (na página Brawlers,
 * 358 de 460 textos ficavam abaixo de 11 px). Estes testes impedem que uma
 * regra nova volte a pôr letra minúscula.
 */
describe("v152 — letras legíveis", () => {
  const folhas = ["client/src/index.css", "client/src/layout-v143.css", "client/src/arena-v55.css"];

  it("nenhum texto abaixo de 9 px, em px ou em rem", () => {
    for (const folha of folhas) {
      const css = ler(folha);
      for (const m of css.matchAll(/font-size:\s*([0-9]*\.?[0-9]+)px/g)) expect(Number(m[1]), `${folha}: ${m[0]}`).toBeGreaterThanOrEqual(9);
      for (const m of css.matchAll(/font:\s*[0-9]{3}\s+([0-9.]+)px/g)) expect(Number(m[1]), `${folha}: ${m[0]}`).toBeGreaterThanOrEqual(9);
      for (const m of css.matchAll(/font-size:\s*([0-9]*\.?[0-9]+)rem/g)) expect(Number(m[1]) * 16, `${folha}: ${m[0]}`).toBeGreaterThanOrEqual(9);
    }
  });

  it("a maior parte do texto miúdo passou dos 10 px", () => {
    const tamanhos = folhas.flatMap((folha) => Array.from(ler(folha).matchAll(/font-size:\s*([0-9]*\.?[0-9]+)px/g), (m) => Number(m[1])));
    const miudos = tamanhos.filter((t) => t < 10).length;
    expect(miudos).toBeLessThan(20);
  });

  it("onde a letra maior partia a linha, a fila fica inteira", () => {
    const css = ler("client/src/layout-v143.css");
    const bloco = css.slice(css.indexOf("/* v152"));
    expect(bloco).toMatch(/\.draft-contextbar \.seletor-elo-botoes \{[^}]*flex-wrap: nowrap/);
    expect(ler("client/src/index.css")).toMatch(/\.brawler-filter-group button \{[^}]*white-space: nowrap/);
    // O "56 counters · 49 respostas" dos cartões desce de linha em vez de ser cortado.
    expect(ler("client/src/index.css")).not.toMatch(/\.brawler-card-copy span \{[^}]*text-overflow: ellipsis/);
  });
});

/**
 * v152 — o ficheiro inicial deixou de trazer os catálogos dos counters. O
 * `CounterSyncProvider` envolve o site todo; importava de
 * `counterSourceRelations`, que arrasta centenas de KB de dados estáticos.
 */
describe("v152 — ficheiro inicial sem os catálogos dos counters", () => {
  it("o provider importa o estado leve, não as relações", () => {
    const provider = ler("client/src/contexts/CounterSyncContext.tsx");
    expect(provider).toContain('from "@shared/counterSyncEstado"');
    expect(provider).not.toContain("@shared/counterSourceRelations");
  });

  it("o estado leve não importa nenhum catálogo", () => {
    const estado = ler("shared/counterSyncEstado.ts");
    const importacoes = Array.from(estado.matchAll(/from "([^"]+)"/g), (m) => m[1]);
    expect(importacoes.sort()).toEqual(["./counterSyncSnapshot", "./versaoDoMotor"]);
    expect(estado).toMatch(/import type \{ CounterSyncSnapshotPayload \} from "\.\/counterSyncSnapshot"/);
  });
});
