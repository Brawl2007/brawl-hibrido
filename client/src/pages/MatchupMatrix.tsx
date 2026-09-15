import { getMatchupValue, describeMatchupValue, formatMatchupPercent } from "@shared/counterMatchupValue";
import { useCounterSync } from "@/contexts/CounterSyncContext";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, ChevronRight, Database, Search, Swords, Target } from "lucide-react";
import { allRankedRows, type RankedRow } from "@/data/rankedData";
import { additionalBrawlerAssetIds } from "@/data/additionalRankedData";
import { observedMatchups, observedMatchupSource } from "@/data/observedMatchups";
import { buildBrawlerCatalog } from "@shared/brawlerCatalog";
import { getObservedMatchup, getObservedMatchupRow, listObservedMaps, listObservedModes } from "@shared/observedMatchupMatrix";

function brawlerImageFor(row: RankedRow | undefined) {
  if (!row) return null;
  const id = row.brawlerId ?? additionalBrawlerAssetIds[row.brawler];
  return id ? `https://cdn.brawlify.com/brawlers/borderless/${id}.png` : null;
}

function readableMode(mode: string) {
  return ({ gemGrab: "Pique-Gema", brawlBall: "Fute-Brawl", heist: "Roubo", bounty: "Caça-Estrelas", knockout: "Nocaute", hotZone: "Zona Estratégica" } as Record<string, string>)[mode] ?? mode;
}

function EvidenceLabel({ samples, sufficient, winRate }: { samples: number; sufficient: boolean; winRate: number | null }) {
  if (!sufficient) {
    return <span className="observed-evidence pending">Amostra insuficiente <small>{samples}/30</small></span>;
  }
  return <span className="observed-evidence ready">{winRate?.toFixed(1)}% WR <small>{samples} partidas</small></span>;
}

export default function MatchupMatrix() {
  useCounterSync();
  const catalog = useMemo(() => buildBrawlerCatalog(allRankedRows), []);
  const brawlerNames = useMemo(() => catalog.map((item) => item.brawler), [catalog]);
  const rowByName = useMemo(() => new Map(allRankedRows.map((row) => [row.brawler, row])), []);
  const maps = useMemo(() => listObservedMaps(observedMatchups), []);
  const modes = useMemo(() => listObservedModes(observedMatchups), []);
  const initialObservedPair = observedMatchups.find((entry) => entry.mode === modes[0] && entry.brawler !== entry.opponent);
  const catalogNameFor = (name: string | undefined) => brawlerNames.find((candidate) => candidate.toLocaleUpperCase("pt-PT") === name?.toLocaleUpperCase("pt-PT"));
  const initialBrawler = catalogNameFor(initialObservedPair?.brawler) ?? brawlerNames[0] ?? "SHELLY";
  const initialOpponent = catalogNameFor(initialObservedPair?.opponent) ?? brawlerNames.find((name) => name !== initialBrawler) ?? "NITA";
  const [brawler, setBrawler] = useState(() => initialBrawler);
  const [opponent, setOpponent] = useState(() => initialOpponent);
  const [map, setMap] = useState("all");
  const [mode, setMode] = useState(() => modes[0] ?? "");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (brawler !== opponent) return;
    const alternative = brawlerNames.find((name) => name !== brawler);
    if (alternative) setOpponent(alternative);
  }, [brawler, opponent, brawlerNames]);

  const mapsForSelectedMode = useMemo(
    () => maps.filter((mapName) => observedMatchups.some((entry) => entry.mode === mode && entry.map === mapName)),
    [map, mode, maps]
  );
  const filter = useMemo(() => ({ ...(map !== "all" ? { map } : {}), ...(mode ? { mode } : {}) }), [map, mode]);
  const selected = useMemo(() => getObservedMatchup(observedMatchups, brawler, opponent, filter, observedMatchupSource.minimumSample), [brawler, opponent, filter]);
  const row = useMemo(
    () => getObservedMatchupRow(observedMatchups, brawler, brawlerNames, filter, observedMatchupSource.minimumSample)
      .filter((cell) => cell.opponent.toLocaleLowerCase("pt-PT").includes(query.trim().toLocaleLowerCase("pt-PT")))
      .sort((a, b) => Number(b.hasSufficientSample) - Number(a.hasSufficientSample) || b.samples - a.samples || a.opponent.localeCompare(b.opponent, "pt-PT")),
    [brawler, brawlerNames, filter, query]
  );
  const observedPairs = row.filter((cell) => cell.samples > 0).length;
  const adequatePairs = row.filter((cell) => cell.hasSufficientSample).length;
  const selectedBrawlerRow = rowByName.get(brawler);
  const selectedOpponentRow = rowByName.get(opponent);

  return (
    <main className="observed-matrix-page">
      <header className="observed-topbar">
        <a className="observed-back" href="/draft"><ArrowLeft size={16} /> Voltar ao Draft</a>
        <div className="observed-brand"><span className="observed-brand-mark" /> BRAWL HÍBRIDO <i>·</i> MATRIZ 1V1</div>
        <div className="observed-source"><Database size={14} /> API oficial · {observedMatchupSource.rankedMatches} partidas</div>
      </header>

      <section className="observed-hero">
        <div>
          <span className="observed-kicker"><BarChart3 size={13} /> EVIDÊNCIA OBSERVADA</span>
          <h1>Matriz de <em>Matchups 1v1</em></h1>
          <p>Confrontos agregados a partir de partidas Ranked 3v3 reais. Cada leitura é isolada por <strong>modo de jogo</strong>; a percentagem só é exibida quando o par alcança <strong>{observedMatchupSource.minimumSample} partidas no modo selecionado</strong>.</p>
        </div>
        <div className="observed-meta-cards">
          <div><small>MODO ATIVO</small><strong>{readableMode(mode)}</strong><p>dados sem mistura de modos</p></div>
          <div><small>COBERTURA</small><strong>{brawlerNames.length} <span>brawlers</span></strong><p>matriz por modalidade</p></div>
          <div><small>ATUALIZADO</small><strong>{new Date(observedMatchupSource.receivedAt).toLocaleDateString("pt-PT")}</strong><p>fonte: Supercell</p></div>
        </div>
      </section>

      <section className="observed-mode-deck" aria-label="Escolher modo de jogo para a matriz observada">
        <div className="observed-mode-copy"><span className="observed-kicker"><Swords size={13} /> DADOS ISOLADOS POR MODO</span><h2>Escolhe a modalidade</h2><p>As amostras, vitórias e derrotas nunca são combinadas entre modos diferentes.</p></div>
        <div className="observed-mode-list">
          {modes.map((modeName) => {
            const records = observedMatchups.filter((entry) => entry.mode === modeName);
            const mapCount = new Set(records.map((entry) => entry.map)).size;
            return <button key={modeName} className={mode === modeName ? "is-active" : ""} onClick={() => { setMode(modeName); setMap("all"); }}>
              <strong>{readableMode(modeName)}</strong><span>{mapCount} mapa{mapCount === 1 ? "" : "s"} · {records.length} pares</span>
            </button>;
          })}
        </div>
      </section>

      <section className="observed-controls" aria-label="Filtros da matriz 1v1">
        <label><span>Brawler</span><select value={brawler} onChange={(event) => { setBrawler(event.target.value); if (event.target.value === opponent) setOpponent(brawlerNames.find((name) => name !== event.target.value) ?? opponent); }}>{brawlerNames.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label><span>Contra</span><select value={opponent} onChange={(event) => setOpponent(event.target.value)}>{brawlerNames.filter((name) => name !== brawler).map((name) => <option key={name}>{name}</option>)}</select></label>
        <label><span>Mapa observado</span><select value={map} onChange={(event) => setMap(event.target.value)}><option value="all">Todos os mapas de {readableMode(mode)}</option>{mapsForSelectedMode.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Modo isolado</span><select value={mode} onChange={(event) => { setMode(event.target.value); setMap("all"); }}>{modes.map((item) => <option key={item} value={item}>{readableMode(item)}</option>)}</select></label>
      </section>

      <section className="observed-duel" aria-label={`Duelo observado ${brawler} contra ${opponent}`}>
        <div className="observed-combatant left"><div className="observed-avatar" style={brawlerImageFor(selectedBrawlerRow) ? { backgroundImage: `url(${brawlerImageFor(selectedBrawlerRow)})` } : undefined}>{!brawlerImageFor(selectedBrawlerRow) && brawler.slice(0, 2)}</div><strong>{brawler}</strong></div>
        <div className="observed-result"><span>PARTIDAS RANKED OBSERVADAS</span><EvidenceLabel samples={selected.samples} sufficient={selected.hasSufficientSample} winRate={selected.winRate} /><p>{selected.samples ? `${selected.wins} vitórias · ${selected.losses} derrotas` : "Nenhuma observação neste filtro"}</p></div>
        <div className="observed-vs">VS</div>
        <div className="observed-combatant right"><strong>{opponent}</strong><div className="observed-avatar" style={brawlerImageFor(selectedOpponentRow) ? { backgroundImage: `url(${brawlerImageFor(selectedOpponentRow)})` } : undefined}>{!brawlerImageFor(selectedOpponentRow) && opponent.slice(0, 2)}</div></div>
      </section>

      <section className="observed-counter-intel"><h2>Counter Pick · {brawler} contra {opponent}</h2><strong>{getMatchupValue(brawler, opponent, mode).base === null ? "—" : formatMatchupPercent(getMatchupValue(brawler, opponent, mode).total)}</strong><p>{describeMatchupValue(getMatchupValue(brawler, opponent, mode))}</p></section>

      <section className="observed-row-section">
        <div className="observed-row-head">
          <div><span className="observed-kicker"><Target size={13} /> LINHA DA MATRIZ</span><h2>{brawler} contra todos os brawlers</h2><p>{observedPairs} pares observados · {adequatePairs} pares com 30+ partidas · os restantes permanecem sem estimativa.</p></div>
          <label className="observed-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar adversário" aria-label="Filtrar adversário" /></label>
        </div>
        <div className="observed-row-grid">
          {row.map((cell) => {
            const foe = rowByName.get(cell.opponent);
            return <button key={cell.opponent} className={`observed-cell ${cell.hasSufficientSample ? "has-sample" : ""} ${cell.opponent === opponent ? "is-selected" : ""}`} onClick={() => setOpponent(cell.opponent)}>
              <span className="observed-cell-avatar" style={brawlerImageFor(foe) ? { backgroundImage: `url(${brawlerImageFor(foe)})` } : undefined}>{!brawlerImageFor(foe) && cell.opponent.slice(0, 2)}</span>
              <span className="observed-cell-copy"><strong>{cell.opponent}</strong><small>{describeMatchupValue(getMatchupValue(brawler, cell.opponent, mode))} · Final: {getMatchupValue(brawler, cell.opponent, mode).base === null ? "—" : formatMatchupPercent(getMatchupValue(brawler, cell.opponent, mode).total)}</small><EvidenceLabel samples={cell.samples} sufficient={cell.hasSufficientSample} winRate={cell.winRate} /></span><ChevronRight size={15} />
            </button>;
          })}
        </div>
      </section>

      <footer className="observed-method"><Swords size={16} /><p><strong>Leitura correta:</strong> a percentagem é uma matriz de coocorrência em equipas adversárias de partidas Ranked 3v3, e não uma medição isolada de lane. O Counter Pick usa o delta do BrawlScope mais confirmações de PL Prodigy e Brawl Planet.</p></footer>
    </main>
  );
}
