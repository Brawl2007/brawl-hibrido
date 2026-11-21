import { forwardRef, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Retrato } from "@/components/Retrato";
import { formatarDecimal } from "@/lib/parametrosDaRota";
import type { HybridWeightsPreference } from "@/lib/hybridWeights";
import type { SourceBalancePreference } from "@/lib/sourceBalance";
import type { RankedRow } from "@/data/rankedData";

/**
 * O ranking do mapa escolhido, com a régua Vitória/Uso ao lado.
 *
 * ARRASTAR É PROPOR, LARGAR É CONFIRMAR
 *
 * Enquanto o polegar está na régua, o número junto dele acompanha a proposta e
 * mais nada muda: recalcular 100 linhas a cada píxel faria a tabela tremer e
 * o dedo perder o sítio. Ao largar (ou com as setas do teclado, que confirmam
 * a cada passo) a preferência global é gravada — a mesma que o Draft, a Média
 * e os Brawlers leem — e o motor recalcula. As linhas que mudaram de lugar
 * deslocam-se até à posição nova em cerca de 260 ms.
 *
 * A identidade de cada linha é o brawler (`key`), não a posição: a linha
 * selecionada continua realçada e o foco continua no mesmo botão enquanto a
 * tabela se reordena. Com movimento reduzido, `MotionConfig reducedMotion`
 * (App.tsx) tira a deslocação e as linhas trocam de lugar de uma vez.
 *
 * SÓ COM SCORE PUBLICADO
 *
 * Alguns mapas só têm o Score publicado pela fonte, sem as taxas de vitória e
 * uso. Mexer nos pesos não muda nada ali — e uma régua que não muda nada
 * parece avariada. Nesses mapas a régua dá lugar a uma explicação e a um
 * atalho para um mapa onde os pesos têm efeito; a tabela continua inteira.
 */

const PRESETS = [70, 85, 95] as const;
const LINHAS_DO_RESUMO = 10;

type Props = {
  mapa: { name: string; mode: string };
  linhas: readonly RankedRow[];
  pesos: HybridWeightsPreference;
  onPesos: (preferencia: Partial<Pick<HybridWeightsPreference, "winRate">>) => void;
  fontes: SourceBalancePreference;
  /** Um mapa da rotação onde as taxas existem, para experimentar os pesos. */
  mapaParaTestar: { name: string } | null;
  onTestarPesos: () => void;
  onVoltarAosMapas: () => void;
  enderecoDoDraft: string;
  retratoDe: (linha: RankedRow) => string | null;
};

function temTaxas(linha: RankedRow) {
  return typeof linha.winRate === "number" && typeof linha.usage === "number";
}

export const RankingDoMapa = forwardRef<HTMLHeadingElement, Props>(function RankingDoMapa(
  { mapa, linhas, pesos, onPesos, fontes, mapaParaTestar, onTestarPesos, onVoltarAosMapas, enderecoDoDraft, retratoDe },
  tituloRef,
) {
  const [proposta, setProposta] = useState<number | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const tabela = useRef<HTMLTableSectionElement>(null);
  const focado = useRef<string | null>(null);

  const ordenadas = useMemo(
    () => linhas
      .filter((linha) => linha.rankedStatus !== "unavailable" && typeof linha.score === "number")
      .slice()
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.brawler.localeCompare(b.brawler)),
    [linhas],
  );
  const comTaxas = useMemo(() => ordenadas.some(temTaxas), [ordenadas]);
  const visiveis = verTodos ? ordenadas : ordenadas.slice(0, LINHAS_DO_RESUMO);
  // A linha escolhida não desaparece do resumo só porque desceu de lugar.
  const escolhida = selecionado ? ordenadas.find((linha) => linha.brawler === selecionado) : undefined;
  const mostradas = escolhida && !visiveis.includes(escolhida) ? [...visiveis, escolhida] : visiveis;
  const vitoria = proposta ?? pesos.winRate;
  const uso = 100 - vitoria - (pesos.starPlayerEnabled ? pesos.starPlayer : 0);

  // Reordenar move nós do DOM; se o foco estava num deles, devolve-se ao mesmo brawler.
  useLayoutEffect(() => {
    const nome = focado.current;
    if (!nome || !tabela.current) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const botao = tabela.current.querySelector<HTMLButtonElement>(`button[data-brawler="${CSS.escape(nome)}"]`);
    botao?.focus({ preventScroll: true });
  });

  const confirmar = (valor: number) => {
    setProposta(null);
    if (valor !== pesos.winRate) onPesos({ winRate: valor });
  };

  return (
    <section className="ranking-do-mapa" id="ranking" aria-labelledby="ranking-titulo">
      <div className="ranking-cabeca">
        <button type="button" className="ligacao-voltar" onClick={onVoltarAosMapas}>‹ Mapas</button>
        <span className="ranking-modo">{mapa.mode}</span>
      </div>
      <h2 id="ranking-titulo" ref={tituloRef} tabIndex={-1} className="titulo-de-mapa">{mapa.name}</h2>

      {comTaxas ? (
        <div className="ranking-pesos" role="group" aria-label="Peso da vitória e do uso no Score">
          <div className="ranking-pesos-linha">
            <span className="ranking-pesos-rotulo">Vitória / Uso</span>
            <output className="ranking-pesos-valor" aria-live="off">{vitoria}% / {uso}%</output>
          </div>
          <SliderPrimitive.Root
            className="regua-de-pesos"
            value={[vitoria]}
            min={0}
            max={pesos.starPlayerEnabled ? 100 - pesos.starPlayer : 100}
            step={1}
            onValueChange={([valor]) => setProposta(valor ?? pesos.winRate)}
            onValueCommit={([valor]) => confirmar(valor ?? pesos.winRate)}
            aria-label="Peso da vitória no Score: para a direita, mais vitória"
          >
            <SliderPrimitive.Track className="regua-de-pesos-trilho">
              <SliderPrimitive.Range className="regua-de-pesos-alcance" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb className="regua-de-pesos-polegar" aria-valuetext={`Vitória ${vitoria}%, uso ${uso}%`}>
              {proposta !== null ? <span className="regua-de-pesos-bolha" aria-hidden="true">{proposta}%</span> : null}
            </SliderPrimitive.Thumb>
          </SliderPrimitive.Root>
          <div className="ranking-presets" role="group" aria-label="Divisões rápidas">
            {PRESETS.map((valor) => (
              <button
                key={valor}
                type="button"
                className={pesos.winRate === valor ? "is-active" : ""}
                aria-pressed={pesos.winRate === valor}
                onClick={() => confirmar(valor)}
              >
                {valor} / {100 - valor}
              </button>
            ))}
          </div>
          <p className="ranking-pesos-nota">
            Fontes {fontes.brawlPlanet}/{fontes.topBrawl} · Star Player {pesos.starPlayerEnabled ? `${pesos.starPlayer}%` : "desligado"}
          </p>
        </div>
      ) : (
        <div className="ranking-publicado" role="note">
          <strong>Score publicado</strong>
          <p>
            Este mapa tem uma pontuação publicada por brawler, sem as taxas de vitória e uso.
            {mapaParaTestar ? ` ${mapaParaTestar.name} inclui os dados para ajustar os pesos.` : ""}
          </p>
          {mapaParaTestar ? <button type="button" className="botao-tinta" onClick={onTestarPesos}>Testar pesos em {mapaParaTestar.name}</button> : null}
        </div>
      )}

      <a className="botao-tinta botao-compacto" href={enderecoDoDraft}>Abrir Draft</a>

      <table className="ranking-tabela">
        <caption className="sr-only">
          Ranking de {mapa.name}: {comTaxas ? `Score Híbrido com Vitória ${pesos.winRate}% e Uso ${100 - pesos.winRate - (pesos.starPlayerEnabled ? pesos.starPlayer : 0)}%` : "Score publicado pela fonte"}
        </caption>
        <thead>
          <tr><th scope="col">#</th><th scope="col">Brawler</th><th scope="col" className="numero">Score</th></tr>
        </thead>
        <tbody ref={tabela}>
          {mostradas.map((linha) => {
            const posicao = ordenadas.indexOf(linha) + 1;
            const ativo = linha.brawler === selecionado;
            return (
              <motion.tr
                key={linha.brawler}
                layout="position"
                transition={{ duration: 0.26, ease: [0.2, 0.7, 0.2, 1] }}
                className={ativo ? "is-selecionada" : undefined}
                aria-selected={ativo}
              >
                <td className="ranking-posicao">{posicao}</td>
                <td>
                  <button
                    type="button"
                    className="ranking-brawler"
                    data-brawler={linha.brawler}
                    aria-pressed={ativo}
                    onFocus={() => { focado.current = linha.brawler; }}
                    // Só se esquece quando o foco vai PARA outro sítio; perdido para o
                    // <body> (o nó mudou de lugar) volta a este botão no efeito acima.
                    onBlur={(evento) => { if (evento.relatedTarget && focado.current === linha.brawler) focado.current = null; }}
                    onClick={() => setSelecionado((atual) => atual === linha.brawler ? null : linha.brawler)}
                  >
                    <span className="ranking-retrato"><Retrato src={retratoDe(linha)} nome={linha.brawler} loading="lazy" /></span>
                    <span>{linha.brawler}</span>
                  </button>
                </td>
                <td className="numero ranking-score">{formatarDecimal(linha.score)}</td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
      {ordenadas.length > LINHAS_DO_RESUMO ? (
        <button type="button" className="botao-lilas botao-compacto" onClick={() => setVerTodos((atual) => !atual)} aria-expanded={verTodos}>
          {verTodos ? "Ver os 10 primeiros" : `Ver todos (${ordenadas.length})`}
        </button>
      ) : null}
      <p className="ranking-origem">
        {comTaxas
          ? "Score de 0 a 100: vitória e uso médios das fontes, normalizados no mapa."
          : "Score de 0 a 100 tal como a fonte o publica para este mapa."}
      </p>
    </section>
  );
});
