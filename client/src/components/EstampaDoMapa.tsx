import { useEffect, useId, useRef, useState, type PointerEvent as EventoDePonteiro } from "react";
import { useReducedMotion } from "framer-motion";
import { mapImageFor } from "@/lib/imagemDoMapa";

/**
 * A estampa do mapa e, por baixo dela, o terreno.
 *
 * O GESTO
 *
 * Arrastar na horizontal sobre a própria imagem passa da estampa ao terreno —
 * a linha que separa as duas faces segue o dedo. O progresso mede-se pela
 * largura VISÍVEL da moldura (num ecrã estreito a moldura pode sair pelos
 * lados), por isso o mesmo movimento do polegar faz o mesmo caminho em
 * qualquer largura.
 *
 * O que o gesto NÃO pode estragar:
 *
 * - o scroll da página. A moldura declara `touch-action: pan-y`: um arrasto
 *   vertical continua a ser do navegador, e só um arrasto que começa mais
 *   horizontal do que vertical fica com a estampa;
 * - um toque cancelado (o navegador decide fazer scroll, uma chamada, outro
 *   dedo). `pointercancel` devolve a face que estava antes do gesto;
 * - quem não arrasta. «Estampa» e «Terreno» são botões, e a régua por baixo é
 *   um `<input type="range">` — setas, Home e End do teclado fazem o mesmo.
 *
 * Com movimento reduzido não há cortina a deslizar: a face troca de uma vez,
 * no fim do gesto ou no clique.
 *
 * Não depende de sensores (giroscópio, inclinação): só ponteiro e teclado.
 */

type Face = "estampa" | "terreno";

const LIMIAR_DE_EIXO_PX = 6;

function larguraVisivel(elemento: HTMLElement) {
  const caixa = elemento.getBoundingClientRect();
  const esquerda = Math.max(caixa.left, 0);
  const direita = Math.min(caixa.right, window.innerWidth || caixa.right);
  return Math.max(1, direita - esquerda);
}

const limitar = (valor: number) => Math.min(1, Math.max(0, valor));

export function EstampaDoMapa({ mapa }: { mapa: { name: string; id?: string; modeId: string; mode: string } }) {
  const reduzido = useReducedMotion() ?? false;
  const [progresso, setProgresso] = useState(0);
  const [aArrastar, setAArrastar] = useState(false);
  // A imagem do terreno só se pede quando a pessoa mostra que a quer ver.
  const [pedirTerreno, setPedirTerreno] = useState(false);
  const [terrenoFalhou, setTerrenoFalhou] = useState<string | null>(null);
  const moldura = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ id: number; x0: number; y0: number; p0: number; largura: number; decidido: boolean; horizontal: boolean } | null>(null);
  const idDaRegua = useId();
  const face: Face = progresso >= 0.5 ? "terreno" : "estampa";
  const imagemDoTerreno = mapImageFor(mapa);
  const mostrarTerreno = pedirTerreno || progresso > 0;

  // Mudar de mapa não muda a face escolhida; só esquece uma imagem falhada.
  useEffect(() => { setTerrenoFalhou(null); }, [imagemDoTerreno]);

  const fixar = (valor: number) => {
    setPedirTerreno(true);
    setProgresso(limitar(valor));
  };

  const aoPousar = (evento: EventoDePonteiro<HTMLDivElement>) => {
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    if (gesto.current) return; // um segundo dedo não começa outro gesto
    setPedirTerreno(true);
    gesto.current = {
      id: evento.pointerId,
      x0: evento.clientX,
      y0: evento.clientY,
      p0: progresso,
      largura: larguraVisivel(evento.currentTarget),
      decidido: false,
      horizontal: false,
    };
    // Captura já no toque: o fim do gesto chega sempre, mesmo fora da moldura.
    try { evento.currentTarget.setPointerCapture(evento.pointerId); } catch { /* ponteiro já libertado */ }
  };

  const aoMover = (evento: EventoDePonteiro<HTMLDivElement>) => {
    const atual = gesto.current;
    if (!atual || atual.id !== evento.pointerId) return;
    const dx = evento.clientX - atual.x0;
    const dy = evento.clientY - atual.y0;
    if (!atual.decidido) {
      if (Math.abs(dx) < LIMIAR_DE_EIXO_PX && Math.abs(dy) < LIMIAR_DE_EIXO_PX) return;
      atual.decidido = true;
      atual.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!atual.horizontal) { gesto.current = null; return; } // é scroll: a página que fique com ele
      setAArrastar(true);
    }
    if (!atual.horizontal) return;
    evento.preventDefault();
    // Com movimento reduzido não há cortina: só se decide a face no fim.
    if (!reduzido) setProgresso(limitar(atual.p0 + dx / atual.largura));
  };

  const terminar = (evento: EventoDePonteiro<HTMLDivElement>, cancelado: boolean) => {
    const atual = gesto.current;
    if (!atual || atual.id !== evento.pointerId) return;
    gesto.current = null;
    setAArrastar(false);
    if (!atual.horizontal) return;
    if (cancelado) { setProgresso(atual.p0); return; }
    const final = limitar(atual.p0 + (evento.clientX - atual.x0) / atual.largura);
    // Um gesto acaba numa face: a mais próxima de onde o dedo largou.
    setProgresso(final >= 0.5 ? 1 : 0);
  };

  const percentagem = Math.round(progresso * 100);
  const nomeDaFace = face === "terreno" ? "Terreno" : "Estampa";

  return (
    <figure className={`estampa-do-mapa modo-${mapa.modeId} ${aArrastar ? "a-arrastar" : ""}`} aria-label={`${mapa.name}: estampa e terreno`}>
      <div
        ref={moldura}
        className="estampa-moldura"
        onPointerEnter={() => setPedirTerreno(true)}
        onPointerDown={aoPousar}
        onPointerMove={aoMover}
        onPointerUp={(evento) => terminar(evento, false)}
        onPointerCancel={(evento) => terminar(evento, true)}
        onLostPointerCapture={(evento) => terminar(evento, true)}
      >
        <div className="estampa-face estampa-face-terreno" aria-hidden={face !== "terreno"}>
          {mostrarTerreno && imagemDoTerreno && terrenoFalhou !== imagemDoTerreno ? (
            <img
              src={imagemDoTerreno}
              alt={`Terreno de ${mapa.name}, visto de cima`}
              decoding="async"
              draggable={false}
              onError={() => setTerrenoFalhou(imagemDoTerreno)}
            />
          ) : (
            <span className="estampa-terreno-vazio">{terrenoFalhou ? `A imagem do terreno de ${mapa.name} não respondeu.` : `Terreno de ${mapa.name}`}</span>
          )}
        </div>
        <div
          className="estampa-face estampa-face-arte"
          aria-hidden={face !== "estampa"}
          style={{ clipPath: `inset(0 0 0 ${percentagem}%)` }}
        >
          <ArteDoModo modeId={mapa.modeId} />
          <span className="estampa-nervuras" />
          <span className="estampa-luz" />
        </div>
        {progresso > 0 && progresso < 1 ? <span className="estampa-corte" style={{ left: `${percentagem}%` }} aria-hidden="true" /> : null}
      </div>
      <figcaption className="estampa-controlos">
        <button type="button" className={face === "estampa" ? "is-active" : ""} aria-pressed={face === "estampa"} onClick={() => fixar(0)}>Estampa</button>
        <label className="sr-only" htmlFor={idDaRegua}>Passar da estampa ao terreno de {mapa.name}</label>
        <input
          id={idDaRegua}
          className="estampa-regua"
          type="range"
          min={0}
          max={100}
          step={5}
          value={percentagem}
          aria-valuetext={`${percentagem}% terreno · ${nomeDaFace}`}
          onFocus={() => setPedirTerreno(true)}
          onChange={(evento) => {
            const valor = Number(evento.target.value) / 100;
            // Com movimento reduzido a régua é um interruptor: qualquer passo
            // para a direita mostra o terreno, para a esquerda a estampa.
            if (!reduzido) { fixar(valor); return; }
            fixar(valor > progresso ? 1 : valor < progresso ? 0 : progresso);
          }}
          style={{ ["--progresso" as string]: `${percentagem}%` }}
        />
        <button type="button" className={face === "terreno" ? "is-active" : ""} aria-pressed={face === "terreno"} onClick={() => fixar(1)}>Terreno</button>
        <span className="sr-only" aria-live="polite">{face === "terreno" ? "Terreno à vista." : "Estampa à vista."}</span>
      </figcaption>
    </figure>
  );
}

/**
 * A arte de cada modo, desenhada aqui em SVG: sem pedidos, nítida em qualquer
 * ecrã e com a luz e as nervuras da impressão reservadas para o grande plano.
 */
function ArteDoModo({ modeId }: { modeId: string }) {
  const id = useId().replace(/:/g, "");
  const luz = `luz-${id}`;
  const sombra = `sombra-${id}`;
  return (
    <svg className="estampa-arte" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={luz} cx="30%" cy="22%" r="85%">
          <stop offset="0" stopColor="#EAF6FF" />
          <stop offset="0.55" stopColor="#A9D4FF" />
          <stop offset="1" stopColor="#5FA2FF" />
        </radialGradient>
        <linearGradient id={sombra} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${luz})`} />
      <ellipse cx="214" cy="268" rx="120" ry="16" fill="#18151F" opacity="0.16" />
      {modeId === "gem-grab" ? (
        <g>
          <polygon points="200,34 292,92 292,206 200,262 108,206 108,92" fill="#7A2BD0" />
          <polygon points="200,34 292,92 248,118 200,88" fill="#E05BF2" />
          <polygon points="200,34 200,88 152,118 108,92" fill="#F7A8FF" />
          <polygon points="108,92 152,118 152,180 108,206" fill="#C13BE0" />
          <polygon points="292,92 292,206 248,180 248,118" fill="#5729B6" />
          <polygon points="108,206 152,180 200,210 200,262" fill="#8E33D6" />
          <polygon points="292,206 200,262 200,210 248,180" fill="#4A1E9C" />
          <polygon points="200,88 248,118 248,180 200,210 152,180 152,118" fill="#D04BEA" />
          <polygon points="200,88 248,118 200,140 152,118" fill={`url(#${sombra})`} />
        </g>
      ) : modeId === "brawl-ball" ? (
        <g>
          <circle cx="200" cy="148" r="108" fill="#F5F2E9" />
          <polygon points="200,108 238,136 224,180 176,180 162,136" fill="#18151F" />
          <polygon points="200,40 236,62 200,80 164,62" fill="#18151F" />
          <polygon points="294,110 306,152 280,166 270,130" fill="#18151F" />
          <polygon points="106,110 130,130 120,166 94,152" fill="#18151F" />
          <polygon points="150,236 176,212 224,212 250,236 200,256" fill="#18151F" />
          <circle cx="200" cy="148" r="108" fill={`url(#${sombra})`} />
        </g>
      ) : modeId === "bounty" ? (
        <g>
          <polygon points="200,34 230,114 316,116 248,168 272,252 200,204 128,252 152,168 84,116 170,114" fill="#FCE35A" />
          <polygon points="200,34 230,114 200,150 170,114" fill="#FFF3A8" />
          <polygon points="316,116 248,168 200,150 230,114" fill="#F2C93A" />
          <polygon points="272,252 200,204 200,150 248,168" fill="#D9A92A" />
          <polygon points="128,252 152,168 200,150 200,204" fill="#E8BB30" />
          <polygon points="84,116 170,114 200,150 152,168" fill="#FFE47A" />
        </g>
      ) : modeId === "heist" ? (
        <g>
          <rect x="102" y="56" width="196" height="186" rx="22" fill="#5729B6" />
          <rect x="118" y="72" width="164" height="154" rx="14" fill="#7A47D6" />
          <circle cx="200" cy="149" r="48" fill="#FCE35A" />
          <circle cx="200" cy="149" r="30" fill="#E8BB30" />
          <rect x="196" y="105" width="8" height="30" rx="4" fill="#18151F" />
          <rect x="102" y="56" width="196" height="90" rx="22" fill={`url(#${sombra})`} />
        </g>
      ) : modeId === "hot-zone" ? (
        <g>
          <circle cx="200" cy="150" r="112" fill="#FFC0AC" />
          <circle cx="200" cy="150" r="82" fill="#FF8F70" />
          <circle cx="200" cy="150" r="52" fill="#E85A3C" />
          <path d="M200 98 C224 130 232 150 214 184 C206 168 196 164 186 176 C178 150 184 126 200 98 Z" fill="#FCE35A" />
          <circle cx="200" cy="150" r="112" fill={`url(#${sombra})`} />
        </g>
      ) : (
        <g>
          <polygon points="200,40 286,78 270,206 200,256 130,206 114,78" fill="#5729B6" />
          <polygon points="200,40 286,78 200,120 114,78" fill="#8E63E6" />
          <polygon points="150,140 186,150 176,182" fill="#F5F2E9" />
          <polygon points="250,140 214,150 224,182" fill="#F5F2E9" />
          <rect x="176" y="204" width="48" height="14" rx="3" fill="#F5F2E9" />
        </g>
      )}
    </svg>
  );
}
