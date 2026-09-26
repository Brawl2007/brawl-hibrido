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
      });
    }
  }
  return medidas;
}

const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");

/**
 * Para afinar a leitura: as medidas de cada casa, 20 algarismos hexadecimais
 * por casa — cor (6), textura (2), % vermelho (2), % azul (2), cor do resto
 * (6), textura do resto (2). `lerMedidasCompactas` desfaz.
 */
export function medidasCompactas(medidas: readonly MedidaDaCasa[]) {
  return medidas.map((m) => [...m.cor, m.textura, m.vermelho * 100, m.azul * 100, ...m.resto.cor, m.resto.textura].map(hex2).join("")).join("");
}

export function lerMedidasCompactas(texto: string): MedidaDaCasa[] {
  const medidas: MedidaDaCasa[] = [];
  for (let i = 0; i + 20 <= texto.length; i += 20) {
    const v = Array.from({ length: 10 }, (_, k) => parseInt(texto.slice(i + 2 * k, i + 2 * k + 2), 16));
    medidas.push({
      cor: [v[0], v[1], v[2]],
      textura: v[3],
      vermelho: v[4] / 100,
      azul: v[5] / 100,
      anel: (v[4] + v[5]) / 100,
      resto: { cor: [v[6], v[7], v[8]], textura: v[9] },
    });
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
  const temAnel = medidas.map((medida, i) => medida.anel >= FRACAO_DE_ANEL && !eAgua[i]);
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
    const objetoVermelho = mancha.length <= MAXIMO_DE_OBJETO_VERMELHO && mancha.every((i) => medidas[i].vermelho >= FRACAO_MACICA);
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
    if (emMancha[i]) {
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
  // Os jarros ainda não se leem sozinhos: a regra tem de ser afinada com medidas reais (ver `marcarJarros`).
  const { grelha: comJarros, jarros } = { grelha, jarros: 0 };
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
 * Jarros, vasos e barris soltos: uma peça de uma casa (ou duas, uma em cima
 * da outra — o desenho do jarro é alto) sem mais nenhum obstáculo à volta, com
 * pelo menos uma casa de uma cor rara no mapa (no máximo 4 casas dessa cor).
 * As paredes de verdade são blocos maiores ou encostados a outros; uma cerca
 * de postes tem a cor das paredes, que se repete.
 */
export function marcarJarros(grelha: string, grupos: readonly GrupoDeCor[], colunas = COLUNAS_DO_MAPA) {
  const linhas = Math.ceil(grelha.length / colunas);
  const tipoDe = new Map(grupos.map((g) => [g.id, g]));
  const bloqueia = (i: number) => tipoDe.get(grelha[i])?.tipo === "parede";
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
    if (encostada) continue;
    const corRara = peca.some((i) => (tipoDe.get(grelha[i])?.casas ?? Infinity) <= 4);
    if (!corRara) continue;
    for (const i of peca) letras[i] = ID_DE_JARRO;
    jarros += peca.length;
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
// v2: água e zonas lidas pela forma. As leituras antigas (zonas como água,
// contornos como paredes) ficam para trás e cada mapa é lido de novo.
const chaveGuardada = (mapaId: string) => `terreno:v2:${mapaId}`;

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

/** Os tipos dados pela IA para os grupos de cor, guardados de vez. */
export async function guardarRotulosDaIA(terreno: TerrenoDoMapa, rotulos: unknown) {
  const rotulado = aplicarRotulos(terreno, rotulos);
  if (rotulado !== terreno) await guardar(rotulado);
  return rotulado;
}

/** As medidas de todas as casas de um mapa, lidas agora da imagem, em texto compacto. Para afinar a leitura. */
export async function diagnosticoDoMapa(mapaId: string, buscar: typeof fetch = fetch) {
  const imagem = await imagemDaBrawlify("mapa", mapaId, buscar);
  if (!imagem || imagem.tipo !== "image/png") return null;
  return medidasCompactas(medirCasas(lerPng(imagem.dados)));
}
