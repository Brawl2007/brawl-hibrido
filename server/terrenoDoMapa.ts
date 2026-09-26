/**
 * Lê o terreno de um mapa a partir da imagem publicada pela Brawlify.
 *
 * Ver `shared/terrenoDoMapa.ts` para o que se lê e porquê. Aqui fica o como:
 * a imagem tem 21×33 casas e uma casa de margem à volta; de cada casa conta o
 * miolo (o centro, sem as bordas, que têm a sombra do vizinho). O chão é o
 * xadrez: a cor que mais se repete nas casas pares e a que mais se repete nas
 * ímpares.
 *
 * O resultado fica guardado na base de dados por mapa: uma imagem lê-se uma
 * vez, e os visitantes recebem já feito.
 */
import {
  COLUNAS_DO_MAPA,
  LINHAS_DO_MAPA,
  aplicarRotulos,
  corrigirCasas,
  rotularPorRegra,
  terrenoValido,
  type GrupoDeCor,
  type TerrenoDoMapa,
} from "@shared/terrenoDoMapa";
import { getSetting, setSetting } from "./appSettings";
import { lerPng, type ImagemRGBA } from "./png";

/** Um grupo novo nasce quando a cor fica a mais do que isto de todos os que já existem. */
const DISTANCIA_DE_GRUPO = 45;
/** Uma casa a menos do que isto da cor do xadrez é chão. */
const DISTANCIA_DE_CHAO = 30;
const MAXIMO_DE_GRUPOS = 16;
const PESO_DA_TEXTURA = 1.5;
/**
 * Os círculos de partida, as zonas e as balizas são desenhados com o mesmo
 * vermelho e o mesmo azul em todos os temas. Uma casa com pelo menos esta
 * fração de píxeis dessas cores é objetivo, seja qual for o chão por baixo.
 */
const FRACAO_DE_ANEL = 0.07;
const FRACAO_DE_ANEL_VIZINHO = 0.015;
const FRACAO_DE_ANEL_NA_PONTA = 0.04;
/**
 * Um objeto azul maciço com desenho (não liso como a água): a estrela do
 * Caça-Estrelas, que se apanha — objetivo, não parede. A casa de baixo é a
 * sombra dela.
 */
const FRACAO_DE_OBJETO_AZUL = 0.5;
/** Uma casa com mais do que isto de vermelho está pintada por inteiro: é um vaso ou uma flor, não a linha de um anel. */
const FRACAO_MACICA = 0.3;
const MAXIMO_DE_OBJETO_VERMELHO = 6;
/** Abaixo disto uma casa é lisa: enchimento de círculo, não uma parede. */
const TEXTURA_DE_ENCHIMENTO = 6;
const ID_DE_OBJETIVO = "0";
/**
 * Água: a casa inteira pintada do azul claro da água, lisa. É o mesmo azul dos
 * anéis de partida — mas um anel é uma linha fina, a água enche a casa.
 */
const FRACAO_DE_AGUA = 0.6;
const ID_DE_AGUA = "1";
/**
 * Zona (Zona Estratégica): um disco azulado translúcido de 5 a 8 casas de
 * diâmetro, pintado por cima do chão. Lido pela forma — redondo, liso e azul —
 * porque a cor muda com o chão por baixo. Tudo o que está dentro do disco
 * (menos o mato) fica chão de objetivo: antes, o disco era lido como água e o
 * contorno como paredes, e apareciam blocos invisíveis.
 */
const ID_DE_ZONA = "2";
/** Jarros, vasos e barris soltos (ver `marcarJarros`). */
const ID_DE_JARRO = "3";
const azulado = (cor: readonly number[]) => cor[2] - cor[0] > 70 && cor[1] - cor[0] > 40;
const anelVermelho = (r: number, g: number, b: number) => r > 190 && g < 95 && b < 110;
const anelAzul = (r: number, g: number, b: number) => b > 215 && r < 70 && g > 120 && g < 185;
const LETRAS = "abcdefghijklmnopqrstuvwxyz";

type Cor = [number, number, number];
const distancia = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export type MedidaDaCasa = {
  cor: Cor;
  textura: number;
  /** Fração de píxeis do vermelho ou do azul dos anéis. */
  anel: number;
  vermelho: number;
  azul: number;
  /** Os píxeis que não são de anel: numa casa de anel são o chão; num vaso vermelho, a parede. */
  resto: { cor: Cor; textura: number };
  /**
   * A cor da faixa de cima da casa. Os objetos altos (postes, jarros) são
   * desenhados a subir para a casa de cima: essa casa tem chão em cima e o
   * topo do objeto em baixo — não é um bloco.
   */
  topo?: Cor;
  /** Variação de brilho da faixa de cima: o chão é liso (0), o topo de uma parede tem contornos. */
  texturaDoTopo?: number;
  /** A cor da faixa de baixo: as pontas das folhas do mato de baixo aparecem aqui. */
  fundo?: Cor;
};

/** Cor média e variação de brilho do miolo de cada casa (sem as bordas, que têm a sombra do vizinho). */
export function medirCasas(imagem: ImagemRGBA, casa = imagem.largura / (COLUNAS_DO_MAPA + 2)): MedidaDaCasa[] {
  const margemInterna = Math.round(casa * 0.2);
  const medidas: MedidaDaCasa[] = [];
  for (let linha = 0; linha < LINHAS_DO_MAPA; linha++) {
    for (let coluna = 0; coluna < COLUNAS_DO_MAPA; coluna++) {
      const x0 = (coluna + 1) * casa + margemInterna, y0 = (linha + 1) * casa + margemInterna;
      const x1 = (coluna + 2) * casa - margemInterna, y1 = (linha + 2) * casa - margemInterna;
      let r = 0, g = 0, b = 0, n = 0, soma = 0, soma2 = 0, vermelho = 0, azul = 0;
      let rr = 0, rg = 0, rb = 0, rn = 0, rsoma = 0, rsoma2 = 0;
      let tr = 0, tg = 0, tb = 0, tn = 0, ts = 0, ts2 = 0;
      let fr = 0, fg = 0, fb = 0, fn = 0;
      for (let y = (linha + 2) * casa - Math.round(casa * 0.33); y < (linha + 2) * casa - 2; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * imagem.largura + x) * 4;
          fr += imagem.dados[o]; fg += imagem.dados[o + 1]; fb += imagem.dados[o + 2]; fn++;
        }
      }
      // A faixa de cima: do topo da casa (sem a borda) até um terço da altura.
      const yTopo0 = linha + 1, yTopo1 = (linha + 1) * casa + Math.round(casa * 0.33);
      for (let y = (yTopo0) * casa + 2; y < yTopo1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * imagem.largura + x) * 4;
          tr += imagem.dados[o]; tg += imagem.dados[o + 1]; tb += imagem.dados[o + 2]; tn++;
          const brilho = 0.3 * imagem.dados[o] + 0.59 * imagem.dados[o + 1] + 0.11 * imagem.dados[o + 2];
          ts += brilho; ts2 += brilho * brilho;
        }
      }
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * imagem.largura + x) * 4;
          const pr = imagem.dados[o], pg = imagem.dados[o + 1], pb = imagem.dados[o + 2];
          r += pr; g += pg; b += pb; n++;
          const brilho = 0.3 * pr + 0.59 * pg + 0.11 * pb;
          soma += brilho; soma2 += brilho * brilho;
          if (anelVermelho(pr, pg, pb)) vermelho++;
          else if (anelAzul(pr, pg, pb)) azul++;
          else {
            rr += pr; rg += pg; rb += pb; rn++;
            rsoma += brilho; rsoma2 += brilho * brilho;
          }
        }
      }
      const media = soma / n;
      const rmedia = rn ? rsoma / rn : 0;
      medidas.push({
        cor: [r / n, g / n, b / n],
        textura: Math.sqrt(Math.max(0, soma2 / n - media * media)),
        anel: (vermelho + azul) / n,
        vermelho: vermelho / n,
        azul: azul / n,
        resto: rn
          ? { cor: [rr / rn, rg / rn, rb / rn], textura: Math.sqrt(Math.max(0, rsoma2 / rn - rmedia * rmedia)) }
          : { cor: [0, 0, 0], textura: 0 },
        topo: tn ? [tr / tn, tg / tn, tb / tn] : undefined,
        texturaDoTopo: tn ? Math.sqrt(Math.max(0, ts2 / tn - (ts / tn) ** 2)) : undefined,
        fundo: fn ? [fr / fn, fg / fn, fb / fn] : undefined,
      });
    }
  }
  return medidas;
}

export function lerTerrenoDaImagem(imagem: ImagemRGBA, mapaId: string): TerrenoDoMapa {
  const casa = imagem.largura / (COLUNAS_DO_MAPA + 2);
  if (!Number.isInteger(casa) || casa < 8 || Math.abs(imagem.altura / (LINHAS_DO_MAPA + 2) - casa) > 0.01) {
    throw new Error(`A imagem tem ${imagem.largura}×${imagem.altura}: não é um mapa de 21×33 casas.`);
  }
  return terrenoDasMedidas(medirCasas(imagem, casa), mapaId);
}

/** O terreno a partir das medidas de cada casa (separado da imagem para se poder afinar com medidas guardadas). */
export function terrenoDasMedidas(medidas: readonly MedidaDaCasa[], mapaId: string): TerrenoDoMapa {
  // O xadrez do chão: a cor mais repetida em cada paridade.
  const chao = [0, 1].map((paridade) => {
    const contagem = new Map<string, { n: number; cor: Cor }>();
    medidas.forEach((medida, i) => {
      if (((i % COLUNAS_DO_MAPA) + Math.floor(i / COLUNAS_DO_MAPA)) % 2 !== paridade) return;
      const chave = medida.cor.map((v) => Math.round(v / 6)).join(",");
      const atual = contagem.get(chave) ?? { n: 0, cor: medida.cor };
      atual.n++;
      contagem.set(chave, atual);
    });
    return Array.from(contagem.values()).sort((a, b) => b.n - a.n)[0]?.cor ?? [0, 0, 0];
  });

  // Anéis: só contam em manchas de pelo menos 3 casas seguidas. Uma flor
  // vermelha num cacto é uma casa sozinha; uma base, uma zona ou uma baliza não.
  // Só o azul: uma casa toda vermelha é um objeto (vasos, flores), nunca água.
  const eAgua = medidas.map((medida) => medida.azul >= FRACAO_DE_AGUA && medida.textura < 14);
  // Nas duas linhas das pontas ficam os círculos de partida: aí basta menos
  // anel (o azul de baixo do Hard Rock Mine tem só 6% por casa).
  const naPontaDoMapa = (i: number) => Math.floor(i / COLUNAS_DO_MAPA) <= 1 || Math.floor(i / COLUNAS_DO_MAPA) >= LINHAS_DO_MAPA - 2;
  const temAnel = medidas.map((medida, i) => medida.anel >= (naPontaDoMapa(i) ? FRACAO_DE_ANEL_NA_PONTA : FRACAO_DE_ANEL) && !eAgua[i]);
  const emMancha = new Array<boolean>(medidas.length).fill(false);
  const visto = new Array<boolean>(medidas.length).fill(false);
  for (let inicio = 0; inicio < medidas.length; inicio++) {
    if (!temAnel[inicio] || visto[inicio]) continue;
    const mancha = [inicio];
    visto[inicio] = true;
    for (let k = 0; k < mancha.length; k++) {
      const i = mancha[k], coluna = i % COLUNAS_DO_MAPA, linha = Math.floor(i / COLUNAS_DO_MAPA);
      for (const [dc, dl] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const c = coluna + dc, l = linha + dl, j = l * COLUNAS_DO_MAPA + c;
        // A mancha cresce para vizinhos com um pouco de anel: entre dois círculos de partida há pouco.
        if (c < 0 || l < 0 || c >= COLUNAS_DO_MAPA || l >= LINHAS_DO_MAPA || visto[j] || eAgua[j] || medidas[j].anel < FRACAO_DE_ANEL_VIZINHO) continue;
        visto[j] = true;
        mancha.push(j);
      }
    }
    // Vasos e flores vermelhas numa parede (o Hideout tem três seguidos): a casa
    // é vermelho MACIÇO (~40%), e um anel é uma linha fina (5 a 20%). Uma
    // mancha curta toda maciça é um objeto, não um anel.
    // Nas duas linhas das pontas, vermelho maciço é a rede da baliza ou o enchimento da base: objetivo.
    const naPonta = mancha.every((i) => Math.floor(i / COLUNAS_DO_MAPA) <= 1 || Math.floor(i / COLUNAS_DO_MAPA) >= LINHAS_DO_MAPA - 2);
    const objetoVermelho = !naPonta && mancha.length <= MAXIMO_DE_OBJETO_VERMELHO && mancha.every((i) => medidas[i].vermelho >= FRACAO_MACICA);
    if (mancha.length >= 3 && !objetoVermelho) for (const i of mancha) emMancha[i] = true;
  }
  // O enchimento dos círculos de partida: casas lisas (sem contornos, que as
  // paredes têm sempre) encostadas a um anel. Sem isto apareciam blocos dentro
  // da base — nas bases a meio do mapa, como no Fute-Brawl.
  for (let passagem = 0; passagem < 2; passagem++) {
    const novos: number[] = [];
    medidas.forEach((medida, i) => {
      if (emMancha[i] || eAgua[i] || medida.textura >= TEXTURA_DE_ENCHIMENTO) return;
      const coluna = i % COLUNAS_DO_MAPA, linha = Math.floor(i / COLUNAS_DO_MAPA);
      const encostada = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dc, dl]) => {
        const c = coluna + dc, l = linha + dl;
        return c >= 0 && l >= 0 && c < COLUNAS_DO_MAPA && l < LINHAS_DO_MAPA && emMancha[l * COLUNAS_DO_MAPA + c];
      });
      if (encostada) novos.push(i);
    });
    for (const i of novos) emMancha[i] = true;
  }

  const eChao = medidas.map((medida, i) => distancia(medida.cor, chao[((i % COLUNAS_DO_MAPA) + Math.floor(i / COLUNAS_DO_MAPA)) % 2]) < DISTANCIA_DE_CHAO);
  const azulMacico = (i: number) => !eAgua[i] && !emMancha[i] && medidas[i].azul >= FRACAO_DE_OBJETO_AZUL && medidas[i].textura >= 14;
  const encostadaAAgua = (i: number) => {
    const c = i % COLUNAS_DO_MAPA, l = Math.floor(i / COLUNAS_DO_MAPA);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dl]) => {
      const cc = c + dc, ll = l + dl;
      return cc >= 0 && ll >= 0 && cc < COLUNAS_DO_MAPA && ll < LINHAS_DO_MAPA && eAgua[ll * COLUNAS_DO_MAPA + cc];
    });
  };
  // A borda de uma piscina (azul com o desenho da margem) é água como o resto dela.
  // (Com folhas por cima, como as esquinas das piscinas do Kaboom Canyon, a borda é lisa ou não — basta muito azul.)
  for (let i = 0; i < medidas.length; i++) if (!eAgua[i] && !emMancha[i] && medidas[i].azul >= 0.4 && encostadaAAgua(i)) eAgua[i] = true;
  const objetoAzul = medidas.map((_, i) => azulMacico(i));
  // A sombra do objeto azul, na casa de baixo, também é dele (se não for chão nem outra coisa encostada).
  for (let i = 0; i + COLUNAS_DO_MAPA < medidas.length; i++) {
    const j = i + COLUNAS_DO_MAPA;
    if (objetoAzul[i] && !eChao[j] && !eAgua[j] && !emMancha[j] && medidas[j].azul < FRACAO_DE_OBJETO_AZUL) objetoAzul[j] = true;
  }
  const naZona = zonasPelaForma(medidas, eChao, eAgua);

  // O resto junta-se por cor. O centro de cada grupo é a média do que já entrou.
  type Acumulado = { id: string; soma: Cor; casas: number; textura: number };
  const grupos: Acumulado[] = [];
  const letras: string[] = [];
  let objetivos = 0, aguas = 0, zonas = 0;
  medidas.forEach((medida, i) => {
    if (eChao[i]) {
      letras.push(".");
      return;
    }
    if (eAgua[i]) {
      letras.push(ID_DE_AGUA);
      aguas++;
      return;
    }
    if (naZona[i]) {
      letras.push(ID_DE_ZONA);
      zonas++;
      return;
    }
    if (emMancha[i] || objetoAzul[i]) {
      letras.push(ID_DE_OBJETIVO);
      objetivos++;
      return;
    }
    const centro = (grupo: Acumulado) => grupo.soma.map((v) => v / grupo.casas);
    let melhor: Acumulado | undefined;
    let melhorDistancia = Infinity;
    for (const grupo of grupos) {
      // A textura conta: no tema roxo, o mato e a água têm quase a mesma cor,
      // mas a água é lisa e o mato tem folhas.
      const d = distancia(centro(grupo), medida.cor) + PESO_DA_TEXTURA * Math.abs(grupo.textura / grupo.casas - medida.textura);
      if (d < melhorDistancia) { melhor = grupo; melhorDistancia = d; }
    }
    if (!melhor || (melhorDistancia > DISTANCIA_DE_GRUPO && grupos.length < MAXIMO_DE_GRUPOS)) {
      melhor = { id: LETRAS[grupos.length], soma: [0, 0, 0], casas: 0, textura: 0 };
      grupos.push(melhor);
    }
    melhor.soma = [melhor.soma[0] + medida.cor[0], melhor.soma[1] + medida.cor[1], melhor.soma[2] + medida.cor[2]];
    melhor.casas++;
    melhor.textura += medida.textura;
    letras.push(melhor.id);
  });

  const grelha = letras.join("");
  const semTipo: Array<Omit<GrupoDeCor, "tipo">> = grupos.map((grupo) => ({
    id: grupo.id,
    cor: grupo.soma.map((v) => Math.round(v / grupo.casas)) as Cor,
    casas: grupo.casas,
    textura: Math.round((grupo.textura / grupo.casas) * 10) / 10,
  }));
  const rotulados = rotularPorRegra(semTipo, grelha);
  const semTopos = anelDosObjetivos(tirarTopos(grelha, rotulados, medidas, chao), rotulados, medidas);
  for (const grupo of rotulados) grupo.casas = contar(semTopos, grupo.id);
  const { grelha: comJarros, jarros } = marcarJarros(semTopos, rotulados, medidas);
  objetivos = contar(comJarros, ID_DE_OBJETIVO);
  if (objetivos) rotulados.push({ id: ID_DE_OBJETIVO, cor: [40, 150, 230], casas: objetivos, textura: 0, tipo: "objetivo" });
  if (aguas) rotulados.push({ id: ID_DE_AGUA, cor: [70, 180, 240], casas: aguas, textura: 0, tipo: "agua" });
  if (zonas) rotulados.push({ id: ID_DE_ZONA, cor: [35, 100, 160], casas: zonas, textura: 0, tipo: "objetivo" });
  if (jarros) {
    for (const grupo of rotulados) grupo.casas = contar(comJarros, grupo.id);
    rotulados.push({ id: ID_DE_JARRO, cor: [200, 110, 80], casas: jarros, textura: 0, tipo: "destrutivel" });
  }
  return { mapaId, colunas: COLUNAS_DO_MAPA, linhas: LINHAS_DO_MAPA, grelha: comJarros, grupos: rotulados.filter((g) => g.casas > 0), rotulado: "regra" };
}

const contar = (grelha: string, id: string) => grelha.split(id).length - 1;

/**
 * A casa é só a mistura de duas cores (o chão em cima, as folhas em baixo)?
 * Uma cerca de madeira com folhas por baixo não é: a madeira fica fora da mistura.
 */
function soMistura(media: readonly number[], a: readonly number[], b: readonly number[]) {
  const d = a.map((v, k) => v - b[k]);
  const t = Math.max(0, Math.min(1, (d[0] * (media[0] - b[0]) + d[1] * (media[1] - b[1]) + d[2] * (media[2] - b[2])) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1)));
  return distancia(media, b.map((v, k) => v + t * d[k])) < 20;
}

/** Chão, ou chão à sombra: a cor do xadrez escurecida por igual nos três canais. */
function chaoOuSombra(cor: readonly number[], doChao: readonly number[]) {
  const k = (cor[0] * doChao[0] + cor[1] * doChao[1] + cor[2] * doChao[2]) / (doChao[0] ** 2 + doChao[1] ** 2 + doChao[2] ** 2);
  return k > 0.55 && k < 1.05 && distancia(cor, doChao.map((v) => v * k)) < 10;
}

/**
 * O topo dos objetos altos. A Brawlify desenha paredes, postes, jarros e mato
 * meia casa acima do sítio onde estão; a casa de cima fica com chão na faixa
 * de cima e só o topo do objeto em baixo. Não é um bloco: passa a chão. Sem
 * isto, cada estrutura ganhava uma fila de paredes a mais por cima (no
 * Hideout: os postes da cerca e o jarro ao lado do spawn), e a franja de cima
 * do mato ficava parede.
 */
export function tirarTopos(grelha: string, grupos: readonly GrupoDeCor[], medidas: readonly MedidaDaCasa[], chao: readonly (readonly number[])[], colunas = COLUNAS_DO_MAPA) {
  const tipoDe = new Map(grupos.map((g) => [g.id, g.tipo]));
  const bloqueia = (i: number) => tipoDe.get(grelha[i]) === "parede";
  // O mato também sobe: as pontas das folhas passam para a casa de cima.
  const temAlgo = (i: number) => bloqueia(i) || tipoDe.get(grelha[i]) === "mato";
  const letras = grelha.split("");
  for (let i = 0; i + colunas < grelha.length; i++) {
    if (!bloqueia(i) || !temAlgo(i + colunas)) continue;
    const topo = medidas[i].topo;
    const doChao = chao[((i % colunas) + Math.floor(i / colunas)) % 2];
    // Chão de verdade: a cor do xadrez quase exata, e lisa.
    if (topo && distancia(topo, doChao) < 10 && (medidas[i].texturaDoTopo ?? 99) < 3) letras[i] = ".";
    // As pontas das folhas do mato de baixo, por baixo da sombra de uma caixa (Kaboom Canyon, ao meio):
    // a faixa de baixo tem a cor desse mato e a de cima é chão (ou chão à sombra). Uma cerca em cima
    // de mato também tem folhas em baixo, mas em cima tem a madeira dela.
    const deBaixo = grupos.find((g) => g.id === grelha[i + colunas]);
    const fundo = medidas[i].fundo;
    if (deBaixo?.tipo === "mato" && fundo && topo && distancia(fundo, deBaixo.cor) < 75 && chaoOuSombra(topo, doChao) && soMistura(medidas[i].cor, topo, fundo)) letras[i] = ".";
  }
  return letras.join("");
}

/**
 * O anel fino à volta de um objetivo (as plataformas de salto do Spiraling
 * Out: um centro liso e um aro vermelho de 2 a 6% por casa, pouco para contar
 * como anel sozinho). Uma casa lida como parede, com algum vermelho ou azul de
 * anel e encostada a um objetivo, é o aro dele — não um bloco.
 */
export function anelDosObjetivos(grelha: string, grupos: readonly GrupoDeCor[], medidas: readonly MedidaDaCasa[], colunas = COLUNAS_DO_MAPA) {
  const tipoDe = new Map(grupos.map((g) => [g.id, g.tipo]));
  const linhas = Math.ceil(grelha.length / colunas);
  const letras = grelha.split("");
  for (let i = 0; i < grelha.length; i++) {
    if (tipoDe.get(grelha[i]) !== "parede" || medidas[i].anel < FRACAO_DE_ANEL_VIZINHO) continue;
    const c = i % colunas, l = Math.floor(i / colunas);
    const encostada = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dl]) => {
      const cc = c + dc, ll = l + dl;
      return cc >= 0 && ll >= 0 && cc < colunas && ll < linhas && tipoDe.get(grelha[ll * colunas + cc]) === "objetivo";
    });
    if (encostada) letras[i] = ID_DE_OBJETIVO;
  }
  return letras.join("");
}

/**
 * Jarros e vasos soltos: uma peça sozinha (uma casa, ou duas uma em cima da
 * outra — o topo ou a sombra do desenho), sem outro obstáculo à volta, com uma
 * casa de vermelho a meio (12–30%: o vaso cor-de-rosa do Hideout tem 27%; os
 * vasos maciços em cima de paredes têm ~40% e fazem parte de uma estrutura).
 * Só essa casa fica jarro; a outra da peça é chão. Barris, caixas e cactos
 * soltos continuam parede — medidos em 16 mapas, nenhum tem este vermelho.
 */
export function marcarJarros(grelha: string, grupos: readonly GrupoDeCor[], medidas: readonly MedidaDaCasa[], colunas = COLUNAS_DO_MAPA) {
  const linhas = Math.ceil(grelha.length / colunas);
  const tipoDe = new Map(grupos.map((g) => [g.id, g]));
  const bloqueia = (i: number) => tipoDe.get(grelha[i])?.tipo === "parede";
  // Avermelhado no todo (o vaso é cor-de-rosa): um cacto verde com uma flor vermelha não é jarro.
  const eVaso = (i: number) => medidas[i].vermelho >= 0.12 && medidas[i].vermelho <= 0.3 && medidas[i].cor[0] > 180 && medidas[i].cor[0] - medidas[i].cor[1] > 60;
  const letras = grelha.split("");
  let jarros = 0;
  const visto = new Set<number>();
  for (let inicio = 0; inicio < grelha.length; inicio++) {
    if (visto.has(inicio) || !bloqueia(inicio)) continue;
    // A peça: casas de parede ligadas pelos lados.
    const peca = [inicio];
    visto.add(inicio);
    for (let k = 0; k < peca.length; k++) {
      const i = peca[k], c = i % colunas, l = Math.floor(i / colunas);
      for (const [dc, dl] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = c + dc, ll = l + dl, j = ll * colunas + cc;
        if (cc < 0 || ll < 0 || cc >= colunas || ll >= linhas || visto.has(j) || !bloqueia(j)) continue;
        visto.add(j);
        peca.push(j);
      }
    }
    if (peca.length > 2) continue;
    if (peca.length === 2 && Math.abs(peca[0] - peca[1]) !== colunas) continue;
    // Solta: nenhuma outra parede nas oito casas à volta.
    const naPeca = new Set(peca);
    const encostada = peca.some((i) => {
      const c = i % colunas, l = Math.floor(i / colunas);
      for (let dl = -1; dl <= 1; dl++) for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc, ll = l + dl, j = ll * colunas + cc;
        if (cc < 0 || ll < 0 || cc >= colunas || ll >= linhas || naPeca.has(j)) continue;
        if (bloqueia(j)) return true;
      }
      return false;
    });
    const vasos = peca.filter(eVaso);
    if (encostada || vasos.length !== 1) continue;
    for (const i of peca) letras[i] = ".";
    letras[vasos[0]] = ID_DE_JARRO;
    jarros++;
  }
  return { grelha: letras.join(""), jarros };
}

/**
 * Os discos das zonas. Uma mancha de casas azuladas e lisas, redonda (caixa
 * quase quadrada, 55–90% da caixa cheia), com 5 a 9 casas de lado. Devolve
 * as casas dentro do círculo, menos as que parecem mato (textura de folhas).
 */
export function zonasPelaForma(medidas: ReadonlyArray<{ cor: readonly number[]; textura: number }>, eChao: readonly boolean[], eAgua: readonly boolean[]) {
  const candidata = medidas.map((medida, i) => !eChao[i] && !eAgua[i] && azulado(medida.cor));
  const dentro = new Array<boolean>(medidas.length).fill(false);
  const visto = new Array<boolean>(medidas.length).fill(false);
  for (let inicio = 0; inicio < medidas.length; inicio++) {
    if (!candidata[inicio] || visto[inicio]) continue;
    const mancha = [inicio];
    visto[inicio] = true;
    for (let k = 0; k < mancha.length; k++) {
      const i = mancha[k], coluna = i % COLUNAS_DO_MAPA, linha = Math.floor(i / COLUNAS_DO_MAPA);
      for (const [dc, dl] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = coluna + dc, l = linha + dl, j = l * COLUNAS_DO_MAPA + c;
        if (c < 0 || l < 0 || c >= COLUNAS_DO_MAPA || l >= LINHAS_DO_MAPA || visto[j] || !candidata[j]) continue;
        visto[j] = true;
        mancha.push(j);
      }
    }
    const colunas = mancha.map((i) => i % COLUNAS_DO_MAPA), linhas = mancha.map((i) => Math.floor(i / COLUNAS_DO_MAPA));
    const largura = Math.max(...colunas) - Math.min(...colunas) + 1, altura = Math.max(...linhas) - Math.min(...linhas) + 1;
    const texturas = mancha.map((i) => medidas[i].textura).sort((a, b) => a - b);
    const mediana = texturas[Math.floor(texturas.length / 2)];
    const cheia = mancha.length / (largura * altura);
    const redonda = largura >= 5 && altura >= 5 && largura <= 9 && altura <= 9 && Math.abs(largura - altura) <= 1 && cheia >= 0.55 && cheia <= 0.92;
    if (!redonda || mediana >= 12) continue;
    const cx = (Math.max(...colunas) + Math.min(...colunas)) / 2, cy = (Math.max(...linhas) + Math.min(...linhas)) / 2;
    const raio = Math.max(largura, altura) / 2 + 0.3;
    for (let l = Math.floor(cy - raio); l <= Math.ceil(cy + raio); l++) {
      for (let c = Math.floor(cx - raio); c <= Math.ceil(cx + raio); c++) {
        if (c < 0 || l < 0 || c >= COLUNAS_DO_MAPA || l >= LINHAS_DO_MAPA || Math.hypot(c - cx, l - cy) > raio) continue;
        const j = l * COLUNAS_DO_MAPA + c;
        // O mato dentro da zona continua mato; o resto (chão tingido, contorno) é objetivo.
        const pareceMato = medidas[j].textura >= 14 && medidas[j].textura <= 26 && !azulado(medidas[j].cor);
        if (!eChao[j] && !eAgua[j] && !pareceMato) dentro[j] = true;
      }
    }
  }
  return dentro;
}

/* ------------------------------------------------------------------------ *
 * Imagens da Brawlify, servidas pelo próprio site.
 *
 * O 3D desenha a imagem do mapa e os retratos numa textura WebGL, e o
 * navegador só deixa usar imagens de outro domínio quando esse domínio o
 * autoriza (CORS). Servidas daqui, são do mesmo domínio e deixa de haver
 * pergunta. Só números como id, e só destes dois caminhos: o servidor não vai
 * buscar endereços que lhe mandem.
 * ------------------------------------------------------------------------ */
const CDN = (process.env.BRAWLIFY_CDN_BASE ?? "https://cdn.brawlify.com").replace(/\/$/, "");
const TAMANHO_MAXIMO = 4 * 1024 * 1024;
const imagens = new Map<string, { dados: Buffer; tipo: string } | null>();
const MAXIMO_EM_MEMORIA = 120;

export type TipoDeImagem = "mapa" | "brawler";
export const idDeImagemValido = (id: string) => /^\d{5,9}$/.test(id);

export async function imagemDaBrawlify(tipo: TipoDeImagem, id: string, buscar: typeof fetch = fetch) {
  if (!idDeImagemValido(id)) return null;
  const chave = `${tipo}:${id}`;
  if (imagens.has(chave)) return imagens.get(chave) ?? null;
  const caminho = tipo === "mapa" ? `maps/regular/${id}.png` : `brawlers/borderless/${id}.png`;
  let resultado: { dados: Buffer; tipo: string } | null = null;
  try {
    const resposta = await buscar(`${CDN}/${caminho}`, { signal: AbortSignal.timeout(10_000) });
    const tipoDoFicheiro = (resposta.headers.get("content-type") ?? "").split(";")[0].trim();
    if (resposta.ok && /^image\/(png|webp|jpeg)$/.test(tipoDoFicheiro)) {
      const dados = Buffer.from(await resposta.arrayBuffer());
      if (dados.length > 0 && dados.length <= TAMANHO_MAXIMO) resultado = { dados, tipo: tipoDoFicheiro };
    }
  } catch {
    resultado = null;
  }
  // Uma falha não fica em memória: pode ter sido a rede, e a próxima tentativa deve ir lá outra vez.
  if (resultado) {
    if (imagens.size >= MAXIMO_EM_MEMORIA) imagens.delete(imagens.keys().next().value!);
    imagens.set(chave, resultado);
  }
  return resultado;
}

/* ------------------------------------------------------------------------ *
 * O terreno de cada mapa, guardado.
 * ------------------------------------------------------------------------ */
const terrenos = new Map<string, TerrenoDoMapa>();
// v2: água e zonas lidas pela forma. v3: sem o topo dos objetos (a fila de
// paredes a mais por cima de cada estrutura), vasos, jarros, a estrela do
// Caça-Estrelas e as plataformas de salto. v4: as pontas das folhas por cima
// do mato (ao meio do Kaboom Canyon) e as esquinas das piscinas. Cada mapa é lido de novo.
const chaveGuardada = (mapaId: string) => `terreno:v4:${mapaId}`;

async function guardar(terreno: TerrenoDoMapa) {
  terrenos.set(terreno.mapaId, terreno);
  try {
    await setSetting(chaveGuardada(terreno.mapaId), JSON.stringify(terreno));
  } catch {
    // Sem base de dados, o terreno fica em memória até o processo acabar: lê-se outra vez depois.
  }
}

export async function obterTerreno(mapaId: string, buscar: typeof fetch = fetch): Promise<TerrenoDoMapa | null> {
  if (!idDeImagemValido(mapaId)) return null;
  const emMemoria = terrenos.get(mapaId);
  if (emMemoria) return emMemoria;
  try {
    const guardado = await getSetting(chaveGuardada(mapaId));
    const lido = guardado ? JSON.parse(guardado) : null;
    if (terrenoValido(lido)) {
      terrenos.set(mapaId, lido);
      return lido;
    }
  } catch {
    // Um terreno guardado estragado lê-se de novo da imagem.
  }
  const imagem = await imagemDaBrawlify("mapa", mapaId, buscar);
  if (!imagem || imagem.tipo !== "image/png") return null;
  try {
    const terreno = lerTerrenoDaImagem(lerPng(imagem.dados), mapaId);
    await guardar(terreno);
    return terreno;
  } catch (erro) {
    console.warn(`[Terreno] Não consegui ler o mapa ${mapaId}:`, erro instanceof Error ? erro.message : erro);
    return null;
  }
}

/** Casas corrigidas à mão pelo dono, guardadas com o terreno. */
export async function guardarCorrecoesDeCasas(terreno: TerrenoDoMapa, casas: Parameters<typeof corrigirCasas>[1]) {
  const corrigido = corrigirCasas(terreno, casas);
  await guardar(corrigido);
  return corrigido;
}

/** Os tipos dados pela IA para os grupos de cor, guardados de vez. */
export async function guardarRotulosDaIA(terreno: TerrenoDoMapa, rotulos: unknown) {
  const rotulado = aplicarRotulos(terreno, rotulos);
  if (rotulado !== terreno) await guardar(rotulado);
  return rotulado;
}
