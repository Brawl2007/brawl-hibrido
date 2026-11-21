import { forwardRef, useEffect, useRef } from "react";
import { EstampaDoMapa } from "@/components/EstampaDoMapa";
import { Retrato } from "@/components/Retrato";
import { mapImageFor } from "@/lib/imagemDoMapa";
import { formatarDecimal } from "@/lib/parametrosDaRota";
import type { MapSummary, RankedRow } from "@/data/rankedData";

/**
 * A abertura do Início: o mapa escolhido, a estampa dele e a rotação inteira.
 *
 * Tudo aqui fala do MESMO mapa — o nome, o modo, a estampa, o líder, o destino
 * de «Abrir Draft» e o ranking por baixo. Trocar de mapa na faixa «Na rotação»
 * troca tudo junto, e o endereço (`?map=`) guarda a escolha para o "voltar", o
 * recarregar e um link partilhado.
 */
type Props = {
  mapa: MapSummary;
  mapas: readonly MapSummary[];
  lider?: RankedRow;
  retratoDe: (linha: RankedRow) => string | null;
  onEscolher: (mapa: MapSummary) => void;
  onVerRanking: () => void;
  /** A lista completa de mapas (filtros, TSV), mais abaixo na mesma página. */
  onIrParaMapas: () => void;
  enderecoDoDraft: string;
  aviso?: string | null;
};

export const MapaEmDestaque = forwardRef<HTMLHeadingElement, Props>(function MapaEmDestaque(
  { mapa, mapas, lider, retratoDe, onEscolher, onVerRanking, onIrParaMapas, enderecoDoDraft, aviso },
  tituloRef,
) {
  // O mapa escolhido fica à vista na faixa, sem mexer no scroll da página.
  const lista = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const faixa = lista.current;
    const ativo = faixa?.querySelector<HTMLElement>("button.is-active");
    if (!faixa || !ativo) return;
    const item = ativo.parentElement ?? ativo;
    const inicio = item.offsetLeft - faixa.offsetLeft;
    if (inicio < faixa.scrollLeft || inicio + item.offsetWidth > faixa.scrollLeft + faixa.clientWidth) {
      faixa.scrollLeft = Math.max(0, inicio - 8);
    }
  }, [mapa.name]);
  return (
    <section className="mapa-em-destaque" aria-labelledby="mapa-em-destaque-titulo">
      <div className="mapa-em-destaque-texto">
        <nav className="migalhas" aria-label="Onde estás">
          <button type="button" className="migalhas-ligacao" onClick={onIrParaMapas}>Mapas</button> <span aria-hidden="true">/</span> <span>{mapa.mode}</span>
        </nav>
        <h1 id="mapa-em-destaque-titulo" ref={tituloRef} tabIndex={-1} className="titulo-de-mapa titulo-grande">{mapa.name}</h1>
        {aviso ? <p className="aviso-de-rota" role="status">{aviso}</p> : null}
        <div className="mapa-em-destaque-acoes">
          <a className="botao-tinta" href={enderecoDoDraft}>Abrir Draft <span aria-hidden="true">→</span></a>
          <button type="button" className="botao-lilas" onClick={onVerRanking}>Ver ranking <span aria-hidden="true">→</span></button>
        </div>
        {lider ? (
          <p className="mapa-lider">
            <span className="mapa-lider-retrato"><Retrato src={retratoDe(lider)} nome={lider.brawler} /></span>
            <span><small>Líder no mapa</small><b>{lider.brawler}</b></span>
            <span className="mapa-lider-score"><b>{formatarDecimal(lider.score)}</b> Score</span>
          </p>
        ) : null}
      </div>
      <EstampaDoMapa mapa={mapa} />
      <div className="na-rotacao">
        <h2 className="na-rotacao-titulo">Na rotação <small>{mapas.length} mapas</small></h2>
        <ul className="na-rotacao-lista" ref={lista}>
          {mapas.map((item) => {
            const ativo = item.name === mapa.name;
            const imagem = mapImageFor(item);
            return (
              <li key={item.name}>
                <button type="button" className={ativo ? "is-active" : ""} aria-pressed={ativo} onClick={() => onEscolher(item)}>
                  <span className="na-rotacao-miniatura" style={imagem ? { backgroundImage: `url(${imagem})` } : undefined} aria-hidden="true" />
                  <span className="na-rotacao-nome">{item.name}<small>{item.mode}</small></span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
});
