/**
 * Calibração do motor da API nas partidas reais (v185).
 *
 * POR QUE EXISTE
 *
 * As percentagens do Draft são estimativas do modelo. Até aqui nada as comparava
 * com o que depois aconteceu: os pesos de fábrica são escolhas de desenho, não
 * medições. Aqui mede-se quanto cada parte — força dos brawlers, counters e
 * sinergias — realmente ajuda a prever quem ganha.
 *
 * COMO
 *
 * Cada partida dá duas equipas de três. Para uma delas calculam-se, com as
 * mesmas funções que o motor usa:
 *
 *   forca    = soma da força (logit da vitória) dos seus brawlers, menos a da outra
 *   counter  = soma, nos nove confrontos, do que cada um ganha além do esperado
 *   sinergia = soma das três duplas da equipa, menos as três da outra
 *
 * e ajusta-se  P(vence) = σ(wForça·forca + wCounter·counter + wSinergia·sinergia).
 *
 * SEM VAZAMENTO
 *
 *  - As estatísticas (vitórias por brawler, confronto e dupla em cada mapa) vêm
 *    só do período de TREINO.
 *  - Os pesos ajustam-se nas partidas de treino, mas para cada uma retira-se das
 *    estatísticas a própria partida (deixar-um-de-fora). Sem isto, uma partida
 *    raramente jogada «prevê-se» a si mesma e os pesos saem inflacionados.
 *  - A qualidade mede-se nas partidas MAIS RECENTES (validação), que as
 *    estatísticas nunca viram.
 *
 * O resultado diz quanto cada parte vale (um peso 1 quer dizer que a conta já
 * está calibrada; 0,5 que exagera) e se o conjunto bate o acaso (50%).
 * Só se aplica se for aprovado: amostra suficiente e ganho real sobre o acaso.
 */
import { calcularWinRateBayesiano } from "./amostraPequena";
import { configDeFabrica, type ConfigDoMotorApi } from "./configDoMotorApi";
import { calcularDeltaCounterPuro, calcularDeltaSinergiaPura, logit, sigmoid } from "./motorApiPerfeito";

export type BatalhaParaCalibrar = { mapa: string; t: number; vencedores: readonly string[]; derrotados: readonly string[] };

export type PesosCalibrados = { forca: number; counter: number; sinergia: number };

export type ResultadoDaCalibracao = {
  geradoEm: string;
  /** Primeiro instante (s) das partidas de validação. */
  corteDeValidacao: number;
  amostras: { treino: number; estatisticas: number; ajuste: number; validacao: number };
  pesos: PesosCalibrados;
  qualidade: {
    logLoss: number;
    /** Perda de quem prevê sempre 50% (ln 2). */
    referencia: number;
    /** Perda de um modelo só com a força dos brawlers, para ver o que counters e sinergias acrescentam. */
    soForca: number;
    acerto: number;
  };
  /** Previsto contra observado, em dez faixas. */
  curva: Array<{ previsto: number; observado: number; n: number }>;
  aprovada: boolean;
  motivo?: string;
};

export const MINIMO_DE_VALIDACAO = 20_000;
const MAXIMO_POR_CLASSE = 300_000;
const GANHO_MINIMO = 0.002;
const PESO_MINIMO = 0, PESO_MAXIMO = 6;

type Contagem = { n: number; v: number };
const chaveBrawler = (mapa: string, b: string) => `${mapa}\u0000${b}`;
const chaveDoPar = (mapa: string, a: string, b: string) => `${mapa}\u0000${a}\u0000${b}`;
const chaveDaDupla = (mapa: string, a: string, b: string) => (a < b ? chaveDoPar(mapa, a, b) : chaveDoPar(mapa, b, a));

/** Escolha repetível: a mesma partida cai sempre do mesmo lado, em qualquer passagem. */
function hash(t: number, a: string, b: string) {
  let h = (t ^ 0x9e3779b9) >>> 0;
  const texto = a + b;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619) >>> 0;
  return h;
}

function resolver(a: number[][], b: number[]) {
  const k = b.length;
  const m = a.map((linha, i) => [...linha, b[i]]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    if (Math.abs(m[c][c]) < 1e-12) return null;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let j = c; j <= k; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((linha, i) => linha[k] / linha[i]);
}

/** Regressão logística sem termo independente (a equipa de cima é escolhida ao acaso), com uma pequena penalização. */
export function ajustarLogistica(colunas: ReadonlyArray<ArrayLike<number>>, y: ArrayLike<number>, penalizacao = 1e-3) {
  const k = colunas.length, n = y.length;
  let w = new Array<number>(k).fill(0);
  for (let it = 0; it < 40; it++) {
    const g = w.map((v) => -penalizacao * v);
    const H = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? penalizacao : 0)));
    for (let i = 0; i < n; i++) {
      let z = 0;
      for (let c = 0; c < k; c++) z += w[c] * colunas[c][i];
      const p = sigmoid(z), r = y[i] - p, peso = p * (1 - p);
      for (let a = 0; a < k; a++) {
        g[a] += r * colunas[a][i];
        for (let b = a; b < k; b++) H[a][b] += peso * colunas[a][i] * colunas[b][i];
      }
    }
    for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
    const passo = resolver(H, g);
    if (!passo) break;
    w = w.map((v, i) => v + passo[i]);
    if (Math.max(...passo.map(Math.abs)) < 1e-7) break;
  }
  return w;
}

function perda(colunas: ReadonlyArray<ArrayLike<number>>, y: ArrayLike<number>, w: readonly number[]) {
  let total = 0, acertos = 0;
  for (let i = 0; i < y.length; i++) {
    let z = 0;
    for (let c = 0; c < w.length; c++) z += w[c] * colunas[c][i];
    const p = Math.min(1 - 1e-9, Math.max(1e-9, sigmoid(z)));
    total += y[i] === 1 ? -Math.log(p) : -Math.log(1 - p);
    if ((p > 0.5) === (y[i] === 1)) acertos++;
  }
  return { logLoss: total / Math.max(1, y.length), acerto: acertos / Math.max(1, y.length) };
}

/** Passagem 1: conta. Passagem 2: mede. As duas veem as mesmas partidas, pela mesma ordem ou não. */
export function criarCalibracao(opcoes: {
  corteDeValidacao: number;
  minimoDeValidacao?: number;
  maximoPorClasse?: number;
  /** Fração (0–1] das partidas de treino que entram nas estatísticas, para volumes grandes; 1 = todas. */
  taxaDasEstatisticas?: number;
}) {
  const { corteDeValidacao } = opcoes;
  const taxaDasEstatisticas = Math.min(1, Math.max(0.001, opcoes.taxaDasEstatisticas ?? 1));
  const nasEstatisticas = (b: BatalhaParaCalibrar) =>
    taxaDasEstatisticas >= 1 || (hash(b.t, b.vencedores[0] ?? "", "estatisticas") % 10_000) / 10_000 < taxaDasEstatisticas;
  const minimoDeValidacao = opcoes.minimoDeValidacao ?? MINIMO_DE_VALIDACAO;
  const maximo = opcoes.maximoPorClasse ?? MAXIMO_POR_CLASSE;
  const brawlers = new Map<string, Contagem>(), confrontos = new Map<string, Contagem>(), duplas = new Map<string, Contagem>();
  let treino = 0, validacao = 0, nasContagens = 0;
  const somar = (mapa: Map<string, Contagem>, chave: string, ganhou: boolean) => {
    const c = mapa.get(chave);
    if (c) { c.n += 1; if (ganhou) c.v += 1; } else mapa.set(chave, { n: 1, v: ganhou ? 1 : 0 });
  };

  function passagem1(b: BatalhaParaCalibrar) {
    if (b.t >= corteDeValidacao) { validacao++; return; }
    treino++;
    if (!nasEstatisticas(b)) return;
    nasContagens++;
    for (const [equipa, adversarios, ganhou] of [[b.vencedores, b.derrotados, true], [b.derrotados, b.vencedores, false]] as const) {
      for (const x of equipa) {
        somar(brawlers, chaveBrawler(b.mapa, x), ganhou);
        for (const y of adversarios) somar(confrontos, chaveDoPar(b.mapa, x, y), ganhou);
      }
      for (let i = 0; i < equipa.length; i++) for (let j = i + 1; j < equipa.length; j++) somar(duplas, chaveDaDupla(b.mapa, equipa[i], equipa[j]), ganhou);
    }
  }

  const colunas = { ajuste: [[], [], []] as number[][], validacao: [[], [], []] as number[][] };
  const rotulos = { ajuste: [] as number[], validacao: [] as number[] };
  let taxaDeAjuste = 1, taxaDeValidacao = 1;

  /** Descontos da própria partida (deixar-um-de-fora), só no ajuste. */
  function medir(b: BatalhaParaCalibrar, descontarPropria: boolean) {
    const ganhouA = hash(b.t, b.vencedores[0] ?? "", b.derrotados[0] ?? "") % 2 === 0;
    const A = ganhouA ? b.vencedores : b.derrotados, B = ganhouA ? b.derrotados : b.vencedores;
    const venceA = ganhouA;
    const menos = (ganhouDaEquipa: boolean) => (descontarPropria ? { n: 1, v: ganhouDaEquipa ? 1 : 0 } : { n: 0, v: 0 });
    const ganhou = (equipa: readonly string[]) => (equipa === b.vencedores);
    const beta = (x: string, equipa: readonly string[]) => {
      const c = brawlers.get(chaveBrawler(b.mapa, x)) ?? { n: 0, v: 0 }, d = menos(ganhou(equipa));
      const n = Math.max(0, c.n - d.n), v = Math.max(0, c.v - d.v);
      return logit(calcularWinRateBayesiano({ vitoriasMapa: v, jogosMapa: n, vitoriasModo: v, jogosModo: n, razaoUsoMapa: 1 }));
    };
    const parDoConfronto = (x: string, y: string, equipaX: readonly string[]) => {
      const c = confrontos.get(chaveDoPar(b.mapa, x, y)); if (!c) return undefined;
      const d = menos(ganhou(equipaX)), n = Math.max(0, c.n - d.n), v = Math.max(0, c.v - d.v);
      return { jogosMapa: n, vitoriasA: v, jogosModo: n, vitoriasAModo: v };
    };
    const parDaDupla = (x: string, y: string, equipa: readonly string[]) => {
      const c = duplas.get(chaveDaDupla(b.mapa, x, y)); if (!c) return undefined;
      const d = menos(ganhou(equipa)), n = Math.max(0, c.n - d.n), v = Math.max(0, c.v - d.v);
      return { jogosMapa: n, vitoriasA: v, jogosModo: n, vitoriasAModo: v };
    };
    const betasA = A.map((x) => beta(x, A)), betasB = B.map((x) => beta(x, B));
    let counter = 0;
    A.forEach((x, i) => B.forEach((y, j) => { counter += calcularDeltaCounterPuro(betasA[i], betasB[j], parDoConfronto(x, y, A)); }));
    const sinergia = (equipa: readonly string[], betas: number[]) => {
      let s = 0;
      for (let i = 0; i < equipa.length; i++) for (let j = i + 1; j < equipa.length; j++) s += calcularDeltaSinergiaPura(betas[i], betas[j], parDaDupla(equipa[i], equipa[j], equipa));
      return s;
    };
    return {
      x: [betasA.reduce((s, v) => s + v, 0) - betasB.reduce((s, v) => s + v, 0), counter, sinergia(A, betasA) - sinergia(B, betasB)],
      y: venceA ? 1 : 0,
    };
  }

  function iniciarPassagem2() {
    taxaDeAjuste = Math.min(1, maximo / Math.max(1, treino));
    taxaDeValidacao = Math.min(1, maximo / Math.max(1, validacao));
  }

  function passagem2(b: BatalhaParaCalibrar) {
    const emValidacao = b.t >= corteDeValidacao;
    const taxa = emValidacao ? taxaDeValidacao : taxaDeAjuste;
    if (taxa < 1 && (hash(b.t, b.derrotados[0] ?? "", b.vencedores[0] ?? "") % 10_000) / 10_000 >= taxa) return;
    // Só se retira «a própria partida» se ela entrou mesmo nas estatísticas.
    const { x, y } = medir(b, !emValidacao && nasEstatisticas(b));
    const destino = emValidacao ? colunas.validacao : colunas.ajuste;
    for (let c = 0; c < 3; c++) destino[c].push(x[c]);
    (emValidacao ? rotulos.validacao : rotulos.ajuste).push(y);
  }

  function terminar(agora = new Date()): ResultadoDaCalibracao {
    const pesosBrutos = ajustarLogistica(colunas.ajuste, rotulos.ajuste);
    const pesos = pesosBrutos.map((p) => Math.min(PESO_MAXIMO, Math.max(PESO_MINIMO, p)));
    const soForca = ajustarLogistica([colunas.ajuste[0]], rotulos.ajuste);
    const completa = perda(colunas.validacao, rotulos.validacao, pesos);
    const apenasForca = perda([colunas.validacao[0]], rotulos.validacao, [Math.max(0, soForca[0])]);
    const referencia = Math.LN2;
    // Curva de calibração, em dez faixas de probabilidade prevista.
    const faixas = Array.from({ length: 10 }, () => ({ soma: 0, ganhos: 0, n: 0 }));
    for (let i = 0; i < rotulos.validacao.length; i++) {
      const p = sigmoid(pesos[0] * colunas.validacao[0][i] + pesos[1] * colunas.validacao[1][i] + pesos[2] * colunas.validacao[2][i]);
      const f = faixas[Math.min(9, Math.floor(p * 10))];
      f.soma += p; f.ganhos += rotulos.validacao[i]; f.n += 1;
    }
    const amostras = { treino, estatisticas: nasContagens, ajuste: rotulos.ajuste.length, validacao };
    const ganho = referencia - completa.logLoss;
    let motivo: string | undefined;
    if (validacao < minimoDeValidacao) motivo = `Poucas partidas de validação (${validacao.toLocaleString("pt-PT")}; mínimo ${minimoDeValidacao.toLocaleString("pt-PT")}).`;
    else if (ganho < GANHO_MINIMO) motivo = "O modelo não bate o acaso nas partidas mais recentes.";
    else if (pesos.every((p) => p === 0)) motivo = "Nenhuma parte teve peso positivo.";
    return {
      geradoEm: agora.toISOString(),
      corteDeValidacao,
      amostras,
      pesos: { forca: pesos[0], counter: pesos[1], sinergia: pesos[2] },
      qualidade: { logLoss: completa.logLoss, referencia, soForca: apenasForca.logLoss, acerto: completa.acerto },
      curva: faixas.filter((f) => f.n > 0).map((f) => ({ previsto: f.soma / f.n, observado: f.ganhos / f.n, n: f.n })),
      aprovada: !motivo,
      motivo,
    };
  }

  return { passagem1, iniciarPassagem2, passagem2, terminar, contagens: () => ({ treino, validacao }) };
}

/** Os limites a que se aplica um peso medido: nunca menos de um quarto nem mais de quatro vezes o de fábrica. */
const limitar = (valor: number) => Math.min(4, Math.max(0.25, valor));

/**
 * O preset «Calibrado»: a configuração de fábrica com a força de counters e
 * sinergias corrigida pelo que as partidas reais mostram. Um peso 1 deixa tudo
 * como está; 0,6 corta 40%.
 */
export function configCalibrada(pesos: PesosCalibrados): ConfigDoMotorApi {
  const config = configDeFabrica();
  config.forcas.counter = config.forcas.counterado = limitar(pesos.counter);
  config.forcas.sinergia = config.forcas.antiSinergia = limitar(pesos.sinergia);
  return config;
}
