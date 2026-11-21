import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as EventoDePonteiro } from "react";
import { caminhoLivre, COLUNAS_DO_MAPA, LINHAS_DO_MAPA, type TerrenoDoMapa } from "@shared/terrenoDoMapa";
import type { PontoNoMapa, SetaDoPlano } from "@shared/quadroDoGeneral";
import type { PosicaoNoMapa } from "@shared/draft";
import { prefereMenosMovimento } from "@/lib/parametrosDaRota";
import type { FichaNo3D } from "./Quadro3D";

/**
 * O Quadro em plano: o mesmo mapa, as mesmas fichas, as mesmas setas — sem 3D.
 *
 * Existe porque o campo tem de estar utilizável desde o primeiro instante, em
 * qualquer telemóvel, e continuar utilizável se o 3D falhar. O 3D decora por
 * cima; esta vista é a base.
 *
 * O MOVIMENTO ENTRE MOMENTOS
 *
 * O mapa nunca roda: Início, Meio e Fim veem-se com a mesma orientação. Ao
 * mudar de momento, cada ficha anda da posição em que ESTÁ (não da posição de
 * partida do momento anterior: mudar outra vez a meio do movimento continua
 * daí) até à posição que o plano lhe dá no momento novo. O caminho é o do
 * motor (`caminhoLivre`): casas adjacentes da grelha de terreno, à volta das
 * paredes e dos jarros. Sem grelha, ou sem passagem, a ficha vai direta de um
 * ponto ao outro — a marcação manual do jogador manda.
 *
 * O desenho corre só enquanto há fichas a andar; parado, não pede frames. Com
 * movimento reduzido, as fichas trocam de sítio de uma vez.
 */

const MARGEM_EM_CASAS = 1;

type Duelo = { posicao: PosicaoNoMapa; nosso: string; deles: string };

type Props = {
  nomeDoMapa: string;
  imagem: string | null;
  terreno: TerrenoDoMapa | null;
  fichas: readonly FichaNo3D[];
  setas: readonly SetaDoPlano[];
  duelos: readonly Duelo[];
  faixa: PosicaoNoMapa | null;
  onFaixa: (faixa: PosicaoNoMapa) => void;
  /** Mover uma ficha neste momento (arrastar ou setas do teclado). Sem isto, só se olha. */
  onMover?: (chave: string, ponto: PontoNoMapa) => void;
  nomeDaNossaEquipa: string;
};

type Animacao = { pontos: PontoNoMapa[]; comprimentos: number[]; total: number; inicio: number; duracao: number };

function grelha(terreno: TerrenoDoMapa | null) {
  return { colunas: terreno?.colunas ?? COLUNAS_DO_MAPA, linhas: terreno?.linhas ?? LINHAS_DO_MAPA };
}

/** De um ponto do plano (0–1 na grelha jogável) para percentagem da imagem, que tem uma casa de margem. */
function paraImagem(ponto: PontoNoMapa, colunas: number, linhas: number) {
  return {
    x: ((MARGEM_EM_CASAS + ponto.x * colunas) / (colunas + 2 * MARGEM_EM_CASAS)) * 100,
    y: ((MARGEM_EM_CASAS + ponto.y * linhas) / (linhas + 2 * MARGEM_EM_CASAS)) * 100,
  };
}

function pontoAoLongo(animacao: Animacao, fracao: number): PontoNoMapa {
  const alvo = animacao.total * fracao;
  let andado = 0;
  for (let i = 1; i < animacao.pontos.length; i += 1) {
    const troco = animacao.comprimentos[i - 1];
    if (andado + troco >= alvo || i === animacao.pontos.length - 1) {
      const t = troco > 0 ? Math.min(1, (alvo - andado) / troco) : 1;
      const a = animacao.pontos[i - 1], b = animacao.pontos[i];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    andado += troco;
  }
  return animacao.pontos[animacao.pontos.length - 1];
}

const suave = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function QuadroPlano({ nomeDoMapa, imagem, terreno, fichas, setas, duelos, faixa, onFaixa, onMover, nomeDaNossaEquipa }: Props) {
  const { colunas, linhas } = grelha(terreno);
  const tabuleiro = useRef<HTMLDivElement>(null);
  const nos = useRef(new Map<string, HTMLButtonElement>());
  const atuais = useRef(new Map<string, PontoNoMapa>());
  const animacoes = useRef(new Map<string, Animacao>());
  const frame = useRef<number | null>(null);
  const [imagemFalhou, setImagemFalhou] = useState<string | null>(null);
  // O arrasto vive numa ref: os eventos de ponteiro chegam mais depressa do
  // que os renders, e um handler com o estado do render anterior perdia-os.
  const arrastoRef = useRef<{ chave: string; ponto: PontoNoMapa; id: number } | null>(null);
  const [aArrastar, setAArrastar] = useState<string | null>(null);

  const colocar = (chave: string, ponto: PontoNoMapa) => {
    const no = nos.current.get(chave);
    if (!no) return;
    const { x, y } = paraImagem(ponto, colunas, linhas);
    no.style.left = `${x}%`;
    no.style.top = `${y}%`;
  };

  const passo = (agora: number) => {
    frame.current = null;
    for (const [chave, animacao] of Array.from(animacoes.current.entries())) {
      const fracao = Math.min(1, (agora - animacao.inicio) / animacao.duracao);
      const ponto = pontoAoLongo(animacao, suave(fracao));
      atuais.current.set(chave, ponto);
      colocar(chave, ponto);
      if (fracao >= 1) animacoes.current.delete(chave);
    }
    if (animacoes.current.size) frame.current = window.requestAnimationFrame(passo);
  };

  // Cada vez que as posições pedidas mudam (outro momento, outra ficha movida),
  // cada ficha parte de onde está agora.
  const assinatura = fichas.map((ficha) => `${ficha.chave}@${ficha.ponto.x.toFixed(4)},${ficha.ponto.y.toFixed(4)}`).join("|");
  useLayoutEffect(() => {
    const reduzido = prefereMenosMovimento();
    const agora = performance.now();
    const presentes = new Set<string>();
    for (const ficha of fichas) {
      presentes.add(ficha.chave);
      const de = atuais.current.get(ficha.chave);
      const para = ficha.ponto;
      if (!de || reduzido || (Math.abs(de.x - para.x) < 1e-4 && Math.abs(de.y - para.y) < 1e-4)) {
        animacoes.current.delete(ficha.chave);
        atuais.current.set(ficha.chave, para);
        colocar(ficha.chave, para);
        continue;
      }
      const caminho = caminhoLivre(terreno, de, para) ?? [de, para];
      // O caminho do motor começa e acaba nos pontos livres mais próximos; a
      // ficha parte de onde está e acaba exatamente onde o jogador a pôs.
      const pontos = [de, ...caminho.slice(1, -1), para];
      const comprimentos = pontos.slice(1).map((b, i) => Math.hypot((b.x - pontos[i].x) * colunas, (b.y - pontos[i].y) * linhas));
      const total = comprimentos.reduce((soma, troco) => soma + troco, 0);
      animacoes.current.set(ficha.chave, { pontos, comprimentos, total, inicio: agora, duracao: Math.min(1100, 320 + total * 45) });
    }
    for (const chave of Array.from(atuais.current.keys())) if (!presentes.has(chave)) { atuais.current.delete(chave); animacoes.current.delete(chave); }
    if (animacoes.current.size && frame.current === null) frame.current = window.requestAnimationFrame(passo);
  }, [assinatura, terreno, colunas, linhas]);
  useEffect(() => () => { if (frame.current !== null) window.cancelAnimationFrame(frame.current); }, []);

  const duelo = faixa ? duelos.find((item) => item.posicao === faixa) : undefined;
  const emRealce = new Set(duelo ? [`a:${duelo.nosso}`, `e:${duelo.deles}`] : []);
  const faixaDe = (ficha: FichaNo3D) => duelos.find((item) => (ficha.lado === "nos" ? item.nosso : item.deles) === ficha.nome)?.posicao;

  const pontoDoPonteiro = (evento: { clientX: number; clientY: number }): PontoNoMapa | null => {
    const caixa = tabuleiro.current?.getBoundingClientRect();
    if (!caixa) return null;
    const totalColunas = colunas + 2 * MARGEM_EM_CASAS, totalLinhas = linhas + 2 * MARGEM_EM_CASAS;
    const x = (((evento.clientX - caixa.left) / caixa.width) * totalColunas - MARGEM_EM_CASAS) / colunas;
    const y = (((evento.clientY - caixa.top) / caixa.height) * totalLinhas - MARGEM_EM_CASAS) / linhas;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  };

  const aoPousar = (ficha: FichaNo3D) => (evento: EventoDePonteiro<HTMLButtonElement>) => {
    if (!onMover || (evento.pointerType === "mouse" && evento.button !== 0)) return;
    const ponto = atuais.current.get(ficha.chave) ?? ficha.ponto;
    arrastoRef.current = { chave: ficha.chave, ponto, id: evento.pointerId };
    setAArrastar(ficha.chave);
    try { evento.currentTarget.setPointerCapture(evento.pointerId); } catch { /* já libertado */ }
  };
  const aoMover = (evento: EventoDePonteiro<HTMLButtonElement>) => {
    const arrasto = arrastoRef.current;
    if (!arrasto || arrasto.id !== evento.pointerId) return;
    const ponto = pontoDoPonteiro(evento);
    if (!ponto) return;
    animacoes.current.delete(arrasto.chave);
    atuais.current.set(arrasto.chave, ponto);
    colocar(arrasto.chave, ponto);
    arrasto.ponto = ponto;
  };
  const aoLargar = (ficha: FichaNo3D, cancelado: boolean) => (evento: EventoDePonteiro<HTMLButtonElement>) => {
    const arrasto = arrastoRef.current;
    if (!arrasto || arrasto.id !== evento.pointerId) return;
    arrastoRef.current = null;
    setAArrastar(null);
    const inicial = ficha.ponto;
    const movido = Math.hypot((arrasto.ponto.x - inicial.x) * colunas, (arrasto.ponto.y - inicial.y) * linhas) > 0.4;
    if (cancelado || !movido) { atuais.current.set(ficha.chave, inicial); colocar(ficha.chave, inicial); return; }
    onMover?.(ficha.chave, arrasto.ponto);
  };
  const aoTeclar = (ficha: FichaNo3D) => (evento: KeyboardEvent<HTMLButtonElement>) => {
    if (!onMover) return;
    const passoX = 1 / colunas, passoY = 1 / linhas;
    const deslocamento = { ArrowLeft: [-passoX, 0], ArrowRight: [passoX, 0], ArrowUp: [0, -passoY], ArrowDown: [0, passoY] }[evento.key];
    if (!deslocamento) return;
    evento.preventDefault();
    const de = ficha.ponto;
    onMover(ficha.chave, { x: Math.min(1, Math.max(0, de.x + deslocamento[0])), y: Math.min(1, Math.max(0, de.y + deslocamento[1])) });
  };

  const mostrarImagem = imagem && imagemFalhou !== imagem;
  return (
    <div className="quadro-plano">
      <div
        ref={tabuleiro}
        className={`quadro-plano-campo ${duelo ? "com-realce" : ""}`}
        style={{ aspectRatio: `${colunas + 2 * MARGEM_EM_CASAS} / ${linhas + 2 * MARGEM_EM_CASAS}` }}
        role="group"
        aria-label={`${nomeDoMapa}, visto de cima`}
      >
        {mostrarImagem ? <img className="quadro-plano-mapa" src={imagem!} alt="" draggable={false} onError={() => setImagemFalhou(imagem)} /> : <span className="quadro-plano-sem-imagem">{nomeDoMapa}</span>}
        <svg className="quadro-plano-setas" viewBox={`0 0 ${colunas + 2 * MARGEM_EM_CASAS} ${linhas + 2 * MARGEM_EM_CASAS}`} aria-hidden="true">
          <defs>
            <marker id="quadro-plano-ponta" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
            </marker>
          </defs>
          {setas.map((seta) => {
            const pontos = [seta.de, ...(seta.caminho ?? []), seta.para]
              .map((p) => `${MARGEM_EM_CASAS + p.x * colunas},${MARGEM_EM_CASAS + p.y * linhas}`)
              .join(" ");
            return <polyline key={seta.id} className={`quadro-plano-seta seta-${seta.tipo}`} points={pontos} markerEnd="url(#quadro-plano-ponta)" />;
          })}
        </svg>
        <ul className="quadro-plano-fichas">
          {fichas.map((ficha) => {
            const lado = ficha.lado === "nos" ? nomeDaNossaEquipa : "adversária";
            const realce = emRealce.has(ficha.chave);
            return (
              <li key={ficha.chave}>
                <button
                  type="button"
                  ref={(no) => { if (no) { nos.current.set(ficha.chave, no); const ponto = atuais.current.get(ficha.chave) ?? ficha.ponto; const { x, y } = paraImagem(ponto, colunas, linhas); no.style.left = `${x}%`; no.style.top = `${y}%`; } else nos.current.delete(ficha.chave); }}
                  className={`quadro-plano-ficha lado-${ficha.lado} ${realce ? "is-realce" : ""} ${aArrastar === ficha.chave ? "a-arrastar" : ""} ${onMover ? "pode-mover" : ""}`}
                  aria-label={`${ficha.nome}, equipa ${lado}${onMover ? ". Setas do teclado movem uma casa." : ""}`}
                  aria-pressed={realce}
                  onClick={() => { const propria = faixaDe(ficha); if (propria) onFaixa(propria); }}
                  onKeyDown={aoTeclar(ficha)}
                  onPointerDown={aoPousar(ficha)}
                  onPointerMove={aoMover}
                  onPointerUp={aoLargar(ficha, false)}
                  onPointerCancel={aoLargar(ficha, true)}
                >
                  {ficha.retrato ? <img src={ficha.retrato} alt="" draggable={false} onError={(evento) => { evento.currentTarget.remove(); }} /> : null}
                  <span>{ficha.nome.slice(0, 2).toUpperCase()}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
