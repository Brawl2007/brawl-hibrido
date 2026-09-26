/**
 * O terreno de um mapa, casa a casa: chão, parede, mato, água, ou objetivo
 * (base, zona, baliza — o que está desenhado no chão e não bloqueia).
 *
 * DE ONDE VEM
 *
 * Não há dados públicos das paredes. Há a imagem de cada mapa na Brawlify, e
 * essa imagem é uma grelha: 21×33 casas mais uma casa de margem à volta, 30
 * píxeis cada (690×1050). O servidor lê a cor de cada casa (ver
 * `server/terrenoDoMapa.ts`): o chão é o xadrez que mais se repete; o resto
 * junta-se em grupos da mesma cor.
 *
 * O QUE CADA GRUPO É
 *
 * A cor não chega: cada tema pinta tudo de maneira diferente (o mato é verde
 * num mapa e magenta noutro). Por isso cada GRUPO tem um tipo: primeiro uma
 * regra aproximada, depois — quando o dono tem a IA ligada — a IA olha para a
 * imagem e diz o que cada grupo é, uma vez por mapa, e fica guardado.
 */
/**
 * `destrutivel`: jarros, vasos e barris soltos. Bloqueiam como uma parede, mas
 * partem-se com ataques normais — não são cobertura em que se possa confiar.
 */
export type TipoDeCasa = "chao" | "parede" | "mato" | "agua" | "objetivo" | "destrutivel";
export const TIPOS_DE_CASA: readonly TipoDeCasa[] = ["chao", "parede", "mato", "agua", "objetivo", "destrutivel"];
/** Bloqueia a passagem (e os tiros) enquanto estiver de pé. */
export const bloqueiaPassagem = (tipo: TipoDeCasa) => tipo === "parede" || tipo === "destrutivel";

export const COLUNAS_DO_MAPA = 21;
export const LINHAS_DO_MAPA = 33;

export type GrupoDeCor = {
  /** Uma letra, a mesma que aparece na grelha. */
  id: string;
  cor: [number, number, number];
  casas: number;
  /** Variação de brilho dentro das casas: o mato é liso, as paredes têm contornos. */
  textura: number;
  tipo: TipoDeCasa;
};

export type TerrenoDoMapa = {
  mapaId: string;
  colunas: number;
  linhas: number;
  /** Uma letra por casa, linha a linha de cima para baixo: "." é chão, o resto é o id do grupo. */
  grelha: string;
  grupos: GrupoDeCor[];
  rotulado: "regra" | "ia";
  /** Casas corrigidas à mão pelo dono (índice da casa → tipo). Valem mais do que o grupo. */
  correcoes?: Record<string, TipoDeCasa>;
};

export function tipoDaCasa(terreno: TerrenoDoMapa, coluna: number, linha: number): TipoDeCasa {
  if (coluna < 0 || linha < 0 || coluna >= terreno.colunas || linha >= terreno.linhas) return "parede";
  const corrigida = terreno.correcoes?.[linha * terreno.colunas + coluna];
  if (corrigida) return corrigida;
  const letra = terreno.grelha[linha * terreno.colunas + coluna];
  if (!letra || letra === ".") return "chao";
  return terreno.grupos.find((grupo) => grupo.id === letra)?.tipo ?? "chao";
}

export const SIMBOLO_DO_TIPO: Record<TipoDeCasa, string> = { chao: ".", parede: "#", mato: "\"", agua: "~", objetivo: "o", destrutivel: "*" };

/**
 * A grelha em texto, para a IA: uma linha por linha do mapa, com o número à
 * frente. A IA lê isto muito melhor do que conta casas numa imagem.
 */
export function grelhaEmTexto(terreno: TerrenoDoMapa) {
  const linhas: string[] = [];
  for (let linha = 0; linha < terreno.linhas; linha++) {
    let texto = "";
    for (let coluna = 0; coluna < terreno.colunas; coluna++) texto += SIMBOLO_DO_TIPO[tipoDaCasa(terreno, coluna, linha)];
    linhas.push(`${String(linha).padStart(2, "0")} ${texto}`);
  }
  return linhas.join("\n");
}

/** Uma posição (em frações do mapa) → a casa onde cai. */
export function casaDoPonto(terreno: Pick<TerrenoDoMapa, "colunas" | "linhas">, ponto: { x: number; y: number }) {
  return {
    coluna: Math.min(terreno.colunas - 1, Math.max(0, Math.floor(ponto.x * terreno.colunas))),
    linha: Math.min(terreno.linhas - 1, Math.max(0, Math.floor(ponto.y * terreno.linhas))),
  };
}

/** O centro de uma casa, em frações do mapa. */
export function centroDaCasa(terreno: Pick<TerrenoDoMapa, "colunas" | "linhas">, coluna: number, linha: number) {
  return { x: (coluna + 0.5) / terreno.colunas, y: (linha + 0.5) / terreno.linhas };
}

/**
 * Um brawler não pode ficar dentro de uma parede nem na água. Se o ponto cair
 * numa, vai para a casa livre mais próxima; se já estiver livre, fica igual.
 * `atravessaAgua` deixa ficar na água (só para quem a atravessa).
 */
export function pontoLivre(terreno: TerrenoDoMapa | null | undefined, ponto: { x: number; y: number }, opcoes: { atravessaAgua?: boolean } = {}) {
  if (!terreno) return ponto;
  const bloqueia = (tipo: TipoDeCasa) => bloqueiaPassagem(tipo) || (tipo === "agua" && !opcoes.atravessaAgua);
  const { coluna, linha } = casaDoPonto(terreno, ponto);
  if (!bloqueia(tipoDaCasa(terreno, coluna, linha))) return ponto;
  for (let raio = 1; raio < Math.max(terreno.colunas, terreno.linhas); raio++) {
    let melhor: { coluna: number; linha: number; distancia: number } | null = null;
    for (let dl = -raio; dl <= raio; dl++) {
      for (let dc = -raio; dc <= raio; dc++) {
        if (Math.max(Math.abs(dl), Math.abs(dc)) !== raio) continue;
        const c = coluna + dc, l = linha + dl;
        if (c < 0 || l < 0 || c >= terreno.colunas || l >= terreno.linhas || bloqueia(tipoDaCasa(terreno, c, l))) continue;
        const distancia = Math.hypot(dc, dl);
        if (!melhor || distancia < melhor.distancia) melhor = { coluna: c, linha: l, distancia };
      }
    }
    if (melhor) return centroDaCasa(terreno, melhor.coluna, melhor.linha);
  }
  return ponto;
}

/**
 * A regra aproximada para dar um tipo a cada grupo, sem IA. Medida nas
 * imagens reais de vários temas:
 *
 * - um grupo pequeno e liso só nas duas primeiras ou duas últimas linhas é a
 *   base de partida (o enchimento dos círculos vermelhos e azuis) → objetivo;
 * - liso (textura < 10) e grande → água (ou uma zona desenhada — a IA corrige);
 * - muito liso (textura < 6) e pequeno → desenho no chão (plataforma de salto) → objetivo;
 * - o maior grupo com textura de relva (10 a 30) → mato;
 * - o resto → parede, porque as paredes têm contornos e sombras.
 */
export function rotularPorRegra(grupos: readonly Omit<GrupoDeCor, "tipo">[], grelha: string, colunas = COLUNAS_DO_MAPA): GrupoDeCor[] {
  const casasDe = (id: string) => {
    const casas: Array<{ coluna: number; linha: number }> = [];
    for (let i = 0; i < grelha.length; i++) if (grelha[i] === id) casas.push({ coluna: i % colunas, linha: Math.floor(i / colunas) });
    return casas;
  };
  const linhas = Math.ceil(grelha.length / colunas);
  const tipos = new Map<string, TipoDeCasa>();
  for (const grupo of grupos) {
    const casas = casasDe(grupo.id);
    // As bases de partida estão nas duas primeiras ou duas últimas linhas, ao
    // centro ou num canto; o enchimento do círculo é liso (sem contornos).
    const naBase = casas.length > 0 && casas.length <= 12 && grupo.textura < 10 && casas.every(({ linha }) => linha <= 1 || linha >= linhas - 2);
    if (naBase) tipos.set(grupo.id, "objetivo");
    else if (grupo.textura < 10 && grupo.casas >= 8) tipos.set(grupo.id, "agua");
    // Pequeno e liso a meio do mapa: desenho no chão (plataformas de salto, marcas), não parede — as paredes têm sempre contornos.
    else if (grupo.textura < 6) tipos.set(grupo.id, "objetivo");
  }
  const mato = grupos
    .filter((grupo) => !tipos.has(grupo.id) && grupo.textura >= 10 && grupo.textura <= 30 && grupo.casas >= 6)
    .sort((a, b) => b.casas - a.casas)[0];
  if (mato) tipos.set(mato.id, "mato");
  return grupos.map((grupo) => ({ ...grupo, tipo: tipos.get(grupo.id) ?? "parede" }));
}

/** Aplica os tipos dados pela IA; um id desconhecido ou um tipo inválido fica como estava. */
export function aplicarRotulos(terreno: TerrenoDoMapa, rotulos: unknown): TerrenoDoMapa {
  if (!Array.isArray(rotulos)) return terreno;
  const porId = new Map<string, TipoDeCasa>();
  for (const rotulo of rotulos) {
    const { id, tipo } = (rotulo ?? {}) as { id?: unknown; tipo?: unknown };
    if (typeof id === "string" && TIPOS_DE_CASA.includes(tipo as TipoDeCasa)) porId.set(id, tipo as TipoDeCasa);
  }
  if (porId.size === 0) return terreno;
  return {
    ...terreno,
    grupos: terreno.grupos.map((grupo) => (porId.has(grupo.id) ? { ...grupo, tipo: porId.get(grupo.id)! } : grupo)),
    rotulado: "ia",
  };
}

export function terrenoValido(valor: unknown): valor is TerrenoDoMapa {
  if (!valor || typeof valor !== "object") return false;
  const t = valor as TerrenoDoMapa;
  return typeof t.mapaId === "string"
    && t.colunas === COLUNAS_DO_MAPA
    && t.linhas === LINHAS_DO_MAPA
    && typeof t.grelha === "string"
    && t.grelha.length === t.colunas * t.linhas
    && Array.isArray(t.grupos)
    && t.grupos.every((grupo) => typeof grupo.id === "string" && TIPOS_DE_CASA.includes(grupo.tipo))
    && (t.correcoes === undefined || (typeof t.correcoes === "object" && t.correcoes !== null
      && Object.entries(t.correcoes).every(([indice, tipo]) => /^\d+$/.test(indice) && Number(indice) < t.grelha.length && TIPOS_DE_CASA.includes(tipo))));
}

/**
 * Corrige casas à mão. `null` apaga a correção (volta ao que a imagem diz).
 * Casas fora do mapa e tipos desconhecidos ficam de fora.
 */
export function corrigirCasas(terreno: TerrenoDoMapa, casas: ReadonlyArray<{ coluna: number; linha: number; tipo: TipoDeCasa | null }>): TerrenoDoMapa {
  const correcoes: Record<string, TipoDeCasa> = { ...(terreno.correcoes ?? {}) };
  for (const { coluna, linha, tipo } of casas) {
    if (!Number.isInteger(coluna) || !Number.isInteger(linha) || coluna < 0 || linha < 0 || coluna >= terreno.colunas || linha >= terreno.linhas) continue;
    const indice = String(linha * terreno.colunas + coluna);
    if (tipo === null) delete correcoes[indice];
    else if (TIPOS_DE_CASA.includes(tipo)) correcoes[indice] = tipo;
  }
  const { correcoes: _antigas, ...resto } = terreno;
  return Object.keys(correcoes).length ? { ...resto, correcoes } : resto;
}

type OpcoesDeCaminho = { atravessaAgua?: boolean };
const casaBloqueia = (terreno: TerrenoDoMapa, coluna: number, linha: number, opcoes: OpcoesDeCaminho) => {
  const tipo = tipoDaCasa(terreno, coluna, linha);
  return bloqueiaPassagem(tipo) || (tipo === "agua" && !opcoes.atravessaAgua);
};

/** Dá para ir de `a` a `b` em linha reta sem pisar parede, jarro ou (para quem não nada) água? */
export function linhaLivre(terreno: TerrenoDoMapa, a: { x: number; y: number }, b: { x: number; y: number }, opcoes: OpcoesDeCaminho = {}) {
  const dx = (b.x - a.x) * terreno.colunas, dy = (b.y - a.y) * terreno.linhas;
  const passos = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.2));
  for (let k = 0; k <= passos; k++) {
    const { coluna, linha } = casaDoPonto(terreno, { x: a.x + ((b.x - a.x) * k) / passos, y: a.y + ((b.y - a.y) * k) / passos });
    if (casaBloqueia(terreno, coluna, linha, opcoes)) return false;
  }
  return true;
}

/**
 * O caminho por onde um brawler anda de `a` a `b`: à volta das paredes, dos
 * jarros e (para quem não nada) da água. Devolve os pontos de viragem, do
 * primeiro ao último; em linha reta quando dá. `null` quando não há caminho.
 *
 * Porquê: uma seta desenhada a direito por cima de uma parede é uma ordem
 * impossível (a Amber não salta paredes).
 */
export function caminhoLivre(terreno: TerrenoDoMapa | null | undefined, a: { x: number; y: number }, b: { x: number; y: number }, opcoes: OpcoesDeCaminho = {}): Array<{ x: number; y: number }> | null {
  if (!terreno) return [a, b];
  const inicio = pontoLivre(terreno, a, opcoes), fim = pontoLivre(terreno, b, opcoes);
  if (linhaLivre(terreno, inicio, fim, opcoes)) return [inicio, fim];
  const { colunas, linhas } = terreno;
  const de = casaDoPonto(terreno, inicio), para = casaDoPonto(terreno, fim);
  const indice = (c: number, l: number) => l * colunas + c;
  const custo = new Array<number>(colunas * linhas).fill(Infinity);
  const veio = new Array<number>(colunas * linhas).fill(-1);
  const aberta: number[] = [indice(de.coluna, de.linha)];
  custo[aberta[0]] = 0;
  const estimativa = (i: number) => Math.hypot((i % colunas) - para.coluna, Math.floor(i / colunas) - para.linha);
  const alvo = indice(para.coluna, para.linha);
  while (aberta.length) {
    // A grelha é pequena (693 casas): procurar o melhor numa lista chega.
    let melhor = 0;
    for (let k = 1; k < aberta.length; k++) if (custo[aberta[k]] + estimativa(aberta[k]) < custo[aberta[melhor]] + estimativa(aberta[melhor])) melhor = k;
    const atual = aberta.splice(melhor, 1)[0];
    if (atual === alvo) break;
    const c = atual % colunas, l = Math.floor(atual / colunas);
    for (const [dc, dl] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cc = c + dc, ll = l + dl;
      if (cc < 0 || ll < 0 || cc >= colunas || ll >= linhas || casaBloqueia(terreno, cc, ll, opcoes)) continue;
      // Na diagonal não se corta a esquina de uma parede.
      if (dc && dl && (casaBloqueia(terreno, c + dc, l, opcoes) || casaBloqueia(terreno, c, l + dl, opcoes))) continue;
      const j = indice(cc, ll), novo = custo[atual] + (dc && dl ? Math.SQRT2 : 1);
      if (novo >= custo[j]) continue;
      custo[j] = novo;
      veio[j] = atual;
      if (!aberta.includes(j)) aberta.push(j);
    }
  }
  if (custo[alvo] === Infinity) return null;
  const casas: Array<{ x: number; y: number }> = [];
  for (let i = alvo; i !== -1; i = veio[i]) casas.unshift(centroDaCasa(terreno, i % colunas, Math.floor(i / colunas)));
  casas[0] = inicio;
  casas[casas.length - 1] = fim;
  // Só os pontos de viragem: de cada ponto, salta para o mais longe que se vê em linha reta.
  const rota = [casas[0]];
  let k = 0;
  while (k < casas.length - 1) {
    let longe = k + 1;
    for (let m = casas.length - 1; m > k + 1; m--) {
      if (linhaLivre(terreno, casas[k], casas[m], opcoes)) { longe = m; break; }
    }
    rota.push(casas[longe]);
    k = longe;
  }
  return rota;
}
