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
const ID_DE_OBJETIVO = "0";
const corDeAnel = (r: number, g: number, b: number) =>
  (r > 190 && g < 95 && b < 110) || (b > 215 && r < 70 && g > 120 && g < 185);
const LETRAS = "abcdefghijklmnopqrstuvwxyz";

type Cor = [number, number, number];
const distancia = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function lerTerrenoDaImagem(imagem: ImagemRGBA, mapaId: string): TerrenoDoMapa {
  const casa = imagem.largura / (COLUNAS_DO_MAPA + 2);
  if (!Number.isInteger(casa) || casa < 8 || Math.abs(imagem.altura / (LINHAS_DO_MAPA + 2) - casa) > 0.01) {
    throw new Error(`A imagem tem ${imagem.largura}×${imagem.altura}: não é um mapa de 21×33 casas.`);
  }
  const margemInterna = Math.round(casa * 0.2);

  // Cor média e variação de brilho do miolo de cada casa.
  const medidas: Array<{ cor: Cor; textura: number; anel: number }> = [];
  for (let linha = 0; linha < LINHAS_DO_MAPA; linha++) {
    for (let coluna = 0; coluna < COLUNAS_DO_MAPA; coluna++) {
      const x0 = (coluna + 1) * casa + margemInterna, y0 = (linha + 1) * casa + margemInterna;
      const x1 = (coluna + 2) * casa - margemInterna, y1 = (linha + 2) * casa - margemInterna;
      let r = 0, g = 0, b = 0, n = 0, soma = 0, soma2 = 0, anel = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * imagem.largura + x) * 4;
          const pr = imagem.dados[o], pg = imagem.dados[o + 1], pb = imagem.dados[o + 2];
          r += pr; g += pg; b += pb; n++;
          if (corDeAnel(pr, pg, pb)) anel++;
          const brilho = 0.3 * pr + 0.59 * pg + 0.11 * pb;
          soma += brilho; soma2 += brilho * brilho;
        }
      }
      const media = soma / n;
      medidas.push({ cor: [r / n, g / n, b / n], textura: Math.sqrt(Math.max(0, soma2 / n - media * media)), anel: anel / n });
    }
  }

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
  const temAnel = medidas.map((medida) => medida.anel >= FRACAO_DE_ANEL);
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
        if (c < 0 || l < 0 || c >= COLUNAS_DO_MAPA || l >= LINHAS_DO_MAPA || visto[j] || medidas[j].anel < FRACAO_DE_ANEL_VIZINHO) continue;
        visto[j] = true;
        mancha.push(j);
      }
    }
    if (mancha.length >= 3) for (const i of mancha) emMancha[i] = true;
  }

  // O resto junta-se por cor. O centro de cada grupo é a média do que já entrou.
  type Acumulado = { id: string; soma: Cor; casas: number; textura: number };
  const grupos: Acumulado[] = [];
  const letras: string[] = [];
  let objetivos = 0;
  medidas.forEach((medida, i) => {
    const paridade = ((i % COLUNAS_DO_MAPA) + Math.floor(i / COLUNAS_DO_MAPA)) % 2;
    if (distancia(medida.cor, chao[paridade]) < DISTANCIA_DE_CHAO) {
      letras.push(".");
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
  if (objetivos) rotulados.push({ id: ID_DE_OBJETIVO, cor: [40, 150, 230], casas: objetivos, textura: 0, tipo: "objetivo" });
  return { mapaId, colunas: COLUNAS_DO_MAPA, linhas: LINHAS_DO_MAPA, grelha, grupos: rotulados, rotulado: "regra" };
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
const chaveGuardada = (mapaId: string) => `terreno:v1:${mapaId}`;

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
