import { LOGO } from "@/lib/imagens";
import { useDraftRolesVersion } from "@/contexts/DraftRolesContext";
import { DraftRoleEditor } from "@/components/DraftRoleEditor";
import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ChevronDown,
  Crosshair,
  Radio,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Target,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useSyncRefresh } from "@/lib/useSyncRefresh";
import { useCounterSync } from "@/contexts/CounterSyncContext";
import { useRankedSync } from "@/contexts/RankedSyncContext";
import {
  allRankedRows,
  preRankedBrawlerCatalogRows,
  normalizeRankedRows,
  type RankedRow,
  type Tier,
} from "@/data/rankedData";
import { additionalBrawlerAssetIds } from "@/data/additionalRankedData";
import { useHybridWeights } from "@/lib/hybridWeights";
import { useSourceBalance } from "@/lib/sourceBalance";
import { useDraftRules } from "@/lib/draftRules";
import {
  buildBrawlerCatalog,
  type BrawlerCatalogItem,
} from "@shared/brawlerCatalog";
import {
  draftRoleLabels,
  getCounterMatchup,
  getBrawlerClass,
  getOpeningBonusEligibilityLabel,
  isOpeningLongRangeEligible,
  openingRangeThreshold,
  officialBrawlerClasses,
  type DraftRoleFilter,
} from "@shared/draft";
import { BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL, getBrawlerAttackRangeBand, type AttackRangeBand } from "@shared/brawlerAttackRangeBands";

const LOGO_URL = LOGO;

type TierFilter = "Todos" | Tier;
type MatchupFilter = "Todos" | "has-counters" | "countered-by";
type RangeSort = "highest" | "lowest" | "name";
const classFilterOptions = ["Todas", ...officialBrawlerClasses] as const;
type BrawlerClassFilter = (typeof classFilterOptions)[number];

function imageFor(item: BrawlerCatalogItem) {
  const id = item.brawlerId ?? additionalBrawlerAssetIds[item.brawler];
  return id ? `https://cdn.brawlify.com/brawlers/borderless/${id}.png` : null;
}

function formatMetric(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "—";
}

function formatScore(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "—";
}

function roleLabel(role: BrawlerCatalogItem["role"]) {
  return draftRoleLabels[role];
}

function roleClass(role: BrawlerCatalogItem["role"]) {
  return role === "mid" ? "is-mid" : role === "side" ? "is-side" : "is-flex";
}

function formatRangeBand(band: AttackRangeBand | null) {
  if (!band) return "Não publicado";
  return `${band.minTiles.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}–${band.maxTiles.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} blocos`;
}

function CatalogSidebar() {
  const navItems = [
    { label: "Dashboard", href: "/", icon: Target },
    { label: "Mapas Ranked", href: "/#maps", icon: SlidersHorizontal },
    { label: "Draft Híbrido", href: "/draft", icon: Sparkles },
    { label: "Brawlers", href: "/brawlers", icon: Crosshair },
    { label: "Fontes", href: "/#sources", icon: Radio },
    { label: "Como funciona", href: "/#formula", icon: Trophy },
  ];

  return (
    <aside className="app-sidebar draft-sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark-shell"><img src={LOGO_URL} alt="" className="brand-mark" /></div>
        <div><div className="brand-name">Brawl Híbrido</div><div className="brand-kicker">Ranked intelligence</div></div>
      </div>
      <div className="sidebar-status"><span className="status-pulse" /><span>CATÁLOGO LIVE</span><strong>Roster de todas as fontes</strong></div>
      <nav className="sidebar-nav" aria-label="Navegação principal">
        <div className="nav-label">Workspace</div>
        {navItems.map(({ label, href, icon: Icon }) => <a key={href} href={href} className={`sidebar-link ${href === "/brawlers" ? "is-active" : ""}`}><Icon size={18} /><span>{label}</span></a>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-note"><div className="note-icon"><Swords size={16} /></div><div><strong>Matchup intelligence</strong><p>Consulta os dois lados de cada confronto.</p></div></div>
      <div className="sidebar-footer"><span className="footer-dot" /> Perfis por brawler · dados transparentes</div>
    </aside>
  );
}

function CatalogTopbar({ onRefresh, isRefreshing, refreshProgress, liveState }: { onRefresh: () => void; isRefreshing: boolean; refreshProgress?: string | null; liveState: "connecting" | "live" | "offline" }) {
  const label = liveState === "live" ? "Live · SSE" : liveState === "connecting" ? "A ligar…" : "Offline · fallback";
  return (
    <header className="topbar">
      <div className="topbar-crumbs"><span className="crumb-muted">Ranked</span><span>›</span><span className="crumb-muted">Brawl Híbrido</span><span>›</span><span className="crumb-active">Brawlers & Counters</span></div>
      <div className="topbar-actions">
        <span className="live-chip"><span className="live-dot" /> {label}</span>
        <button className="refresh-button" onClick={onRefresh} disabled={isRefreshing} title={isRefreshing ? refreshProgress ?? "A sincronização está a decorrer em segundo plano" : "Atualizar catálogo"} aria-label="Atualizar catálogo"><Radio size={16} className={isRefreshing ? "animate-pulse" : undefined} /><span>{isRefreshing ? refreshProgress ?? "A atualizar…" : "Atualizar agora"}</span></button>
        <div className="profile-chip"><span className="profile-avatar">BH</span><span className="profile-label">Analista</span></div>
      </div>
    </header>
  );
}

function CounterName({ name, onPick }: { name: string; onPick: (name: string) => void }) {
  return <button type="button" className="counter-name-button" onClick={() => onPick(name)}>{name}</button>;
}

function MetricChip({ label, value, accent = "cyan" }: { label: string; value: string; accent?: "cyan" | "amber" | "violet" }) {
  return <div className={`brawler-metric-chip ${accent}`}><span>{label}</span><strong>{value}</strong></div>;
}

function BrawlerCard({ item, selected, onSelect }: { item: BrawlerCatalogItem; selected: boolean; onSelect: () => void }) {
  const image = imageFor(item);
  return (
    <Link href={`/brawlers/${encodeURIComponent(item.brawler)}`} className={`brawler-catalog-card ${selected ? "is-selected" : ""}`} onClick={onSelect} aria-label={`Abrir perfil de ${item.brawler}`}>
      <div className="brawler-card-visual">
        {image ? <img src={image} alt={`${item.brawler} — ${roleLabel(item.role)}`} loading="lazy" /> : <span>{item.brawler.slice(0, 2).toUpperCase()}</span>}
        {item.isRankedAvailable ? <span className={`brawler-role-pill ${roleClass(item.role)}`}>{roleLabel(item.role)}</span> : <span className="brawler-role-pill is-flex">Fora do Ranked</span>}
        <span className={`brawler-tier-pill tier-${(item.bestRow.tier ?? "B").toLowerCase()}`}>{item.isRankedAvailable ? item.bestRow.tier ?? "—" : "—"}</span>
      </div>
      <div className="brawler-card-copy"><strong>{item.brawler}</strong><span>{item.isRankedAvailable ? `${item.profile.counters.length} counters · ${item.profile.counteredBy.length} respostas` : "Aguardando estreia na rotação"}</span></div>
      <div className="brawler-card-foot"><span>Score {item.isRankedAvailable ? formatScore(item.bestRow.score) : "—"}</span><span>{item.isRankedAvailable ? `WR ${formatMetric(item.winRate)}` : "Sem métricas Ranked"}</span></div>
    </Link>
  );
}

function BrawlerDetail({ item, catalog, onPick }: { item: BrawlerCatalogItem; catalog: BrawlerCatalogItem[]; onPick: (name: string) => void }) {
  const image = imageFor(item);
  const [opponentName, setOpponentName] = useState(item.profile.counteredBy[0] ?? item.profile.counters[0] ?? "");
  const opponent = catalog.find((entry) => entry.brawler.toLowerCase() === opponentName.toLowerCase());
  const matchup = opponent ? getCounterMatchup(item.brawler, opponent.brawler, undefined, item.bestRow.modeId) : null;

  useEffect(() => {
    setOpponentName(item.profile.counteredBy[0] ?? item.profile.counters[0] ?? "");
  }, [item.brawler, item.profile.counteredBy, item.profile.counters]);

  const selectCounter = (name: string) => {
    setOpponentName(name);
    onPick(name);
  };

  return (
    <section className="brawler-detail-panel" aria-live="polite">
      <div className="brawler-detail-hero">
        <div className="brawler-detail-avatar">{image ? <img src={image} alt={item.brawler} /> : <span>{item.brawler.slice(0, 2).toUpperCase()}</span>}</div>
        <div className="brawler-detail-title"><div className="section-kicker">BRAWLER PROFILE <span>1V1 MATCHUP INTELLIGENCE</span></div><h2>{item.brawler}</h2><div className="brawler-detail-tags">{item.isRankedAvailable ? <span className={`brawler-role-pill ${roleClass(item.role)}`}>{roleLabel(item.role)}</span> : <span className="brawler-role-pill is-flex">Fora do Ranked</span>}<span className="brawler-detail-map">{item.isRankedAvailable ? `Melhor registo: ${item.bestRow.map} · ${item.bestRow.mode}` : "Sem aparições na rotação atual"}</span></div></div>
        <div className="brawler-detail-score"><small>HYBRID SCORE</small><strong>{item.isRankedAvailable ? formatScore(item.bestRow.score) : "—"}</strong><span>{item.isRankedAvailable ? `Tier ${item.bestRow.tier ?? "—"}` : "Aguardando dados Ranked"}</span></div>
      </div>

      <div className="brawler-detail-metrics"><MetricChip label="Win Rate" value={item.isRankedAvailable ? formatMetric(item.winRate) : "Aguarda dados"} /><MetricChip label="Use Rate" value={item.isRankedAvailable ? formatMetric(item.usageRate) : "Aguarda dados"} accent="violet" /><MetricChip label="Countera" value={`${item.profile.counters.length}`} accent="amber" /><MetricChip label="É counterado por" value={`${item.profile.counteredBy.length}`} /></div>

      <div className="brawler-matchup-columns">
        <article className="matchup-list-card counters"><div className="matchup-list-head"><div><span className="section-kicker">PRESSÃO A FAVOR</span><h3>Countera</h3></div><span className="matchup-count">{item.profile.counters.length}</span></div><p>Alvos onde {item.brawler} tem uma resposta direta no catálogo atual.</p><div className="counter-name-list">{item.profile.counters.length ? item.profile.counters.map((name) => <CounterName key={name} name={name} onPick={selectCounter} />) : <span className="muted-empty">Sem relação explícita publicada.</span>}</div></article>
        <article className="matchup-list-card countered"><div className="matchup-list-head"><div><span className="section-kicker">RISCO DIRETO</span><h3>Counterado por</h3></div><span className="matchup-count">{item.profile.counteredBy.length}</span></div><p>Respostas que podem negar o plano de {item.brawler} numa lane.</p><div className="counter-name-list">{item.profile.counteredBy.length ? item.profile.counteredBy.map((name) => <CounterName key={name} name={name} onPick={selectCounter} />) : <span className="muted-empty">Sem relação explícita publicada.</span>}</div></article>
      </div>

      <div className="brawler-1v1-strip"><div><div className="section-kicker"><Swords size={12} /> TESTE 1V1</div><h3>Ver matchup contra um alvo</h3><p>Seleciona qualquer brawler para ler a vantagem direta e a posição recomendada.</p></div><label className="brawler-opponent-select"><span>Adversário</span><select value={opponentName} onChange={(event) => setOpponentName(event.target.value)}><option value="">Escolher alvo</option>{catalog.filter((entry) => entry.brawler !== item.brawler).map((entry) => <option key={entry.brawler} value={entry.brawler}>{entry.brawler}</option>)}</select><ChevronDown size={14} /></label>{opponent && matchup ? <div className="brawler-matchup-result"><strong>{matchup.counterScore.toFixed(0)}%</strong><span>{item.brawler} vs {opponent.brawler}</span><small>{matchup.position === "mid" ? "Mid" : matchup.position === "left" ? "Lane esquerda" : "Lane direita"} · counter direto</small></div> : <div className="brawler-matchup-result is-empty"><strong>—</strong><span>Escolhe um alvo</span><small>para calcular o confronto</small></div>}</div>

      <div className="brawler-build-note"><div className="build-note-icon"><Zap size={16} /></div><div><span className="section-kicker">COACHING CONTEXT</span><strong>{item.isRankedAvailable ? `Build de referência para ${item.bestRow.mode}` : "Ainda sem build Ranked"}</strong><p>{item.isRankedAvailable ? `Gadget: ${item.build?.gadget} · Star Power: ${item.build?.starPower} · Engrenagens: ${item.build?.gears.join(", ")}` : "O site não cria build, taxa de vitória, uso ou matchups de Ranked antes das fontes publicarem estes dados."}</p></div></div>
    </section>
  );
}

function AttackRangeTable({
  rows,
  sort,
  onSortChange,
  openingBonusRate,
}: {
  rows: Array<{ item: BrawlerCatalogItem; range: AttackRangeBand | null }>;
  sort: RangeSort;
  onSortChange: (sort: RangeSort) => void;
  openingBonusRate: number;
}) {
  const openingBonusCount = rows.filter(({ item }) => isOpeningLongRangeEligible(item.brawler)).length;
  return (
    <section className="attack-range-section" aria-labelledby="attack-range-title">
      <div className="attack-range-head">
        <div>
          <div className="section-kicker"><Target size={12} /> ALCANCE DO ATAQUE BASE <span>CATÁLOGO COMPLETO</span></div>
          <h2 id="attack-range-title">Tabela de alcance</h2>
          <p>Faixas do ataque principal, em blocos. O selo de abertura marca +{openingBonusRate * 100}% nos Picks 1–3: regra geral de alcance ≥{openingRangeThreshold} blocos, com inclusões e exclusões táticas definidas no Draft.</p>
        </div>
        <div className="attack-range-controls" aria-label="Ordenar tabela de alcance">
          <span>Ordenar</span>
          <button type="button" className={sort === "highest" ? "is-active" : ""} onClick={() => onSortChange("highest")}>Maior</button>
          <button type="button" className={sort === "lowest" ? "is-active" : ""} onClick={() => onSortChange("lowest")}>Menor</button>
          <button type="button" className={sort === "name" ? "is-active" : ""} onClick={() => onSortChange("name")}>A–Z</button>
        </div>
      </div>
      <div className="attack-range-source"><span className="tiny-live" /> Fonte de faixas: <a href={BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL} target="_blank" rel="noreferrer">Brawl Planet · Attack Range</a><span>· {rows.length} brawlers visíveis · {openingBonusCount} com bónus de abertura</span></div>
      <div className="attack-range-table-wrap">
        <table className="attack-range-table">
          <thead><tr><th scope="col">Brawler</th><th scope="col">Alcance base</th><th scope="col">Faixa</th><th scope="col">Bónus abertura</th><th scope="col">Função</th><th scope="col">Classe</th></tr></thead>
          <tbody>{rows.map(({ item, range }) => {
            const image = imageFor(item);
            const hasOpeningBonus = isOpeningLongRangeEligible(item.brawler);
            return <tr key={item.brawler}>
              <td><Link href={`/brawlers/${encodeURIComponent(item.brawler)}`} className="attack-range-brawler"><span className="attack-range-avatar">{image ? <img src={image} alt="" loading="lazy" /> : item.brawler.slice(0, 2).toUpperCase()}</span><strong>{item.brawler}</strong></Link></td>
              <td><span className={`attack-range-value ${range ? "" : "is-unavailable"}`}>{formatRangeBand(range)}</span>{!range && <small>A aguardar publicação</small>}</td>
              <td>{range ? <span className={`attack-range-band band-${range.id.toLowerCase()}`}>{range.id} · {range.label}</span> : <span className="attack-range-band is-unavailable">— · Sem faixa</span>}</td>
              <td>{hasOpeningBonus ? <span className="opening-bonus-pill"><Zap size={11} /> +{openingBonusRate * 100}%<small>{getOpeningBonusEligibilityLabel(item.brawler)}</small></span> : <span className="opening-bonus-pill is-inactive">—</span>}</td>
              <td><span className={`brawler-role-pill ${roleClass(item.role)} attack-range-role`}>{roleLabel(item.role)}</span></td>
              <td><span className="attack-range-class">{getBrawlerClass(item.brawler)}</span></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

export default function Brawlers() {
  const roleVersion = useDraftRolesVersion();
  const { version: counterSnapshotVersion, snapshot: counterSnapshot } = useCounterSync();
  const rankedSync = useRankedSync();
  const statusQuery = trpc.rankedSync.status.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: true });
  const trpcUtils = trpc.useUtils();
  // Mesmo hook das outras páginas: arranca o trabalho e não fica à espera dele.
  const { isRefreshing, progress: syncProgress, start: handleRefresh } = useSyncRefresh();
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<TierFilter>("Todos");
  const [role, setRole] = useState<DraftRoleFilter>("Todas");
  const [classFilter, setClassFilter] = useState<BrawlerClassFilter>("Todas");
  const [matchup, setMatchup] = useState<MatchupFilter>("Todos");
  const [rangeSort, setRangeSort] = useState<RangeSort>("highest");
  const [selectedName, setSelectedName] = useState("");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const { weights: hybridWeights } = useHybridWeights();
  const { topBrawlWeight } = useSourceBalance();
  const { rules: draftRules } = useDraftRules();

  const liveRows = useMemo(() => normalizeRankedRows(rankedSync.snapshot?.rows ?? allRankedRows, hybridWeights.winRate / 100, topBrawlWeight), [hybridWeights.winRate, topBrawlWeight, rankedSync.snapshot?.rows]);
  const officialCatalogRows = useMemo(() => (rankedSync.snapshot?.officialBrawlers ?? []).map((brawler) => ({
    map: "Ainda não disponível",
    mode: "Ranked",
    modeId: "ranked",
    brawler: brawler.name,
    score: 0,
    tier: "B" as const,
    brawlerId: brawler.id,
    dataStatus: "partial" as const,
    rankedStatus: "unavailable" as const,
  })), [rankedSync.snapshot?.officialBrawlers]);
  const catalogRows = useMemo(() => [...liveRows, ...officialCatalogRows, ...preRankedBrawlerCatalogRows], [liveRows, officialCatalogRows]);
  const catalog = useMemo(() => buildBrawlerCatalog(catalogRows, counterSnapshot), [catalogRows, counterSnapshot, counterSnapshotVersion, roleVersion]);
  const filteredCatalog = useMemo(() => catalog.filter((item) => {
    const matchesQuery = item.brawler.toLowerCase().includes(query.trim().toLowerCase());
    const matchesTier = tier === "Todos" || (item.isRankedAvailable && item.bestRow.tier === tier);
    const matchesRole = role === "Todas" || item.role === role;
    const matchesClass = classFilter === "Todas" || getBrawlerClass(item.brawler) === classFilter;
    const matchesMatchup = matchup === "Todos" || (matchup === "has-counters" ? item.profile.counters.length > 0 : item.profile.counteredBy.length > 0);
    return matchesQuery && matchesTier && matchesRole && matchesClass && matchesMatchup;
  }), [catalog, classFilter, matchup, query, role, tier]);
  const rangeRows = useMemo(() => filteredCatalog
    .map((item) => ({ item, range: getBrawlerAttackRangeBand(item.brawler) }))
    .sort((left, right) => {
      if (rangeSort === "name") return left.item.brawler.localeCompare(right.item.brawler, "pt-PT");
      const missingValue = rangeSort === "highest" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
      const leftValue = left.range ? (rangeSort === "highest" ? left.range.maxTiles : left.range.minTiles) : missingValue;
      const rightValue = right.range ? (rangeSort === "highest" ? right.range.maxTiles : right.range.minTiles) : missingValue;
      const comparison = rangeSort === "highest" ? rightValue - leftValue : leftValue - rightValue;
      return comparison || left.item.brawler.localeCompare(right.item.brawler, "pt-PT");
    }), [filteredCatalog, rangeSort]);
  const selected = filteredCatalog.find((item) => item.brawler === selectedName) ?? catalog.find((item) => item.brawler === selectedName) ?? filteredCatalog[0] ?? catalog[0];
  const sourceLabel = `${rankedSync.source === "sse" && rankedSync.syncState === "success" ? "DADOS ATUALIZADOS · SSE" : rankedSync.syncState === "partial" ? "DADOS PARCIAIS · SSE" : "FALLBACK ATIVO"}${rankedSync.version ? ` · ${rankedSync.version}` : ""}`;
  const capturedAt = rankedSync.capturedAt ?? statusQuery.data?.capturedAt;

  useEffect(() => {
    if (selected && selected.brawler !== selectedName) setSelectedName(selected.brawler);
  }, [selected, selectedName]);

  return (
    <div className="app-shell draft-shell brawlers-shell" style={{ backgroundColor: "#0b0e14" }}>
      <CatalogSidebar />
      <div className="app-main">
        <CatalogTopbar onRefresh={handleRefresh} isRefreshing={isRefreshing} refreshProgress={syncProgress} liveState={rankedSync.connectionState} />
        <main className="brawlers-main">
          <section className="brawlers-hero"><div><div className="eyebrow"><span className="eyebrow-line" /> Brawler intelligence <span className="eyebrow-dot" /></div><h1>Todos os brawlers.<br /><em>Alcance e matchup.</em></h1><p>Pesquisa o catálogo completo, consulta a faixa de alcance do ataque principal e lê quem cada brawler countera, quem o countera e em que posição jogar o confronto.</p></div><div className="brawlers-hero-stats"><div><strong>{catalog.length || 106}</strong><span>BRAWLERS</span></div><div><strong>6</strong><span>FAIXAS DE ALCANCE</span></div><div><strong>1V1</strong><span>MATCHUP LENS</span></div></div></section>

          <section className="brawlers-status-banner"><div className="section-kicker"><span className="tiny-live" /> CATÁLOGO DE DADOS <span>{sourceLabel}</span></div><p>{capturedAt ? `Snapshot ${rankedSync.version ? `${rankedSync.version} · ` : ""}atualizada às ${new Date(capturedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })} (${rankedSync.syncState}).` : "A usar a base Ranked incluída no projeto."} Counters e counterados gerais agregam todas as fontes. BrawlScope fornece listas por modo; Planet e PL Prodigy fornecem evidência global, também disponível no modo selecionado.</p></section>

          <AttackRangeTable rows={rangeRows} sort={rangeSort} onSortChange={setRangeSort} openingBonusRate={draftRules.openingLongRange} />

          <section className="brawlers-workspace">
            <DraftRoleEditor names={catalog.map(item => item.brawler)} /><div className="brawlers-toolbar"><label className="brawler-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar brawler…" aria-label="Procurar brawler" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar pesquisa"><X size={14} /></button>}</label><div className="brawler-filter-group"><span>Tier</span>{(["Todos", "S", "A", "B"] as TierFilter[]).map((option) => <button type="button" key={option} onClick={() => setTier(option)} className={tier === option ? "is-active" : ""}>{option === "Todos" ? "Todos" : `Tier ${option}`}</button>)}</div><div className="brawler-filter-group"><span>Função</span>{(["Todas", "mid", "side", "flex"] as DraftRoleFilter[]).map((option) => <button type="button" key={option} onClick={() => setRole(option)} className={role === option ? "is-active" : ""}>{draftRoleLabels[option]}</button>)}</div><label className="brawler-select-filter"><SlidersHorizontal size={14} /><select value={classFilter} onChange={(event) => setClassFilter(event.target.value as BrawlerClassFilter)} aria-label="Filtrar por classe"><option value="Todas">Todas as classes</option>{classFilterOptions.filter((option) => option !== "Todas").map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={13} /></label><label className="brawler-select-filter"><SlidersHorizontal size={14} /><select value={matchup} onChange={(event) => setMatchup(event.target.value as MatchupFilter)}><option value="Todos">Todos os matchups</option><option value="has-counters">Tem counters</option><option value="countered-by">Tem respostas</option></select><ChevronDown size={13} /></label></div>
            <div className="brawlers-catalog-meta"><span><span className="tiny-live" /> {filteredCatalog.length} de {catalog.length} brawlers visíveis</span><span>Seleciona um cartão para abrir o perfil completo.</span></div>
            <div className="brawlers-content-grid"><div className="brawler-catalog-grid">{filteredCatalog.map((item) => <BrawlerCard key={item.brawler} item={item} selected={selected?.brawler === item.brawler} onSelect={() => setSelectedName(item.brawler)} />)}{filteredCatalog.length === 0 && <div className="brawlers-empty"><Crosshair size={24} /><strong>Nenhum brawler encontrado.</strong><span>Experimenta limpar a pesquisa ou trocar os filtros.</span></div>}</div>{selected && <BrawlerDetail key={selected.brawler} item={selected} catalog={catalog} onPick={(name) => setSelectedName(name)} />}</div>
          </section>
        </main>
        <footer className="app-footer"><span>BRAWL HÍBRIDO / BRAWLERS & COUNTERS</span><span>Dados, matchup e contexto no mesmo lugar.</span></footer>
      </div>
      <button className="mobile-menu-button" onClick={() => setMobileSidebar(true)} aria-label="Abrir menu"><SlidersHorizontal size={17} /></button>
      {mobileSidebar && <button className="sidebar-backdrop lg:hidden" aria-label="Fechar menu" onClick={() => setMobileSidebar(false)} />}
      {mobileSidebar && <div className="brawlers-mobile-sidebar"><CatalogSidebar /></div>}
      <a className="scroll-top-button draft-back-home" href="/draft" aria-label="Voltar ao Draft"><ArrowLeft size={17} /></a>
    </div>
  );
}
