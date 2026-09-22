import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";

/**
 * A aparência que só se via medindo.
 *
 * Este ficheiro guarda duas correções que tinham a mesma forma: pareciam estar
 * a funcionar e não estavam, e nenhuma das duas dava erro nenhum.
 *
 * 1. OS TIPOS DE LETRA NÃO CHEGAVAM A TEMPO
 *
 *    O `index.html` pedia Lilita One, Barlow Condensed e Space Grotesk ao
 *    Google. Isso são dois domínios externos — um para a folha de estilos,
 *    outro para os ficheiros — antes da primeira letra ser desenhada. Até
 *    chegarem, o título de entrada de 82px era pintado num sans qualquer e
 *    saltava para o tipo certo a meio.
 *
 *    O salto não era cosmético. O Lilita One é o que faz a interface parecer o
 *    jogo, e o Barlow Condensed é MUITO mais estreito: o `max-width` do título
 *    tinha sido escolhido a olhar para o tipo errado, e com o tipo certo a
 *    frase partia-se em cinco linhas. Ninguém viu, porque o tipo certo nunca
 *    ficava tempo suficiente no ecrã para alguém reparar.
 *
 * 2. A ETIQUETA "DRAFT" ERA DOURADA SOBRE DOURADO
 *
 *    #ffcf4b de texto sobre #ffc02e de fundo: rácio de contraste 1,07:1,
 *    quando o mínimo legível é 4,5:1. A palavra desaparecia e ficava só a
 *    mancha amarela — que sozinha parece decoração intencional, e foi por isso
 *    que aguentou tanto tempo.
 *
 * As duas são invisíveis a ler o código e óbvias a medir a página. Como não há
 * aqui um browser, o que este teste mede são as condições que as causaram.
 */

const HTML = readFileSync("client/index.html", "utf8");
const CSS = readFileSync("client/src/index.css", "utf8");
const ARENA = readFileSync("client/src/arena-v55.css", "utf8");

/**
 * Sem comentários, linha a linha.
 *
 * Os comentários acima citam de propósito o que foi corrigido, para o próximo
 * leitor perceber o que mudou. Uma busca sobre o ficheiro inteiro encontrava
 * essas citações e dava o teste por falhado — foi o que aconteceu duas vezes
 * noutros ficheiros. O mesmo removedor está em `frasesDoPainel.test.ts` e em
 * `draftParaVisitantes.test.ts`, pela mesma razão.
 */
function semComentarios(fonte: string) {
  const saida: string[] = [];
  let dentroDeBloco = false;
  for (const linha of fonte.split("\n")) {
    const limpa = linha.trim();
    if (dentroDeBloco) {
      if (limpa.includes("*/")) dentroDeBloco = false;
      continue;
    }
    if (limpa.startsWith("/*")) {
      if (!limpa.includes("*/")) dentroDeBloco = true;
      continue;
    }
    if (limpa.startsWith("*") || limpa.startsWith("//")) continue;
    if (limpa.startsWith("<!--")) {
      if (!limpa.includes("-->")) dentroDeBloco = true;
      continue;
    }
    saida.push(linha);
  }
  return saida.join("\n");
}

const CSS_LIMPO = semComentarios(CSS);
const ARENA_LIMPO = semComentarios(ARENA);

describe("os tipos de letra são servidos pelo próprio site", () => {
  const FICHEIROS = [
    "client/public/tipos/lilita-one-400.woff2",
    "client/public/tipos/barlow-condensed-600.woff2",
    "client/public/tipos/barlow-condensed-700.woff2",
    "client/public/tipos/barlow-condensed-800.woff2",
    "client/public/tipos/space-grotesk-var.woff2",
  ];

  it.each(FICHEIROS)("%s existe e não está vazio", (caminho) => {
    expect(statSync(caminho).size).toBeGreaterThan(4000);
  });

  it("os cinco juntos continuam a caber num pedido pequeno", () => {
    const total = FICHEIROS.reduce((soma, f) => soma + statSync(f).size, 0);
    // 100 KB hoje. O limite existe para alguém reparar antes de acrescentar o
    // `latin-ext` inteiro "só para garantir" — que o site não usa.
    expect(total).toBeLessThan(160 * 1024);
  });

  it("o index.html deixou de pedir os tipos ao Google", () => {
    const html = semComentarios(HTML);
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });

  it("o Lilita One vai pré-carregado, porque é o primeiro que se vê", () => {
    expect(HTML).toContain('rel="preload" href="/tipos/lilita-one-400.woff2"');
  });

  it("cada tipo tem a sua declaração @font-face na folha de estilos", () => {
    for (const nome of ["Lilita One", "Barlow Condensed", "Space Grotesk"]) {
      expect(CSS_LIMPO).toContain(`font-family: "${nome}";`);
    }
    // Um por peso do Barlow, mais o Lilita, mais o variável do Grotesk.
    expect(CSS_LIMPO.match(/@font-face/g)?.length).toBe(5);
  });

  it("usa swap: texto que muda de forma é melhor do que texto que não se lê", () => {
    // Com `block`, o título de 82px ficava invisível até o ficheiro chegar.
    expect(CSS_LIMPO).not.toContain("font-display: block");
    expect(CSS_LIMPO.match(/font-display: swap/g)?.length).toBe(5);
  });
});

describe("a etiqueta do Draft continua legível", () => {
  it("o texto do kicker não volta a ser dourado sobre dourado", () => {
    const regra = ARENA_LIMPO.match(/\.draft-contextbar-kicker\s*\{[^}]*\}/)?.[0];
    expect(regra).toBeDefined();
    // #ffc02e é o fundo que o index.css lhe dá. Qualquer amarelo no texto põe
    // as duas cores a um ponto de distância uma da outra.
    expect(regra).not.toMatch(/color:\s*#f{0,1}f[cd]/i);
    expect(regra).toContain("#1a1206");
  });
});

/**
 * O corpo de um bloco `@media`, e só o corpo.
 *
 * A primeira versão deste ficheiro cortava o CSS no texto do `@media` e
 * guardava tudo o que vinha a seguir. Parecia funcionar — e não funcionava:
 * apagando `.hero-content > *` de dentro do bloco de movimento reduzido, o
 * teste continuava a passar, porque o mesmo seletor aparece mais abaixo no
 * ficheiro a DECLARAR a animação, e esse pedaço também estava no que fora
 * guardado.
 *
 * Um teste que passa com o defeito posto é pior do que não existir: convence
 * quem vem a seguir de que aquilo está protegido. Este contador de chavetas
 * fecha o bloco onde ele acaba de verdade.
 */
function corposDe(fonte: string, abertura: string) {
  const corpos: string[] = [];
  let procura = fonte.indexOf(abertura);
  while (procura !== -1) {
    const inicio = fonte.indexOf("{", procura + abertura.length);
    if (inicio === -1) break;
    let profundidade = 0;
    let i = inicio;
    for (; i < fonte.length; i += 1) {
      if (fonte[i] === "{") profundidade += 1;
      else if (fonte[i] === "}") {
        profundidade -= 1;
        if (profundidade === 0) break;
      }
    }
    corpos.push(fonte.slice(inicio + 1, i));
    procura = fonte.indexOf(abertura, i);
  }
  return corpos.join("\n");
}

describe("o movimento tem sempre saída para quem o não quer", () => {
  /**
   * Reduzir movimento não é desligar tudo — o que provoca enjoo é a
   * DESLOCAÇÃO, não a mudança de cor. Mas uma animação nova que se esqueça
   * desta regra passa de detalhe a problema de acessibilidade sem avisar.
   */
  const animacoesNovas = [
    "bh-arena-breath",
    "bh-orbit-slow",
    "bh-hero-in",
    "bh-stamp-land",
    "bh-champion-sweep",
  ];

  it("todas as animações da entrada são desligáveis", () => {
    const corpos = corposDe(CSS, "@media (prefers-reduced-motion: reduce)");
    for (const seletor of [
      ".hero-panel::after",
      ".orbit-one",
      ".orbit-two",
      ".hero-content > *",
      ".hero-stamp",
      ".stat-card.accent-amber::before",
    ]) {
      expect(corpos).toContain(seletor);
    }
    for (const nome of animacoesNovas) expect(CSS_LIMPO).toContain(`@keyframes ${nome}`);
  });

  it("o slot à espera de escolha para de pulsar", () => {
    const corpos = corposDe(ARENA, "@media (prefers-reduced-motion: reduce)");
    expect(corpos).toContain(".draft-slot.is-active");
  });
});

describe("o hover não fica preso no telemóvel", () => {
  /**
   * Num ecrã de toque, tocar dispara `:hover` e o estado fica lá depois de o
   * dedo sair. Qualquer regra de hover que mexa na peça tem de estar atrás da
   * consulta de media que distingue rato de dedo.
   */
  it("as peças novas põem o hover atrás de (hover: hover)", () => {
    const corpos = [CSS, ARENA]
      .map((f) => corposDe(f, "@media (hover: hover) and (pointer: fine)"))
      .join("\n");
    for (const seletor of [
      ".stat-card:hover",
      ".map-card:hover",
      ".primary-button:hover",
      ".draft-shell .draft-slot:hover:not(:disabled)",
    ]) {
      expect(corpos).toContain(seletor);
    }
  });
});

describe("o cabeçalho de cada secção não volta a ser um carimbo", () => {
  /**
   * A Home tinha 7 secções e 23 micro-etiquetas em maiúsculas espalhadas por
   * elas. Não era o número que incomodava — era serem sempre as MESMAS duas
   * linhas, pela mesma ordem, sete vezes seguidas:
   *
   *     BIBLIOTECA RANKED · 01 — 26
   *     BH ———— LIVE ROTATION / 26 MAPS
   *     ESCOLHE O TEU MAPA
   *
   * A do meio não dizia nada que já não estivesse no ecrã: o "26" estava na
   * linha de cima E na barra lateral. Repetido sete vezes, o que aquilo
   * comunicava era "isto foi gerado por um molde", que é exatamente o
   * contrário de vivo.
   *
   * Ao puxar o fio saiu código morto: o componente que desenhava a marquinha
   * estava definido DUAS vezes — `BrandMotif` no Home.tsx, `Brand` no
   * Draft.tsx — e o Draft nunca chegou a renderizar o dele. Havia também
   * quatro carimbos "BH // ALGO" fixados em CSS nos cantos das secções.
   */
  const HOME = readFileSync("client/src/pages/Home.tsx", "utf8");
  const DRAFT = readFileSync("client/src/pages/Draft.tsx", "utf8");

  it("a linha de motivo não volta a duplicar o cabeçalho", () => {
    expect(HOME).not.toContain('className="section-motif"');
    expect(DRAFT).not.toContain('className="section-motif"');
  });

  it("os carimbos BH // ALGO não voltam aos cantos", () => {
    expect(CSS_LIMPO).not.toContain('content: "BH //');
  });

  it("o componente da marquinha não volta a existir sem ser usado", () => {
    // Estava definido em dois sítios e renderizado em nenhum.
    for (const fonte of [HOME, DRAFT]) {
      const definido = /function (BrandMotif|Brand)\(/.test(fonte);
      const usado = /<(BrandMotif|Brand)[\s/>]/.test(fonte);
      expect(definido && !usado).toBe(false);
    }
  });

  it("as etiquetas de intervalo saíram dos cabeçalhos", () => {
    // "01 — 26" é numeração decorativa: quem lê consegue contar os cartões.
    expect(HOME).not.toContain("<span>01 — 26</span>");
    expect(HOME).not.toContain('<span>FULL SOURCE READOUT</span>');
  });
});
