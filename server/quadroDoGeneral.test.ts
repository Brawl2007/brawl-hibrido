import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import {
  chaveDaFicha,
  lerPlanoDaIA,
  lerPlanoGuardado,
  posicoesIniciais,
  textoDoPedido,
  MAXIMO_DE_SETAS,
  type PedidoDePlano,
} from "@shared/quadroDoGeneral";
import { aplicarRotulos, grelhaEmTexto, pontoLivre, tipoDaCasa, type TerrenoDoMapa } from "@shared/terrenoDoMapa";
import { lerPng } from "./png";
import { lerTerrenoDaImagem } from "./terrenoDoMapa";
import { conferirBuilds, escolherModelo, opcoesDeBuild, ordenarModelos, pedirPlanoAoGeneral, pesquisarAtualidade } from "./generalIA";
import { imagemSegura, lerCatalogo } from "./catalogoDeBuilds";

const NOSSOS = ["Nori", "Lou", "R-T"];
const DELES = ["Bolt", "Lumi", "Sandy"];
const funcao = () => "flex" as const;

/* ------------------------------------------------------------------------ *
 * Um mapa de teste feito à mão, no formato das imagens da Brawlify:
 * 21×33 casas de 30 píxeis, com uma casa de margem, chão em xadrez.
 * ------------------------------------------------------------------------ */
type Pintura = (coluna: number, linha: number, x: number, y: number) => [number, number, number] | null;

function pngDoMapa(pintar: Pintura, largura = 690, altura = 1050) {
  const linhaBytes = largura * 3 + 1;
  const cru = Buffer.alloc(linhaBytes * altura);
  for (let y = 0; y < altura; y++) {
    // Filtro 1 (Sub) numa linha sim, noutra não: exercita o descodificador.
    const filtro = y % 2;
    cru[y * linhaBytes] = filtro;
    let anterior = [0, 0, 0];
    for (let x = 0; x < largura; x++) {
      const coluna = Math.floor(x / 30) - 1, linha = Math.floor(y / 30) - 1;
      const xadrez: [number, number, number] = (coluna + linha) % 2 ? [234, 156, 114] : [252, 168, 120];
      const cor = (coluna >= 0 && linha >= 0 && coluna < 21 && linha < 33 ? pintar(coluna, linha, x % 30, y % 30) : null) ?? xadrez;
      for (let k = 0; k < 3; k++) cru[y * linhaBytes + 1 + x * 3 + k] = filtro ? (cor[k] - anterior[k]) & 255 : cor[k];
      anterior = cor;
    }
  }
  const pedaco = (nome: string, dados: Buffer) => {
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length);
    return Buffer.concat([tamanho, Buffer.from(nome, "ascii"), dados, Buffer.alloc(4)]);
  };
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(largura, 0);
  cabecalho.writeUInt32BE(altura, 4);
  cabecalho[8] = 8; cabecalho[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pedaco("IHDR", cabecalho), pedaco("IDAT", deflateSync(cru)), pedaco("IEND", Buffer.alloc(0))]);
}

// Paredes: caixas com contorno escuro. Mato: relva às riscas. Água: lisa. Base: anel azul.
const pintarMapa: Pintura = (coluna, linha, x, y) => {
  if (linha === 10 && coluna >= 5 && coluna <= 9) return x < 3 || y < 3 || x > 26 || y > 26 ? [90, 50, 20] : [200, 120, 60];
  if (linha >= 14 && linha <= 17 && coluna >= 12 && coluna <= 15) return x % 6 < 3 ? [30, 140, 40] : [50, 170, 60];
  if (linha >= 22 && linha <= 24 && coluna >= 2 && coluna <= 5) return [40, 90, 200];
  if (linha === 32 && coluna >= 9 && coluna <= 11) return x < 9 || x > 20 ? [4, 171, 252] : null;
  // Uma zona a meio do mapa (anel azul em 3×3 casas) e uma flor vermelha sozinha num cacto.
  if (linha >= 19 && linha <= 21 && coluna >= 9 && coluna <= 11) return x < 9 || x > 20 ? [4, 171, 252] : [60, 120, 170];
  if (linha === 5 && coluna === 18) return x > 10 && x < 20 && y > 10 && y < 20 ? [230, 60, 80] : [60, 110, 40];
  // Uma piscina (o azul claro da água, a casa inteira) e o disco de uma zona (azulado, liso, redondo).
  if (linha >= 2 && linha <= 3 && coluna >= 14 && coluna <= 16) return [60, 175, 240];
  if (Math.hypot(coluna - 16, linha - 26) <= 3.2) return [30, 95, 160];
  return null;
};

describe("ler o terreno da imagem do mapa", () => {
  const terreno = lerTerrenoDaImagem(lerPng(pngDoMapa(pintarMapa)), "15000001");

  it("o xadrez é chão e cada coisa fica no sítio certo", () => {
    expect(tipoDaCasa(terreno, 0, 0)).toBe("chao");
    expect(tipoDaCasa(terreno, 7, 10)).toBe("parede");
    expect(tipoDaCasa(terreno, 13, 15)).toBe("mato");
    expect(tipoDaCasa(terreno, 3, 23)).toBe("agua");
    expect(tipoDaCasa(terreno, 10, 32)).toBe("objetivo");
    expect(tipoDaCasa(terreno, 7, 11)).toBe("chao");
  });

  it("a água é água, e o disco de uma zona é objetivo (não água nem paredes invisíveis)", () => {
    expect(tipoDaCasa(terreno, 15, 2)).toBe("agua");
    for (const [coluna, linha] of [[16, 26], [14, 25], [18, 27], [16, 23]]) expect(tipoDaCasa(terreno, coluna, linha), `${coluna},${linha}`).toBe("objetivo");
    expect(tipoDaCasa(terreno, 16, 30)).toBe("chao");
  });

  it("o anel de uma zona é objetivo em qualquer sítio do mapa; uma flor vermelha sozinha não", () => {
    for (const [coluna, linha] of [[9, 19], [10, 20], [11, 21]]) expect(tipoDaCasa(terreno, coluna, linha), `${coluna},${linha}`).toBe("objetivo");
    expect(tipoDaCasa(terreno, 18, 5)).not.toBe("objetivo");
  });

  it("a grelha em texto é a que a IA recebe, linha a linha", () => {
    const linhas = grelhaEmTexto(terreno).split("\n");
    expect(linhas).toHaveLength(33);
    expect(linhas[10]).toBe("10 .....#####...........");
    expect(linhas[15]).toBe('15 ............"""".....');
    expect(linhas[23]).toBe("23 ..~~~~.........ooo...");
  });

  it("uma imagem que não é um mapa 21×33 é recusada, não lida torta", () => {
    expect(() => lerTerrenoDaImagem(lerPng(pngDoMapa(() => null, 600, 1050)), "1")).toThrow(/21×33/);
    expect(() => lerPng(Buffer.from("não é png"))).toThrow(/PNG/);
  });

  it("os tipos corrigidos pela IA ou pelo dono substituem a regra; lixo é ignorado", () => {
    const grupoDaAgua = terreno.grelha[23 * 21 + 3];
    const corrigido = aplicarRotulos(terreno, [{ id: grupoDaAgua, tipo: "objetivo" }, { id: "zz", tipo: "parede" }, { id: grupoDaAgua, tipo: "lava" }]);
    expect(tipoDaCasa(corrigido, 3, 23)).toBe("objetivo");
    expect(corrigido.rotulado).toBe("ia");
    expect(aplicarRotulos(terreno, "lixo")).toBe(terreno);
  });

  it("um ponto dentro de uma parede ou na água passa para a casa livre mais próxima", () => {
    const dentroDaParede = { x: 7.5 / 21, y: 10.5 / 33 };
    const livre = pontoLivre(terreno, dentroDaParede);
    expect(tipoDaCasa(terreno, Math.floor(livre.x * 21), Math.floor(livre.y * 33))).toBe("chao");
    expect(Math.abs(livre.y * 33 - 10.5)).toBeLessThanOrEqual(1);
    const noChao = { x: 0.5, y: 0.5 };
    expect(pontoLivre(terreno, noChao)).toBe(noChao);
    expect(pontoLivre(null, dentroDaParede)).toBe(dentroDaParede);
  });
});

describe("a resposta da IA passa por um filtro antes de chegar ao mapa", () => {
  const terreno: TerrenoDoMapa = lerTerrenoDaImagem(lerPng(pngDoMapa(pintarMapa)), "15000001");
  const resposta = {
    resumo: "Segurar o meio.",
    condicaoDeVitoria: "Ganhar as lanes.",
    previsao: ["O Bolt entra pela esquerda.", ""],
    fases: [{ nome: "Início", instrucao: "Calma." }, { nome: "", instrucao: "sem nome" }],
    ordens: [
      { brawler: "lou", funcao: "ganha a lane", objetivo: "Partir a parede.", quandoAvancar: "Depois do super.", cuidados: ["Bolt"], posicao: { col: 7, linha: 10 }, build: { gadget: "não sei", poderEstelar: "Poder Y", engrenagens: ["Dano", "—"] }, capacidades: ["parte-paredes", "voar", "parte-paredes"] },
      { brawler: "Inventado", funcao: "x", objetivo: "y", quandoAvancar: "", cuidados: [], posicao: { col: 1, linha: 1 } },
      { brawler: "Nori", funcao: "meio", objetivo: "z", quandoAvancar: "", cuidados: [], posicao: { col: 10, linha: 20 }, build: { gadget: "não sei", poderEstelar: "desconhecido", engrenagens: [] } },
    ],
    setas: [
      { brawler: "Nori", tipo: "avanco", de: { col: 10, linha: 20 }, para: { col: 10, linha: 14 } },
      { tipo: "salto", de: { col: 4, linha: 4 }, para: { col: 4, linha: 8 } },
      { tipo: "recuo", de: { col: 4, linha: 12 }, para: { col: 4, linha: 12 } },
      ...Array.from({ length: 20 }, (_, i) => ({ tipo: "rotacao", de: { col: 1, linha: i }, para: { col: 5, linha: i } })),
    ],
    marcadores: [
      { tipo: "emboscada", ponto: { col: 13, linha: 15 }, nota: "Mato do meio.", brawler: "LOU" },
      { tipo: "xpto", ponto: { col: 18, linha: 25 }, nota: "Tipo inválido." },
      { tipo: "perigo", ponto: { col: 3, linha: 3 }, nota: "" },
    ],
  };
  const plano = lerPlanoDaIA(resposta, NOSSOS, DELES, new Date("2026-09-25T12:00:00Z"), terreno);

  it("só entram brawlers da tua equipa, na ordem do draft, com o nome certo", () => {
    expect(plano.ordens.map((o) => o.brawler)).toEqual(["Nori", "Lou"]);
  });

  it("uma posição dentro de uma parede vai para o chão ao lado; as casas viram frações", () => {
    const lou = plano.posicoes[chaveDaFicha("nos", "Lou")];
    expect(tipoDaCasa(terreno, Math.floor(lou.x * 21), Math.floor(lou.y * 33))).toBe("chao");
    expect(plano.posicoes[chaveDaFicha("nos", "Nori")]).toEqual({ x: 10.5 / 21, y: 20.5 / 33 });
  });

  it("os adversários ficam onde estavam: a IA dá ordens à tua equipa, não à outra", () => {
    const iniciais = posicoesIniciais(NOSSOS, DELES);
    for (const nome of DELES) expect(plano.posicoes[chaveDaFicha("eles", nome)]).toEqual(iniciais[chaveDaFicha("eles", nome)]);
  });

  it("\"não sei\" não vira um nome de gadget, e capacidades inventadas ficam de fora", () => {
    const lou = plano.ordens.find((o) => o.brawler === "Lou")!;
    expect(lou.build).toEqual({ gadget: "", poderEstelar: "Poder Y", engrenagens: ["Dano"] });
    expect(lou.capacidades).toEqual(["parte-paredes"]);
    expect(plano.ordens.find((o) => o.brawler === "Nori")!.build).toBeUndefined();
  });

  it("setas: tipo desconhecido vira avanço, sem comprimento não conta, e há um limite", () => {
    expect(plano.setas).toHaveLength(MAXIMO_DE_SETAS);
    expect(plano.setas[0]).toMatchObject({ tipo: "avanco", brawler: "Nori" });
    expect(plano.setas[1].tipo).toBe("avanco");
    expect(plano.setas.some((s) => s.de.x === s.para.x && s.de.y === s.para.y)).toBe(false);
  });

  it("símbolos: o dono é reconhecido, tipo inválido vira alvo, sem nota não entra", () => {
    expect(plano.marcadores.map((m) => [m.tipo, m.brawler ?? null])).toEqual([["emboscada", "Lou"], ["foco", null]]);
  });

  it("quando usar o gadget: fica se a IA disse, sai se disse \"não sei\"; e há símbolo para o sítio", () => {
    const comGadget = lerPlanoDaIA({
      ordens: [
        { brawler: "Lou", funcao: "f", objetivo: "o", quandoAvancar: "", cuidados: [], posicao: { col: 3, linha: 20 }, usarGadget: "No Bolt quando entrar na zona" },
        { brawler: "Nori", funcao: "f", objetivo: "o", quandoAvancar: "", cuidados: [], posicao: { col: 5, linha: 20 }, usarGadget: "não sei" },
      ],
      marcadores: [{ tipo: "gadget", ponto: { col: 10, linha: 12 }, nota: "Gadget no Bolt", brawler: "Lou" }],
    }, NOSSOS, DELES);
    expect(comGadget.ordens.find((o) => o.brawler === "Lou")!.usarGadget).toBe("No Bolt quando entrar na zona");
    expect(comGadget.ordens.find((o) => o.brawler === "Nori")!.usarGadget).toBeUndefined();
    expect(comGadget.marcadores[0]).toMatchObject({ tipo: "gadget", brawler: "Lou" });
  });

  it("previsão e fases vazias são deitadas fora", () => {
    expect(plano.previsao).toEqual(["O Bolt entra pela esquerda."]);
    expect(plano.fases).toEqual([{ nome: "Início", instrucao: "Calma." }]);
    expect(plano.origem).toBe("ia");
  });

  it("uma resposta sem ordens para a tua equipa é um erro, não um plano vazio", () => {
    expect(() => lerPlanoDaIA({ ordens: [{ brawler: "Inventado" }] }, NOSSOS, DELES)).toThrow(/sem ordens/);
    expect(() => lerPlanoDaIA("texto solto", NOSSOS, DELES)).toThrow();
  });
});

describe("água e paredes nas ordens da IA", () => {
  const terreno = lerTerrenoDaImagem(lerPng(pngDoMapa(pintarMapa)), "15000001");
  const naAgua = { col: 15, linha: 2 };
  const plano = lerPlanoDaIA({
    ordens: [
      { brawler: "Lou", funcao: "f", objetivo: "o", quandoAvancar: "", cuidados: [], posicao: naAgua, capacidades: [] },
      { brawler: "Nori", funcao: "f", objetivo: "o", quandoAvancar: "", cuidados: [], posicao: naAgua, capacidades: ["atravessa-agua"] },
    ],
    setas: [
      { brawler: "Lou", tipo: "recuo", de: { col: 15, linha: 8 }, para: naAgua },
      { brawler: "Nori", tipo: "avanco", de: { col: 15, linha: 8 }, para: naAgua },
    ],
    marcadores: [
      { tipo: "agua", ponto: naAgua, nota: "Atravessar aqui", brawler: "Nori" },
      { tipo: "defesa", ponto: naAgua, nota: "Defender", brawler: "Lou" },
      { tipo: "destruir", ponto: { col: 7, linha: 10 }, nota: "Partir", brawler: "Lou" },
    ],
    inimigos: [{ brawler: "bolt", posicao: { col: 7, linha: 10 } }, { brawler: "Inventado", posicao: { col: 1, linha: 1 } }],
  }, NOSSOS, DELES, new Date(), terreno);
  const tipoEm = (ponto: { x: number; y: number }) => tipoDaCasa(terreno, Math.floor(ponto.x * 21), Math.floor(ponto.y * 33));

  it("quem não atravessa água nunca é mandado para a água; quem atravessa pode", () => {
    expect(tipoEm(plano.posicoes[chaveDaFicha("nos", "Lou")])).not.toBe("agua");
    expect(tipoEm(plano.posicoes[chaveDaFicha("nos", "Nori")])).toBe("agua");
    expect(tipoEm(plano.setas.find((s) => s.brawler === "Lou")!.para)).not.toBe("agua");
    expect(tipoEm(plano.setas.find((s) => s.brawler === "Nori")!.para)).toBe("agua");
  });

  it("\"atravessar água\" e \"partir paredes\" ficam onde apontam; os outros símbolos saem da água", () => {
    const [agua, defesa, destruir] = plano.marcadores;
    expect(tipoEm(agua.ponto)).toBe("agua");
    expect(tipoEm(defesa.ponto)).not.toBe("agua");
    expect(tipoEm(destruir.ponto)).toBe("parede");
  });

  it("passos fantasma: só brawlers do draft, sem paredes, 2 casas no mínimo", () => {
    const comTrilhos = lerPlanoDaIA({
      ordens: [{ brawler: "Lou", funcao: "f", objetivo: "o", quandoAvancar: "", cuidados: [], posicao: { col: 3, linha: 20 } }],
      trilhos: [
        { brawler: "lou", pontos: [{ col: 7, linha: 12 }, { col: 7, linha: 10 }, { col: 7, linha: 8 }] },
        { brawler: "BOLT", pontos: [{ col: 3, linha: 3 }, { col: 3, linha: 8 }] },
        { brawler: "Inventado", pontos: [{ col: 1, linha: 1 }, { col: 2, linha: 2 }] },
        { brawler: "Lumi", pontos: [{ col: 1, linha: 1 }] },
      ],
    }, NOSSOS, DELES, new Date(), terreno);
    expect(comTrilhos.trilhos.map((t) => [t.brawler, t.lado, t.pontos.length])).toEqual([["Lou", "nos", 3], ["Bolt", "eles", 2]]);
    expect(comTrilhos.trilhos[0].pontos.every((p) => tipoEm(p) !== "parede")).toBe(true);
  });

  it("a IA pode pôr os adversários onde prevê que vão estar, fora das paredes", () => {
    const bolt = plano.posicoes[chaveDaFicha("eles", "Bolt")];
    expect(bolt).not.toEqual(posicoesIniciais(NOSSOS, DELES)[chaveDaFicha("eles", "Bolt")]);
    expect(tipoEm(bolt)).not.toBe("parede");
    expect(plano.posicoes[chaveDaFicha("eles", "Lumi")]).toEqual(posicoesIniciais(NOSSOS, DELES)[chaveDaFicha("eles", "Lumi")]);
  });
});

describe("builds: só da lista real, com os desenhos", () => {
  const catalogo = lerCatalogo(
    { list: [{ id: 16000030, name: "LOU", gadgets: [{ id: 23000300, name: "Ice Block", imageUrl: "https://cdn.brawlify.com/gadgets/borderless/23000300.png" }], starPowers: [{ id: 23000301, name: "Supercool", imageUrl: "https://evil.example/x.png" }] }] },
    { list: [{ id: 62000002, name: "Damage" }, { id: 62000000, name: "Speed" }] },
    "brawlify",
  );

  it("lê a lista e só aceita desenhos do CDN da Brawlify", () => {
    expect(catalogo.brawlers.lou.gadgets[0]).toEqual({ id: 23000300, nome: "Ice Block", imagem: "https://cdn.brawlify.com/gadgets/borderless/23000300.png" });
    expect(catalogo.brawlers.lou.poderes[0].imagem).toBe("https://cdn.brawlify.com/star-powers/borderless/23000301.png");
    expect(catalogo.engrenagens[0].imagem).toBe("https://cdn.brawlify.com/gears/regular/62000002.png");
    expect(imagemSegura("javascript:alert(1)")).toBeNull();
  });

  it("um nome fora da lista sai; o que está fica com o nome certo e o desenho; sem lista, a build sai toda", () => {
    const plano = lerPlanoDaIA({ ordens: [
      { brawler: "Lou", funcao: "f", objetivo: "o", quandoAvancar: "", cuidados: [], posicao: { col: 3, linha: 20 }, build: { gadget: "ice block", poderEstelar: "Poder Inventado", engrenagens: ["damage", "Asas"] } },
      { brawler: "Nori", funcao: "f", objetivo: "o", quandoAvancar: "", cuidados: [], posicao: { col: 5, linha: 20 }, build: { gadget: "Qualquer", poderEstelar: "Outro", engrenagens: [] } },
    ] }, NOSSOS, DELES);
    conferirBuilds(plano, catalogo);
    expect(plano.ordens.find((o) => o.brawler === "Lou")!.build).toEqual({
      gadget: "Ice Block",
      poderEstelar: "",
      engrenagens: ["Damage"],
      imagens: { gadget: "https://cdn.brawlify.com/gadgets/borderless/23000300.png", poderEstelar: null, engrenagens: ["https://cdn.brawlify.com/gears/regular/62000002.png"] },
    });
    expect(plano.ordens.find((o) => o.brawler === "Nori")!.build).toBeUndefined();
  });

  it("a lista vai no pedido, para a IA escolher em vez de inventar", () => {
    const texto = textoDoPedido(pedido, false, null, null, new Date(), opcoesDeBuild(catalogo, NOSSOS));
    expect(texto).toContain("- Lou: gadgets [Ice Block]; poderes estelares [Supercool]");
    expect(texto).toContain("- Nori: (sem lista)");
    expect(texto).toContain("Engrenagens: [Damage | Speed]");
    expect(texto).toContain("20 SEGUNDOS");
  });

  it("um plano guardado não traz desenhos de outros endereços", () => {
    const guardado = JSON.stringify({ ordens: [{ brawler: "Lou", funcao: "x", objetivo: "y", cuidados: [], build: { gadget: "Ice Block", poderEstelar: "", engrenagens: [], imagens: { gadget: "javascript:alert(1)", engrenagens: ["https://cdn.brawlify.com/gears/regular/1.png"] } } }] });
    expect(lerPlanoGuardado(guardado, NOSSOS, DELES).ordens[0].build?.imagens).toEqual({ gadget: null, poderEstelar: null, engrenagens: ["https://cdn.brawlify.com/gears/regular/1.png"] });
  });
});

describe("o plano guardado no navegador", () => {
  it("um plano estragado dá o plano de partida, sem erro", () => {
    expect(lerPlanoGuardado("{não é json", NOSSOS, DELES).posicoes).toEqual(posicoesIniciais(NOSSOS, DELES));
    expect(lerPlanoGuardado(null, NOSSOS, DELES).setas).toEqual([]);
  });

  it("só fica o que ainda é deste draft, e fontes só em https", () => {
    const guardado = JSON.stringify({
      ordens: [{ brawler: "Lou", funcao: "x", objetivo: "y", cuidados: [] }, { brawler: "Shelly", funcao: "x", objetivo: "y", cuidados: [] }],
      posicoes: { [chaveDaFicha("nos", "Lou")]: { x: 5, y: -1 } },
      marcadores: [{ id: "1", tipo: "flanco", ponto: { x: 0.2, y: 0.2 }, nota: "ok" }, { id: "2", tipo: "bomba", ponto: { x: 0.2, y: 0.2 }, nota: "x" }],
      fontes: [{ titulo: "boa", url: "https://exemplo.pt" }, { titulo: "má", url: "javascript:alert(1)" }],
      origem: "ia",
    });
    const plano = lerPlanoGuardado(guardado, NOSSOS, DELES);
    expect(plano.ordens.map((o) => o.brawler)).toEqual(["Lou"]);
    expect(plano.ordens[0].quandoAvancar).toBe("");
    expect(plano.posicoes[chaveDaFicha("nos", "Lou")]).toEqual({ x: 0.97, y: 0.03 });
    expect(plano.marcadores.map((m) => m.tipo)).toEqual(["flanco"]);
    expect(plano.fontes).toEqual([{ titulo: "boa", url: "https://exemplo.pt" }]);
  });
});

const pedido: PedidoDePlano = {
  mapa: "Belle's Rock",
  modoId: "knockout",
  mapaId: "15000368",
  nossos: NOSSOS.map((brawler) => ({ brawler, funcao: funcao() })),
  deles: DELES.map((brawler) => ({ brawler, funcao: funcao() })),
  duelos: [{ nosso: "Lou", deles: "Bolt", vantagem: 61.4 }],
  nosNome: "Azul",
  numeros: [{ brawler: "Lou", lado: "nos", vitoria: 54.25, uso: null }],
  dadosDe: "2026-09-25T05:02:00Z",
  elo: "Mythic",
};

describe("o pedido à IA leva o jogo de hoje", () => {
  const terreno = lerTerrenoDaImagem(lerPng(pngDoMapa(pintarMapa)), "15000001");

  it("diz a data de hoje, os números atuais do site e a grelha do mapa", () => {
    const texto = textoDoPedido(pedido, true, terreno, { texto: "Lou: congela.", fontes: [] }, new Date("2026-09-25T12:00:00Z"));
    expect(texto).toContain("HOJE É 2026-09-25");
    expect(texto).toContain("Lou (nosso): vitória 54.3%, uso —");
    expect(texto).toContain("(elo: Mythic), recolhidos em 2026-09-25");
    expect(texto).toContain("INFORMAÇÃO ATUAL pesquisada hoje na web");
    expect(texto).toContain("Lou: congela.");
    expect(texto).toContain("10 .....#####.........");
    expect(texto).toContain("Lou contra Bolt: 61% para nós");
  });

  it("sem pesquisa, a IA é avisada para não afirmar o que não sabe se ainda é assim", () => {
    expect(textoDoPedido(pedido, false, null, null)).toContain("Não foi possível pesquisar informação atual");
  });
});

/* ------------------------------------------------------------------------ *
 * O servidor a falar com a Gemini: uma Gemini falsa, com os pedidos anotados.
 * ------------------------------------------------------------------------ */
type Resposta = { status: number; corpo?: unknown };
/**
 * Uma Gemini falsa. `plano` diz o que cada modelo responde, por ordem de
 * tentativa ("modelo" ou "modelo:livre" para o pedido sem formato estrito).
 */
function geminiFalsa(config: {
  modelos?: string[];
  plano?: Record<string, Resposta>;
  pesquisa?: Record<string, Resposta>;
}) {
  const modelos = config.modelos ?? ["gemini-3-flash"];
  const pedidos: Array<{ url: string; headers: Record<string, string>; corpo: any }> = [];
  const buscar = (async (url: string, init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    pedidos.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, corpo });
    const json = (r: Resposta) => new Response(JSON.stringify(r.corpo ?? {}), { status: r.status, headers: { "content-type": "application/json" } });
    if (url.includes("/models?")) return json({ status: 200, corpo: { models: modelos.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ["generateContent"] })) } });
    if (url.includes("cdn.brawlify.com")) return new Response(null, { status: 404 });
    const modelo = decodeURIComponent(/models\/([^:]+):generateContent/.exec(url)![1]);
    if (corpo?.tools) {
      return json(config.pesquisa?.[modelo] ?? { status: 200, corpo: { candidates: [{ content: { parts: [{ text: "Lou: congela." }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://fonte.pt/lou", title: "Lou hoje" } }, { web: { uri: "http://inseguro", title: "x" } }] } }] } });
    }
    const chave = corpo.generationConfig.responseSchema ? modelo : `${modelo}:livre`;
    return json(config.plano?.[chave] ?? { status: 200, corpo: { candidates: [{ content: { parts: [{ text: JSON.stringify(planoMinimo) }] } }] } });
  }) as typeof fetch;
  const geracoes = () => pedidos.filter((p) => p.corpo && !p.corpo.tools).map((p) => `${/models\/([^:]+):/.exec(p.url)![1]}${p.corpo.generationConfig.responseSchema ? "" : ":livre"}`);
  return { pedidos, buscar, geracoes };
}

const erroGoogle = (status: number, estado: string, mensagem: string): Resposta => ({ status, corpo: { error: { code: status, status: estado, message: mensagem } } });
const planoMinimo = { resumo: "r", condicaoDeVitoria: "c", previsao: [], fases: [], ordens: [{ brawler: "Lou", funcao: "f", objetivo: "o", quandoAvancar: "", cuidados: [], posicao: { col: 3, linha: 20 } }], setas: [], marcadores: [] };

async function comChave<T>(fazer: () => Promise<T>) {
  process.env.GEMINI_API_KEY = "chave-de-teste-123";
  try {
    return await fazer();
  } finally {
    delete process.env.GEMINI_API_KEY;
  }
}
// Cada teste usa uma chave "nova" para a lista de modelos não vir da memória do anterior.
let contador = 0;
async function pedirCom(config: Parameters<typeof geminiFalsa>[0]) {
  const falsa = geminiFalsa(config);
  process.env.GEMINI_API_KEY = `chave-de-teste-${++contador}`;
  try {
    return { falsa, resultado: await pedirPlanoAoGeneral({ ...pedido, mapaId: null }, falsa.buscar).then((r) => ({ ok: r }), (erro: Error) => ({ erro })) };
  } finally {
    delete process.env.GEMINI_API_KEY;
  }
}

describe("a IA no servidor", () => {
  it("ordena os modelos: flash estáveis do mais recente, antevisões, e os lite no fim; nada de imagem", () => {
    const lista = ["gemini-2.5-flash", "gemini-3-flash", "gemini-3-flash-lite", "gemini-3-flash-image", "gemini-3-pro", "gemini-3.1-flash-preview"].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ["generateContent"] }));
    expect(ordenarModelos(lista)).toEqual(["gemini-3-flash", "gemini-2.5-flash", "gemini-3.1-flash-preview", "gemini-3-flash-lite"]);
    expect(escolherModelo(lista)).toBe("gemini-3-flash");
    expect(escolherModelo([{ name: "models/embedding", supportedGenerationMethods: ["embedContent"] }])).toBeNull();
  });

  it("pesquisa primeiro a atualidade, depois planeia; a chave vai no cabeçalho, nunca no endereço", async () => {
    await comChave(async () => {
      const { pedidos, buscar } = geminiFalsa({});
      const resultado = await pedirPlanoAoGeneral({ ...pedido, mapaId: null }, buscar);
      const aGoogle = pedidos.filter((p) => p.url.includes("googleapis"));
      expect(aGoogle.every((p) => p.headers["x-goog-api-key"] === "chave-de-teste-123" && !p.url.includes("chave-de-teste"))).toBe(true);
      const geracoes = aGoogle.filter((p) => p.corpo);
      expect(geracoes[0].corpo.tools).toEqual([{ google_search: {} }]);
      expect(geracoes[1].corpo.generationConfig.responseSchema).toBeTruthy();
      expect(geracoes[1].corpo.contents[0].parts[0].text).toContain("Lou: congela.");
      expect(resultado.comPesquisa).toBe(true);
      expect(resultado.plano.fontes).toEqual([{ titulo: "Lou hoje", url: "https://fonte.pt/lou" }]);
      expect(resultado.plano.ordens[0].brawler).toBe("Lou");
    });
  });

  it("erro interno com o formato estrito: repete no mesmo modelo sem ele, com a forma escrita no pedido", async () => {
    const { falsa, resultado } = await pedirCom({ plano: { "gemini-3-flash": erroGoogle(500, "INTERNAL", "An internal error has occurred.") } });
    expect("ok" in resultado).toBe(true);
    expect(falsa.geracoes()).toEqual(["gemini-3-flash", "gemini-3-flash:livre"]);
    const livre = falsa.pedidos.filter((p) => p.corpo && !p.corpo.tools).at(-1)!;
    expect(livre.corpo.contents[0].parts.at(-1).text).toContain('"ordens":[{"brawler"');
  });

  it("modelo sobrecarregado: passa ao seguinte", async () => {
    const { falsa, resultado } = await pedirCom({
      modelos: ["gemini-3-flash", "gemini-2.5-flash"],
      plano: { "gemini-3-flash": erroGoogle(503, "UNAVAILABLE", "The model is overloaded. Please try again later.") },
    });
    expect("ok" in resultado && resultado.ok.modelo).toBe("gemini-2.5-flash");
    expect(falsa.geracoes()).toEqual(["gemini-3-flash", "gemini-2.5-flash"]);
  });

  it("quando todos falham, a mensagem diz o que a Google respondeu a cada modelo", async () => {
    const { resultado } = await pedirCom({
      modelos: ["gemini-3-flash", "gemini-2.5-flash"],
      plano: {
        "gemini-3-flash": erroGoogle(503, "UNAVAILABLE", "The model is overloaded."),
        "gemini-2.5-flash": erroGoogle(500, "INTERNAL", "An internal error has occurred."),
        "gemini-2.5-flash:livre": erroGoogle(500, "INTERNAL", "An internal error has occurred."),
      },
    });
    const mensagem = "erro" in resultado ? resultado.erro.message : "";
    expect(mensagem).toContain("gemini-3-flash: 503 UNAVAILABLE: The model is overloaded.");
    expect(mensagem).toContain("gemini-2.5-flash: 500 INTERNAL");
  });

  it("só limites (429) em todos: diz que é o limite gratuito", async () => {
    const { resultado } = await pedirCom({ plano: { "gemini-3-flash": erroGoogle(429, "RESOURCE_EXHAUSTED", "Quota exceeded.") } });
    expect("erro" in resultado && resultado.erro.message).toMatch(/limite gratuito.*Quota exceeded/);
  });

  it("chave recusada pára logo: nenhum outro modelo a vai aceitar", async () => {
    const { falsa, resultado } = await pedirCom({
      modelos: ["gemini-3-flash", "gemini-2.5-flash"],
      plano: { "gemini-3-flash": erroGoogle(403, "PERMISSION_DENIED", "Denied.") },
    });
    expect("erro" in resultado && resultado.erro.message).toMatch(/recusou a chave/);
    expect(falsa.geracoes()).toEqual(["gemini-3-flash"]);
  });

  it("a pesquisa com limite num modelo tenta o seguinte; se nenhum pesquisar, o plano segue sem ela", async () => {
    const umFalha = await pedirCom({ modelos: ["gemini-3-flash", "gemini-2.5-flash"], pesquisa: { "gemini-3-flash": erroGoogle(429, "RESOURCE_EXHAUSTED", "Search quota.") } });
    expect("ok" in umFalha.resultado && umFalha.resultado.ok.comPesquisa).toBe(true);
    const todas = await pedirCom({ pesquisa: { "gemini-3-flash": erroGoogle(429, "RESOURCE_EXHAUSTED", "Search quota.") } });
    expect("ok" in todas.resultado && todas.resultado.ok.comPesquisa).toBe(false);
    expect(await pesquisarAtualidade("k", ["gemini-3-flash"], pedido, geminiFalsa({ pesquisa: { "gemini-3-flash": erroGoogle(400, "INVALID_ARGUMENT", "no") } }).buscar)).toBeNull();
  });

  it("sem chave, diz onde a criar", async () => {
    await expect(pedirPlanoAoGeneral(pedido, geminiFalsa({}).buscar)).rejects.toThrow(/aistudio\.google\.com/);
  });
});

describe("o que é só do dono", () => {
  const rotas = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const general = rotas.slice(rotas.indexOf("general: router({"), rotas.indexOf("draftRoles: router({"));

  it("chave, plano e correções exigem o dono; o terreno é público", () => {
    for (const nome of ["estado", "guardarChave", "pedirPlano", "corrigirTerreno", "rotularTerreno"]) {
      const bloco = general.slice(general.indexOf(`${nome}:`));
      const corpo = bloco.slice(0, bloco.indexOf("}),") + 3);
      expect(corpo, nome).toContain("protectedProcedure");
      expect(corpo, nome).toContain("exigirDono(ctx");
    }
    expect(general).toContain("terreno: publicProcedure");
  });

  it("a chave nunca volta ao navegador: só existe, a origem e os últimos quatro", () => {
    const estado = general.slice(general.indexOf("estado:"), general.indexOf("guardarChave:"));
    expect(estado).toContain("hint: key ? `····${key.slice(-4)}` : null");
    expect(estado).not.toMatch(/key,\s*origin,|return \{ key/);
  });

  it("o servidor só vai buscar imagens da Brawlify por id numérico", () => {
    const rota = readFileSync(resolve(process.cwd(), "server/_core/imagensDaBrawlify.ts"), "utf8");
    expect(rota).toContain("idDeImagemValido(id)");
    for (const entrada of ["server/_core/index.ts", "server/_core/index.vercel.ts"]) {
      expect(readFileSync(resolve(process.cwd(), entrada), "utf8"), entrada).toContain("registarImagensDaBrawlify(app)");
    }
  });
});
