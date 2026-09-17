/*
 * Brawl Híbrido — dashboard page.
 * Style reminder: Championship Arena — dark carbon surfaces, electric violet,
 * cyan telemetry, amber S-tier emphasis, asymmetric data-first composition.
 */
import { LOGO, IMAGEM_PRINCIPAL, FUNDO_DE_MAPA, TEXTURA, fundoCom } from "@/lib/imagens";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Crosshair,
  Database,
  Download,
  Filter,
  Flame,
  Gauge,
  Layers3,
  Menu,
  Search,
  Radio,
  RotateCcw,
  ShieldCheck,
  Scale,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Trophy,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useSyncRefresh } from "@/lib/useSyncRefresh";
import {
  allMapSummaries,
  allRankedMaps,
  allRankedRows,
  buildActiveRankedMapCatalog,
  buildMapDisplayRows,
  buildRankedRotationComparison,
  buildRankedRotationAverages,
  normalizeRankedMap,
  normalizeRankedRows,
  type MapSummary,
  type RankedRow,
  type Tier,
} from "@/data/rankedData";
import { Slider } from "@/components/ui/slider";
import { additionalBrawlerAssetIds, additionalMapAssetIds } from "@/data/additionalRankedData";
import { useHybridWeights } from "@/lib/hybridWeights";
import { officialSourceBalance, useSourceBalance, type SourceBalancePreference } from "@/lib/sourceBalance";
import { buildMapsTsv } from "@shared/mapTsv";
import { useRankedSync } from "@/contexts/RankedSyncContext";
import { MobileNav } from "@/components/MobileNav";

const LOGO_URL = LOGO;

const modeIcons: Record<string, typeof Target> = {
  bounty: Crosshair,
  heist: Database,
  "hot-zone": Activity,
  "gem-grab": Sparkles,
  "brawl-ball": Trophy,
  knockout: ShieldCheck,
};

const tierMeta: Record<Tier, { label: string; className: string; dot: string }> = {
  S: { label: "Tier S", className: "tier-s", dot: "bg-[#F8B84E]" },
  A: { label: "Tier A", className: "tier-a", dot: "bg-[#22D3EE]" },
  B: { label: "Tier B", className: "tier-b", dot: "bg-[#94A3B8]" },
};

type RankingPreset = { id: string; name: string; winRateWeight: number };

const RANKING_PRESETS_STORAGE_KEY = "brawl-hibrido:ranking-laboratory-presets:v2";

function readRankingPresets(): RankingPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(RANKING_PRESETS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((preset): RankingPreset[] => {
      if (!preset || typeof preset.name !== "string" || typeof preset.winRateWeight !== "number") return [];
      const weight = Math.round(preset.winRateWeight);
      if (weight < 0 || weight > 100) return [];
      return [{
        id: typeof preset.id === "string" && preset.id ? preset.id : `${preset.name}-${weight}`,
        name: preset.name.trim().slice(0, 28),
        winRateWeight: weight,
      }];
    }).filter((preset) => preset.name.length > 0);
  } catch {
    return [];
  }
}

function formatScore(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "—";
}

function formatSyncDate(value: Date | string | null | undefined) {
  if (!value) return "Ainda não sincronizado";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return "Base incluída no projeto";
  return date.toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const mapAssetIds: Record<string, string> = {
  "Beach Ball": "15000143",
  "Belle's Rock": "15000368",
  "Bridge Too Far": "15000072",
  "Center Stage": "15000132",
  "Double Swoosh": "15000115",
  "Dry Season": "15000083",
  "Dueling Beetles": "15000306",
  "Flaring Phoenix": "15000440",
  "Gem Fort": "15000010",
  "Hard Rock Mine": "15000007",
  "Hideout": "15000022",
  "Hot Potato": "15000053",
  "Layer Cake": "15000082",
  "Open Business": "15000292",
  "Out in the Open": "15000548",
  "Parallel Plays": "15000293",
  "Pinball Dreams": "15000118",
  "Spiraling Out": "15001021",
  ...additionalMapAssetIds,
};

function mapImageFor(mapName: string) {
  const mapId = mapAssetIds[mapName];
  return mapId ? `https://cdn.brawlify.com/maps/regular/${mapId}.png` : FUNDO_DE_MAPA;
}

/** Sem imagem publicada, o cartão fica só com o fundo do tema. */
function fundoDeMapa(imagem: string | null) {
  return imagem ? { backgroundImage: `url(${imagem})` } : undefined;
}

function brawlerImageFor(brawler: string, brawlerId?: number | null) {
  const id = brawlerId ?? additionalBrawlerAssetIds[brawler];
  return id ? `https://cdn.brawlify.com/brawlers/borderless/${id}.png` : null;
}

function usageFor(_mapName: string, _brawler: string) {
  return null;
}

function ModeIcon({ modeId, size = 16 }: { modeId: string; size?: number }) {
  const Icon = modeIcons[modeId] ?? Target;
  return <Icon size={size} strokeWidth={2.2} />;
}

function BrandMotif({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-motif ${compact ? "is-compact" : ""}`} aria-hidden="true">
      <img src={LOGO_URL} alt="" />
      <span>{compact ? "BH" : "BRAWL HÍBRIDO"}</span>
    </span>
  );
}

function TierBadge({ tier }: { tier: Tier | null }) {
  if (!tier) return <span className="tier-badge tier-pending"><span className="tier-dot bg-[#64748B]" />—</span>;
  const meta = tierMeta[tier];
  return (
    <span className={`tier-badge ${meta.className}`}>
      <span className={`tier-dot ${meta.dot}`} />
      {tier}
    </span>
  );
}

function Sidebar({
  activeSection,
  onSectionChange,
  open,
  onClose,
  capturedAt,
}: {
  activeSection: string;
  onSectionChange: (section: string) => void;
  open: boolean;
  onClose: () => void;
  capturedAt: Date | string | null | undefined;
}) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: Gauge },
    { id: "maps", label: "Mapas Ranked", icon: Layers3 },
    { id: "draft", label: "Draft Híbrido", icon: Sparkles, href: "/draft" },
    { id: "brawlers", label: "Brawlers", icon: Crosshair, href: "/brawlers" },
    { id: "sources", label: "Fontes", icon: Radio },
    { id: "formula", label: "Como funciona", icon: CircleHelp },
  ];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            aria-label="Fechar menu"
            className="sidebar-backdrop lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>
      <aside className={`app-sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark-shell">
            <img src={LOGO_URL} alt="" className="brand-mark" />
          </div>
          <div>
            <div className="brand-name">Brawl Híbrido</div>
            <div className="brand-kicker">Ranked intelligence</div>
          </div>
          <button className="sidebar-close lg:hidden" onClick={onClose} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-status">
          <span className="status-pulse" />
          <span>ROTAÇÃO ATUAL</span>
          <strong>26 mapas catalogados</strong>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          <div className="nav-label">Workspace</div>
          {navItems.map(({ id, label, icon: Icon, href }) => (
            href ? (
              <a key={id} href={href} className="sidebar-link">
                <Icon size={18} />
                <span>{label}</span>
              </a>
            ) : (
              <button
                key={id}
                className={`sidebar-link ${activeSection === id ? "is-active" : ""}`}
                onClick={() => {
                  onSectionChange(id);
                  onClose();
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
                {id === "maps" && <span className="nav-count">26</span>}
              </button>
            )
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-note">
          <div className="note-icon"><Zap size={16} /></div>
          <div>
            <strong>Score Híbrido</strong>
            <p>Win Rate + leitura de meta numa só métrica.</p>
          </div>
        </div>
        <div className="sidebar-footer">
          <span className="footer-dot" />
          Última sync: {formatSyncDate(capturedAt)}
        </div>
      </aside>
    </>
  );
}

function Topbar({ onMenu, capturedAt, lastStatus, liveState, onRefresh, isRefreshing, refreshProgress }: { onMenu: () => void; capturedAt: Date | string | null | undefined; lastStatus: string; liveState: "connecting" | "live" | "offline"; onRefresh: () => void; isRefreshing: boolean; refreshProgress?: string | null }) {
  const isLive = Boolean(capturedAt) && lastStatus === "success";
  const liveLabel = liveState === "live" ? "Live · SSE" : liveState === "connecting" ? "A ligar…" : "Offline · fallback";
  return (
    <header className="topbar">
      <button className="mobile-menu-button lg:hidden" onClick={onMenu} aria-label="Abrir menu">
        <Menu size={20} />
      </button>
      <div className="topbar-crumbs">
        <span className="crumb-muted">Ranked</span>
        <ChevronRight size={14} />
        <span className="crumb-active">Brawl Híbrido</span>
      </div>
      <div className="topbar-actions">
        <span className="live-chip"><span className="live-dot" /> {isLive ? liveLabel : "Snapshot local"}</span>
        <button className="refresh-button" title={isRefreshing ? refreshProgress ?? "A sincronização está a decorrer em segundo plano" : `Última atualização: ${formatSyncDate(capturedAt)}`} onClick={onRefresh} disabled={isRefreshing} aria-label={isRefreshing ? `A atualizar dados${refreshProgress ? `: ${refreshProgress}` : ""}` : "Atualizar dados agora"}>
          <Activity size={16} className={isRefreshing ? "animate-spin" : undefined} />
          <span>{isRefreshing ? refreshProgress ?? "A atualizar…" : "Atualizar agora"}</span>
        </button>
        <div className="profile-chip">
          <span className="profile-avatar">BH</span>
          <span className="profile-label">Analista</span>
        </div>
      </div>
    </header>
  );
}

function Hero({ selectedMap, onExplore }: { selectedMap: MapSummary; onExplore: () => void }) {
  return (
    <section className="hero-panel" style={IMAGEM_PRINCIPAL ? { backgroundImage: `url(${IMAGEM_PRINCIPAL})` } : undefined}>
      <div className="hero-overlay" />
      <div className="hero-content">
        <div className="eyebrow"><span className="eyebrow-line" /> Competitive intelligence <span className="eyebrow-dot" /></div>
        <h1>Joga com dados.<br /><em>Ganha com contexto.</em></h1>
        <p className="hero-copy">
          A leitura híbrida da rotação Ranked: força competitiva, consistência de mapa e sinais de meta reunidos numa tabela que vai direto ao ponto.
        </p>
        <div className="hero-actions">
          <button className="primary-button" onClick={onExplore}>
            Explorar {selectedMap.name} <ChevronRight size={17} />
          </button>
          <span className="hero-footnote"><Sparkles size={14} /> 106 brawlers por mapa</span>
        </div>
      </div>
      <div className="hero-orbit orbit-one" />
      <div className="hero-orbit orbit-two" />
      <div className="hero-stamp">
        <img src={LOGO_URL} alt="" />
        <span>BH</span>
        <small>INTEL</small>
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, label, value, detail, accent }: { icon: typeof Gauge; label: string; value: string; detail: string; accent: string }) {
  return (
    <motion.div className={`stat-card ${accent}`} whileHover={{ y: -3 }} transition={{ duration: 0.18 }}>
      <span className="stat-stamp">BH</span>
      <div className="stat-icon"><Icon size={17} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </motion.div>
  );
}

function MapSelector({
  maps,
  selectedMap,
  onSelect,
  modeFilter,
  onModeFilter,
  modeOptions,
  rows,
  onCopyMaps,
  onDownloadMaps,
}: {
  maps: MapSummary[];
  selectedMap: MapSummary;
  onSelect: (map: MapSummary) => void;
  modeFilter: string;
  onModeFilter: (mode: string) => void;
  modeOptions: string[];
  rows: RankedRow[];
  onCopyMaps: () => void;
  onDownloadMaps: () => void;
}) {
  const visibleMaps = modeFilter === "Todos" ? maps : maps.filter((map) => map.mode === modeFilter);

  /**
   * Melhor brawler de cada mapa e desvio face à média da rotação.
   *
   * O cartão mostrava uma seta "↗" fixa ao lado do top score — apontava sempre
   * para cima, em todos os mapas, independentemente dos dados. Uma tendência a
   * sério exigia histórico, que o projeto não guarda; o que se pode dizer com
   * verdade é se este mapa está acima ou abaixo da média da rotação, e isso
   * calcula-se com o que já está em memória.
   */
  const mapInsights = useMemo(() => {
    const melhorPorMapa = new Map<string, { brawler: string; score: number }>();
    for (const row of rows) {
      if (typeof row.score !== "number") continue;
      const atual = melhorPorMapa.get(row.map);
      if (!atual || row.score > atual.score) melhorPorMapa.set(row.map, { brawler: row.brawler, score: row.score });
    }
    const topScores = maps.map((map) => map.topScore).filter((value) => Number.isFinite(value));
    const media = topScores.length ? topScores.reduce((soma, valor) => soma + valor, 0) / topScores.length : 0;
    return { melhorPorMapa, media };
  }, [rows, maps]);
  return (
    <section className="map-section" id="maps">
      <div className="section-heading-row">
        <div>
          <div className="section-kicker">Biblioteca Ranked <span>01 — 26</span></div>
          <div className="section-motif"><BrandMotif compact /><span className="hud-line" /><span className="hud-label">LIVE ROTATION / 26 MAPS</span></div>
          <h2>Escolhe o teu mapa</h2>
        </div>
        <div className="map-tools">
          <button className="map-export-button" onClick={onCopyMaps} aria-label="Copiar lista de mapas e modos em TSV" title="Copiar lista completa em TSV">
            <Clipboard size={14} /> <span>Copiar TSV</span>
          </button>
          <button className="map-export-button map-export-download" onClick={onDownloadMaps} aria-label="Descarregar lista de mapas e modos em TSV" title="Descarregar lista completa em TSV">
            <Download size={14} /> <span>Descarregar</span>
          </button>
          <div className="mode-filter-wrap">
            <Filter size={15} />
            <select aria-label="Filtrar por modo" value={modeFilter} onChange={(event) => onModeFilter(event.target.value)}>
              {modeOptions.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
            <ChevronDown size={14} className="select-chevron" />
          </div>
        </div>
      </div>
      <div className="map-strip">
        {visibleMaps.map((map, index) => {
          const selected = map.name === selectedMap.name;
          const melhor = mapInsights.melhorPorMapa.get(map.name);
          const desvio = map.topScore - mapInsights.media;
          return (
            <motion.button
              key={map.name}
              className={`map-card ${selected ? "is-selected" : ""}`}
              onClick={() => onSelect(map)}
              style={{ backgroundImage: fundoCom("linear-gradient(135deg, rgba(13,16,26,.78), rgba(22,15,43,.42))", selected ? mapImageFor(map.name) : FUNDO_DE_MAPA) }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: index * 0.025 }}
            >
              <span className="map-card-top">
                <span className={`map-card-mode mode-${map.modeId}`}><ModeIcon modeId={map.modeId} size={14} /> {map.mode}</span>
                <b>#{String(index + 1).padStart(2, "0")}</b>
              </span>
              <span className="map-card-name">
                <span className="map-card-thumb" style={fundoDeMapa(mapImageFor(map.name))} />
                {map.name}
              </span>
              {melhor ? (
                <span className="map-card-best">
                  <em>Melhor aqui</em>
                  <strong>{melhor.brawler}</strong>
                </span>
              ) : null}
              <span className="map-card-meta">
                <strong className="bh-figure">{map.topScore.toFixed(2)}</strong>
                <span className="map-card-meta-label">top score</span>
                {/*
                  * Comparação com a média da rotação — verdadeira e calculável.
                  * Substitui uma seta que apontava sempre para cima.
                  */}
                <span className={`map-card-delta ${desvio >= 0 ? "is-up" : "is-down"}`} title={`Média da rotação: ${mapInsights.media.toFixed(2)} pts`}>
                  {desvio >= 0 ? "▲" : "▼"} {Math.abs(desvio).toFixed(1)}
                </span>
              </span>
              <span className="map-card-action">Ver análise</span>
              {selected && <span className="map-selected-line" />}
            </motion.button>
          );
        })}
      </div>
      {visibleMaps.length === 0 && <div className="empty-map-state">Nenhum mapa encontrado neste modo.</div>}
    </section>
  );
}

function RotationAverages({
  sourceRows,
  activeMaps,
  expectedMapCount,
  capturedAt,
  isRefreshing,
  winRateWeight,
  topBrawlWeight,
}: {
  sourceRows: readonly RankedRow[];
  activeMaps: readonly MapSummary[];
  expectedMapCount: number;
  capturedAt: Date | string | null;
  isRefreshing: boolean;
  winRateWeight: number;
  topBrawlWeight: number;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedMode, setSelectedMode] = useState("Todos");
  const modeOptions = useMemo(
    () => ["Todos", ...Array.from(new Set(activeMaps.map((map) => map.mode)))],
    [activeMaps],
  );
  const mapsInScope = useMemo(
    () => selectedMode === "Todos" ? activeMaps : activeMaps.filter((map) => map.mode === selectedMode),
    [activeMaps, selectedMode],
  );
  const rows = useMemo(
    () => buildRankedRotationAverages(sourceRows, mapsInScope, winRateWeight, topBrawlWeight),
    [winRateWeight, topBrawlWeight, mapsInScope, sourceRows],
  );
  const mapCount = mapsInScope.length;
  const totalMapCount = selectedMode === "Todos" ? expectedMapCount : mapCount;
  const modeLabel = selectedMode === "Todos" ? "rotação completa" : selectedMode;

  useEffect(() => {
    if (!modeOptions.includes(selectedMode)) setSelectedMode("Todos");
  }, [modeOptions, selectedMode]);

  const matchingRows = useMemo(
    () => rows.filter((row) => row.brawler.toLowerCase().includes(query.trim().toLowerCase())),
    [query, rows],
  );
  const visibleRows = showAll || query ? matchingRows : matchingRows.slice(0, 12);
  const averageOfRotation = rows.reduce((total, row) => total + row.averageScore, 0) / Math.max(1, rows.length);
  const leader = rows[0];

  return (
    <section className="data-section rotation-section" id="rotation-averages">
      <div className="data-heading rotation-heading">
        <div>
          <div className="section-kicker">Média da rotação <span>01 — {String(totalMapCount).padStart(2, "0")}</span></div>
          <div className="section-motif"><BrandMotif compact /><span className="hud-line" /><span className="hud-label">ROTATION CONSISTENCY / {mapCount}/{totalMapCount} MAPS</span></div>
          <h2>Score Híbrido médio</h2>
          <p>A média de cada brawler nos <strong>{mapCount}/{totalMapCount} mapas de {modeLabel}</strong>. O cálculo é refeito automaticamente assim que a snapshot Ranked muda; cada mapa com Score Híbrido publicado entra uma única vez.</p>
        </div>
        <div className="rotation-kpis" aria-label="Resumo da média da rotação">
          <span><b>{leader?.brawler ?? "—"}</b><small>líder geral</small></span>
          <span><b>{formatScore(averageOfRotation)}</b><small>média global</small></span>
        </div>
      </div>
      <div className="toolbar rotation-toolbar">
        <label className="rotation-mode-select">
          <Filter size={16} />
          <span className="sr-only">Filtrar média por modo de jogo</span>
          <select value={selectedMode} onChange={(event) => { setSelectedMode(event.target.value); setShowAll(false); }} aria-label="Filtrar Score Híbrido médio por modo de jogo">
            {modeOptions.map((mode) => <option value={mode} key={mode}>{mode === "Todos" ? "Todos os modos" : mode}</option>)}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>
        <label className="search-field">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Procurar em ${modeLabel}...`} aria-label="Procurar brawler na média da rotação" />
          {query && <button aria-label="Limpar pesquisa da rotação" onClick={() => setQuery("")}><X size={14} /></button>}
        </label>
        <span className="rotation-count">{matchingRows.length} brawlers · {mapCount}/{totalMapCount} mapas · {isRefreshing ? "a atualizar…" : capturedAt ? `atualizada ${formatSyncDate(capturedAt)}` : "base local"}</span>
        {rows.length > 12 && !query && <button className="copy-button rotation-expand" onClick={() => setShowAll((current) => !current)}>{showAll ? "Ver resumo" : `Ver todos (${rows.length})`}</button>}
      </div>
      <div className="table-shell">
        <div className="data-table" role="table" aria-label={`Média do Score Híbrido por brawler em ${modeLabel}`}>
          <div className="table-row table-header" role="row">
            <div role="columnheader" className="rank-col">#</div>
            <div role="columnheader" className="brawler-col">Brawler</div>
            <div role="columnheader" className="tier-col">Tier médio</div>
            <div role="columnheader" className="usage-col">Mapas</div>
            <div role="columnheader" className="score-col">Média híbrida</div>
            <div role="columnheader" className="bar-col">Consistência</div>
          </div>
          {visibleRows.map((row, index) => {
            const rank = rows.findIndex((candidate) => candidate.brawler === row.brawler) + 1;
            return (
              <div className="table-row table-body-row" role="row" key={`rotation-${row.brawler}`}>
                <div className="rank-col row-index">{String(rank).padStart(2, "0")}</div>
                <div className="brawler-col brawler-cell"><span className="brawler-avatar" style={brawlerImageFor(row.brawler, row.brawlerId) ? { backgroundImage: `url(${brawlerImageFor(row.brawler, row.brawlerId)})` } : undefined}>{!brawlerImageFor(row.brawler, row.brawlerId) && row.brawler.slice(0, 2).toUpperCase()}</span><span>{row.brawler}</span></div>
                <div className="tier-col"><TierBadge tier={row.tier} /></div>
              <div className="usage-col usage-value">{row.mapCount}/{totalMapCount}</div>
                <div className="score-col score-value">{formatScore(row.averageScore)}</div>
                <div className="bar-col"><div className={`score-bar ${row.tier.toLowerCase()}`}><span style={{ width: `${Math.min(100, row.averageScore)}%` }} /></div></div>
              </div>
            );
          })}
          {visibleRows.length === 0 && <div className="table-empty"><Search size={22} /><strong>Nenhum brawler encontrado</strong><span>Altera o modo ou a pesquisa para procurar outro brawler.</span></div>}
        </div>
      </div>
      <div className="table-footnote"><span><span className="tiny-live" /> Cada mapa de {modeLabel} entra uma vez na média; a página consulta a snapshot a cada 15 segundos.</span><span>O Tier médio é calculado a partir do Score Híbrido médio.</span></div>
    </section>
  );
}

function RankChange({ delta, label }: { delta: number; label: string }) {
  if (delta === 0) return <span className="rank-change rank-change-stable">— <span>{label}</span></span>;
  const rose = delta > 0;
  const Icon = rose ? ChevronUp : ChevronDown;
  return (
    <span className={`rank-change ${rose ? "rank-change-up" : "rank-change-down"}`}>
      <Icon size={14} aria-hidden="true" />{rose ? "+" : ""}{delta} <span>{label}</span>
    </span>
  );
}

function RankingLaboratory({
  winRateWeight,
  onWinRateWeightChange,
  sourceBalance,
  hasCustomBalance,
  onSourceBalanceChange,
}: {
  winRateWeight: number;
  onWinRateWeightChange: (weight: number) => void;
  sourceBalance: SourceBalancePreference;
  hasCustomBalance: boolean;
  onSourceBalanceChange: (topBrawl: number) => void;
}) {
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<RankingPreset[]>(readRankingPresets);
  const usageRateWeight = 100 - winRateWeight;
  const isOfficialWeight = winRateWeight === 70;

  useEffect(() => {
    window.localStorage.setItem(RANKING_PRESETS_STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  const savePreset = () => {
    const name = presetName.trim().slice(0, 28);
    if (!name) {
      toast.error("Escreve um nome para guardar a predefinição.");
      return;
    }
    setPresets((current) => {
      const matching = current.find((preset) => preset.name.toLocaleLowerCase("pt-PT") === name.toLocaleLowerCase("pt-PT"));
      const next = matching
        ? current.map((preset) => preset.id === matching.id ? { ...preset, winRateWeight } : preset)
        : [...current, { id: `${Date.now()}-${name}`, name, winRateWeight }];
      return next.slice(-8);
    });
    setPresetName("");
    toast.success(`Predefinição “${name}” guardada neste navegador.`);
  };

  return (
    <section className="ranking-laboratory data-section" id="ranking-laboratory">
      <div className="data-heading ranking-lab-heading">
        <div>
          <div className="section-kicker">Configuração local <span>TODO O SITE</span></div>
          <div className="section-motif"><BrandMotif compact /><span className="hud-line" /><span className="hud-label">PESOS HÍBRIDOS</span></div>
          <h2>Ajustar o Score Híbrido</h2>
          <p>Escolhe a ponderação que queres usar neste navegador. A alteração atualiza de imediato os mapas, ranking, médias, perfis de Brawlers e recomendações do Draft.</p>
        </div>
      </div>

      <div className="weight-sandbox" aria-label="Configuração global local de pesos">
        <div className="sandbox-title"><SlidersHorizontal size={17} /><div><strong>Pesos para este navegador</strong><span>{isOfficialWeight ? "Fórmula padrão 70% Vitória / 30% Uso" : `Ativo em mapas, ranking, média, Brawlers e Draft: ${winRateWeight}% Vitória / ${usageRateWeight}% Uso`}</span></div></div>
        <div className="weight-controls">
          {/* Mesma regra: o cursor mede a taxa de vitória, logo é ela que fica à direita. */}
          <div className="weight-readout"><span>Taxa de uso</span><b>{usageRateWeight}%</b></div>
          <Slider value={[winRateWeight]} min={0} max={100} step={1} onValueChange={([value]) => onWinRateWeightChange(value ?? 70)} aria-label="Pesos do Score: arrastar para a direita dá mais peso à taxa de vitória" />
          <div className="weight-readout"><span>Taxa de vitória</span><b>{winRateWeight}%</b></div>
          <button className="sandbox-reset" onClick={() => onWinRateWeightChange(70)} disabled={isOfficialWeight}><RotateCcw size={14} /> Restaurar 70/30</button>
        </div>
      </div>

      <div className="weight-sandbox" aria-label="Equilíbrio entre as fontes de estatísticas">
        <div className="sandbox-title">
          <Scale size={17} />
          <div>
            <strong>Equilíbrio entre fontes</strong>
            <span>{hasCustomBalance
              ? `Ativo: ${sourceBalance.brawlPlanet}% Brawl Planet / ${sourceBalance.topBrawl}% TopBrawl`
              : "Média simples: 50% Brawl Planet / 50% TopBrawl"}</span>
          </div>
        </div>
        <div className="weight-controls">
          {/*
            * A ordem aqui não é decorativa. O valor do cursor É a fatia do
            * TopBrawl, logo o TopBrawl tem de ficar do lado para onde o cursor
            * cresce — a direita. Estava ao contrário: arrastava-se na direção do
            * rótulo "Brawl Planet" e era o TopBrawl que subia.
            */}
          <div className="weight-readout"><span>Brawl Planet</span><b>{sourceBalance.brawlPlanet}%</b></div>
          <Slider
            value={[sourceBalance.topBrawl]}
            min={0}
            max={100}
            step={1}
            onValueChange={([value]) => onSourceBalanceChange(value ?? officialSourceBalance.topBrawl)}
            aria-label="Equilíbrio entre fontes: arrastar para a direita dá mais peso ao TopBrawl"
          />
          <div className="weight-readout"><span>TopBrawl</span><b>{sourceBalance.topBrawl}%</b></div>
          <button className="sandbox-reset" onClick={() => onSourceBalanceChange(officialSourceBalance.topBrawl)} disabled={!hasCustomBalance}>
            <RotateCcw size={14} /> Restaurar 50/50
          </button>
        </div>
        <p className="sandbox-note">
          As duas fontes medem a mesma coisa e raramente concordam ao décimo. Este peso decide quanto cada uma
          conta na taxa de vitória e no uso. <strong>Quando só uma delas publica um brawler, vale essa por
          inteiro</strong> — o peso nunca transforma um valor único num número artificialmente baixo.
        </p>
      </div>
      <div className="preset-sandbox" aria-label="Predefinições pessoais do Laboratório de Ranking">
        <div className="preset-heading"><BookmarkPlus size={16} /><span>Predefinições pessoais</span><small>guardadas apenas neste navegador</small></div>
        <div className="preset-save-controls">
          <label className="sr-only" htmlFor="ranking-preset-name">Nome da predefinição</label>
          <input id="ranking-preset-name" value={presetName} maxLength={28} onChange={(event) => setPresetName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") savePreset(); }} placeholder="Ex.: Vitória 75/25" />
          <button onClick={savePreset}><BookmarkPlus size={14} /> Guardar {winRateWeight}/{usageRateWeight}</button>
        </div>
        {presets.length > 0 ? <div className="preset-list" aria-label="Predefinições guardadas">
          {presets.map((preset) => <div className="preset-chip" key={preset.id}>
            <button className="preset-apply" onClick={() => onWinRateWeightChange(preset.winRateWeight)} aria-label={`Aplicar ${preset.name}, ${preset.winRateWeight}/${100 - preset.winRateWeight} globalmente`}><strong>{preset.name}</strong><span>{preset.winRateWeight}/{100 - preset.winRateWeight}</span></button>
            <button className="preset-remove" onClick={() => { setPresets((current) => current.filter((item) => item.id !== preset.id)); toast.success(`Predefinição “${preset.name}” removida.`); }} aria-label={`Remover a predefinição ${preset.name}`}><Trash2 size={13} /></button>
          </div>)}
        </div> : <p className="preset-empty">Guarda uma divisão para a aplicar rapidamente noutra visita.</p>}
      </div>

      <div className="table-footnote"><span><span className="tiny-live" /> A alteração é local: não muda a snapshot, os dados das fontes nem as escolhas de outros utilizadores.</span><span>O Score ativo atualiza de imediato os valores, tiers, ordens e médias exibidos no site.</span></div>
    </section>
  );
}

function FormulaCard({ winRateWeight }: { winRateWeight: number }) {
  const usageRateWeight = 100 - winRateWeight;
  return (
    <section className="formula-card" id="formula">
      <div className="formula-card-glow" />
      <div className="card-heading formula-heading">
        <div>
                      <div className="section-kicker">A nossa leitura <span>Methodology</span></div>
            <div className="section-motif"><BrandMotif compact /><span className="hud-line" /><span className="hud-label">BH FORMULA</span></div>
            <h3>O que é o Score Híbrido?</h3>

        </div>
        <div className="formula-symbol"><BarChart3 size={18} /></div>
      </div>
      <p>Uma métrica de 0 a 100 que junta resultado observado e utilização real, agregados entre as fontes.</p>
      <div className="formula-equation">
        <span>Taxa de vitória normalizada</span><b>× {(winRateWeight / 100).toFixed(2)}</b><i>+</i><span>Taxa de uso normalizada</span><b>× {(usageRateWeight / 100).toFixed(2)}</b>
      </div>
      <div className="formula-foot"><span className="formula-dot" /> Score Híbrido ativo = (Vitória média das fontes, normalizada no mapa × {winRateWeight}%) + (Uso médio das fontes, normalizado no mapa × {usageRateWeight}%). O Score 0–13 TopBrawl não entra no cálculo.</div>
    </section>
  );
}

function metricText(value: number | null | undefined, suffix = "%") {
  return typeof value === "number" ? `${value.toFixed(2)}${suffix}` : "—";
}

type SourceTab = "topbrawl" | "brawlplanet" | "hybrid";
type SourceSort = "usage" | "winRate" | "score" | "starPlayer";

function SourceComparison({ rows, mapName }: { rows: RankedRow[]; mapName: string }) {
  const [query, setQuery] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>("hybrid");
  const [sourceSort, setSourceSort] = useState<SourceSort>("score");
  const sourceConfig = {
    topbrawl: { label: "TopBrawl", description: "Uso, Win Rate e Score publicados pelo TopBrawl.", metrics: [{ label: "Win Rate", key: "winRate" as const }, { label: "Uso", key: "usage" as const }, { label: "Score", key: "score" as const }] },
    brawlplanet: { label: "Brawl Planet", description: "Win Rate, Pick Rate e Star Player publicados pelo Brawl Planet.", metrics: [{ label: "Win Rate", key: "winRate" as const }, { label: "Pick Rate", key: "usage" as const }, { label: "Star Player", key: "starPlayer" as const }] },
    hybrid: { label: "Score Híbrido", description: "A leitura combinada com os pesos ativos deste navegador.", metrics: [{ label: "Win Rate BP", key: "winRate" as const }, { label: "Uso Híbrido", key: "usage" as const }, { label: "Score Híbrido", key: "score" as const }] },
  } as const;
  const current = sourceConfig[sourceTab];
  const valueFor = (row: RankedRow, sort: SourceSort) => {
    if (sourceTab === "topbrawl") return sort === "usage" ? row.topBrawlUseRate ?? null : sort === "winRate" ? row.topBrawlWinRate ?? null : sort === "score" ? row.topBrawlScore ?? null : null;
    if (sourceTab === "brawlplanet") return sort === "usage" ? row.brawlPlanetPickRate ?? null : sort === "winRate" ? row.brawlPlanetWinRate ?? row.winRate ?? null : sort === "starPlayer" ? row.brawlPlanetStarPlayer ?? null : null;
    return sort === "usage" ? row.usage ?? null : sort === "winRate" ? row.brawlPlanetWinRate ?? row.winRate ?? null : sort === "score" ? row.score ?? null : null;
  };
  const readMetric = (row: RankedRow, key: "winRate" | "usage" | "score" | "starPlayer") => {
    if (sourceTab === "topbrawl") return key === "winRate" ? metricText(row.topBrawlWinRate) : key === "usage" ? metricText(row.topBrawlUseRate) : metricText(row.topBrawlScore, "");
    if (sourceTab === "brawlplanet") return key === "winRate" ? metricText(row.brawlPlanetWinRate ?? row.winRate) : key === "usage" ? metricText(row.brawlPlanetPickRate) : typeof row.brawlPlanetStarPlayer === "number" ? `${row.brawlPlanetStarPlayer.toFixed(2)}%` : "—";
    return key === "winRate" ? metricText(row.winRate) : key === "usage" ? metricText(row.usage) : metricText(row.score, "");
  };
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const aValue = valueFor(a, sourceSort);
    const bValue = valueFor(b, sourceSort);
    if (aValue === null && bValue === null) return (b.score ?? -1) - (a.score ?? -1);
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    return bValue - aValue;
  }), [rows, sourceTab, sourceSort]);
  const featureRows = sortedRows.slice(0, 6);
  const sourceRows = sortedRows.filter((row) => row.brawler.toLocaleLowerCase("pt-PT").includes(query.trim().toLocaleLowerCase("pt-PT")));
  const coverageFor = (key: "winRate" | "usage" | "score" | "starPlayer") => rows.filter((row) => readMetric(row, key) !== "—").length;

  return (
    <section className="source-section" id="sources">
      <div className="source-heading">
        <div>
          <div className="section-kicker">Leitura por fonte <span>FULL SOURCE READOUT</span></div>
          <div className="section-motif"><BrandMotif compact /><span className="hud-line" /><span className="hud-label">FONTES / {mapName.toUpperCase()}</span></div>
          <h2>Vê cada sinal no seu lugar.</h2>
          <p>Escolhe TopBrawl, Brawl Planet ou Score Híbrido. Os seis brawlers em destaque atualizam-se com a fonte selecionada.</p>
        </div>
        <span className="source-live-chip"><Radio size={13} /> fontes auditadas</span>
      </div>
      <div className="source-tabs" role="tablist" aria-label="Escolher fonte dos seis brawlers em destaque">
        {(Object.keys(sourceConfig) as SourceTab[]).map((tab) => (
          <button key={tab} className={sourceTab === tab ? "is-active" : ""} onClick={() => { setSourceTab(tab); setSourceSort(tab === "brawlplanet" ? "usage" : tab === "hybrid" ? "score" : "usage"); }} role="tab" aria-selected={sourceTab === tab}>
            {tab === "topbrawl" ? <Gauge size={15} /> : tab === "brawlplanet" ? <Star size={15} /> : <Sparkles size={15} />}{sourceConfig[tab].label}
          </button>
        ))}
      </div>
      <div className="source-toolbar">
        <span className="source-description">{current.description}</span>
        <div className="source-sorters" role="group" aria-label="Ordenar seis brawlers em destaque">
          <button className={sourceSort === "usage" ? "is-active" : ""} onClick={() => setSourceSort("usage")}>Mais usado</button>
          <button className={sourceSort === "winRate" ? "is-active" : ""} onClick={() => setSourceSort("winRate")}>Win Rate</button>
          {sourceTab !== "brawlplanet" ? <button className={sourceSort === "score" ? "is-active" : ""} onClick={() => setSourceSort("score")}>Score</button> : <button className={sourceSort === "starPlayer" ? "is-active" : ""} onClick={() => setSourceSort("starPlayer")}>Star Player</button>}
        </div>
      </div>
      <div className="source-coverage-strip" aria-label="Cobertura das fontes no mapa selecionado">
        {current.metrics.map((metric) => <span key={metric.label}><b>{coverageFor(metric.key)}/{rows.length}</b> {metric.label}</span>)}
      </div>
      <div className="source-card-grid" aria-label={`Seis brawlers em destaque no ${current.label}`}>
        {featureRows.map((row, index) => <motion.article key={`${sourceTab}-${row.map}-${row.brawler}`} className="source-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: index * 0.035 }}>
          <div className="source-card-top"><span className="source-rank">{String(index + 1).padStart(2, "0")}</span><span className="source-tier"><TierBadge tier={row.tier} /></span></div>
          <div className="source-brawler"><span className="source-avatar" style={brawlerImageFor(row.brawler, row.brawlerId) ? { backgroundImage: `url(${brawlerImageFor(row.brawler, row.brawlerId)})` } : undefined}>{!brawlerImageFor(row.brawler, row.brawlerId) && row.brawler.slice(0, 2).toUpperCase()}</span><strong>{row.brawler}</strong></div>
          <div className="source-metric-grid">{current.metrics.map((metric) => <div className="source-metric" key={metric.label}><span>{metric.label}</span><strong>{readMetric(row, metric.key)}</strong></div>)}</div>
          <div className="source-card-foot"><span className="source-dot" /> {row.dataStatus === "partial" ? "Dados parciais" : "Registo disponível"}</div>
        </motion.article>)}
      </div>
      <div className="source-toolbar source-readout-search">
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar brawler no Full Source Readout..." aria-label="Procurar brawler no Full Source Readout" />{query && <button aria-label="Limpar pesquisa do Full Source Readout" onClick={() => setQuery("")}><X size={14} /></button>}</label>
        <span className="source-description">{sourceRows.length}/{rows.length} brawlers mostrados</span>
      </div>
      <div className="source-full-readout">
        <div className="source-full-heading"><strong>Full Source Readout</strong><span>{current.label} · todos os brawlers</span></div>
        <div className="source-full-table" role="table" aria-label={`Full Source Readout ${current.label} de todos os brawlers em ${mapName}`}>
          <div className="source-full-row source-full-header" role="row">
            <span role="columnheader">#</span><span role="columnheader">Brawler</span><span role="columnheader">Tier</span>{current.metrics.map((metric) => <span role="columnheader" key={metric.label}>{metric.label}</span>)}<span role="columnheader">Estado</span>
          </div>
          {sourceRows.map((row, index) => (
            <div className="source-full-row" role="row" key={`${row.map}-${row.brawler}`}>
              <span className="source-full-rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="source-full-brawler"><span className="source-full-avatar" style={brawlerImageFor(row.brawler, row.brawlerId) ? { backgroundImage: `url(${brawlerImageFor(row.brawler, row.brawlerId)})` } : undefined}>{!brawlerImageFor(row.brawler, row.brawlerId) && row.brawler.slice(0, 2).toUpperCase()}</span>{row.brawler}</span>
              <span><TierBadge tier={row.tier} /></span>
              {current.metrics.map((metric) => <span key={metric.label} className={readMetric(row, metric.key) === "—" ? "not-available" : "source-full-value"}>{readMetric(row, metric.key)}</span>)}
              <span className="source-full-status">{row.rankedStatus === "unavailable" ? "A aguardar Ranked" : row.dataStatus === "partial" ? "Parcial" : "Disponível"}</span>
            </div>
          ))}
          {sourceRows.length === 0 && <div className="table-empty"><Search size={22} /><strong>Nenhum brawler encontrado</strong><span>Altera a pesquisa para procurar outro nome.</span></div>}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const trpcUtils = trpc.useUtils();
  const rankedSync = useRankedSync();
  const snapshotQuery = trpc.rankedSync.snapshot.useQuery(undefined, { staleTime: 60_000, refetchInterval: false, refetchOnWindowFocus: true });
  const statusQuery = trpc.rankedSync.status.useQuery(undefined, { refetchInterval: 15_000, staleTime: 5_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true });
  /**
   * Um hook só para as três páginas.
   *
   * Aqui lia-se `result.ok` e `result.rowCount` do que a mutação devolvia — e
   * a mutação deixou de devolver isso quando o servidor passou a responder
   * assim que arranca, em vez de esperar minutos pela recolha. Manter a lógica
   * copiada em cada página era garantir que uma delas ficava para trás.
   */
  const { isRefreshing, progress: syncProgress, start: startRefresh } = useSyncRefresh();
  const { weights: hybridWeights, updateWeights } = useHybridWeights();
  const { balance: sourceBalance, topBrawlWeight, hasCustomBalance, updateBalance } = useSourceBalance();
  const winRateWeight = hybridWeights.winRate / 100;
  const liveRows = useMemo(
    () => normalizeRankedRows(rankedSync.snapshot?.rows ?? allRankedRows, winRateWeight, topBrawlWeight),
    [rankedSync.snapshot?.rows, winRateWeight, topBrawlWeight],
  );
  const liveMapSummaries = useMemo(
    () => buildActiveRankedMapCatalog(rankedSync.snapshot?.maps, liveRows, allMapSummaries, winRateWeight, topBrawlWeight),
    [liveRows, rankedSync.snapshot?.maps, winRateWeight, topBrawlWeight],
  );
  const liveModeOptions = useMemo(() => ["Todos", ...Array.from(new Set(liveMapSummaries.map((map) => map.mode)))], [liveMapSummaries]);
  const mapDisplayRows = useMemo(
    () => buildMapDisplayRows(liveRows, liveMapSummaries, winRateWeight, topBrawlWeight),
    [winRateWeight, topBrawlWeight, liveRows, liveMapSummaries],
  );
  const [selectedMap, setSelectedMap] = useState<MapSummary>(() => liveMapSummaries.find((map) => map.name === "Beach Ball") ?? liveMapSummaries[0]);
  const [modeFilter, setModeFilter] = useState("Todos");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");

  useEffect(() => {
    const nextMap = liveMapSummaries.find((map) => map.name === selectedMap.name) ?? liveMapSummaries[0];
    if (nextMap && nextMap !== selectedMap) setSelectedMap(nextMap);
  }, [liveMapSummaries, selectedMap]);

  const capturedAt = rankedSync.capturedAt ?? statusQuery.data?.capturedAt ?? null;
  const lastStatus = statusQuery.data?.lastStatus ?? "idle";
  const handleRefresh = startRefresh;

  const currentRows = useMemo(() => mapDisplayRows.filter((row) => row.map === selectedMap.name), [mapDisplayRows, selectedMap.name]);
  const mapExportTsv = useMemo(() => {
    const uniqueMaps = Array.from(new Map(allRankedMaps.map((map) => [map.name, map])).values());
    return buildMapsTsv(uniqueMaps);
  }, []);

  const stats = useMemo(() => {
    const measuredRows = currentRows.filter((row) => row.rankedStatus !== "unavailable");
    const average = measuredRows.reduce((total, row) => total + (row.score ?? 0), 0) / Math.max(1, measuredRows.filter((row) => row.score !== null).length);
    const top = measuredRows[0]?.score ?? 0;
    return {
      average,
      top,
      s: measuredRows.filter((row) => row.tier === "S").length,
      a: measuredRows.filter((row) => row.tier === "A").length,
    };
  }, [currentRows]);

  const copyMapsTsv = async () => {
    try {
      await navigator.clipboard.writeText(mapExportTsv);
      toast.success("26 mapas e modos copiados em TSV.");
    } catch {
      toast.error("Não foi possível copiar a lista de mapas automaticamente.");
    }
  };

  const downloadMapsTsv = () => {
    const blob = new Blob([mapExportTsv], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "brawl-hibrido-mapas-modos.tsv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("TSV dos 26 mapas descarregado.");
  };

  const selectMap = (map: MapSummary) => {
    setSelectedMap(map);
    setActiveSection("maps");
  };

  const scrollTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="app-shell" style={{ backgroundImage: fundoCom("linear-gradient(rgba(11,14,20,.92), rgba(11,14,20,.96))", TEXTURA) }}>
      <Sidebar activeSection={activeSection} onSectionChange={scrollTo} open={mobileSidebar} onClose={() => setMobileSidebar(false)} capturedAt={capturedAt} />
      <div className="app-main">
        <Topbar onMenu={() => setMobileSidebar(true)} capturedAt={capturedAt} lastStatus={lastStatus} liveState={rankedSync.connectionState} onRefresh={handleRefresh} isRefreshing={isRefreshing || snapshotQuery.isFetching || statusQuery.isFetching} refreshProgress={syncProgress} />
        <main>
          <Hero selectedMap={selectedMap} onExplore={() => scrollTo("maps")} />
          <div className="main-content">
            <div className="intro-row" id="dashboard">
              <div className="intro-copy">
                <div className="section-kicker">Painel de controlo <span>Season 06 / 2026</span></div>
                <div className="section-motif"><BrandMotif compact /><span className="hud-line" /></div>
                <h2>O meta, sem ruído.</h2>
                <p>Seleciona um mapa para cruzar o ranking completo com a métrica que criámos para separar popularidade de performance.</p>
              </div>
              <div className="intro-badge"><Flame size={16} /><span>{lastStatus === "running" ? "Sincronização em curso" : "Meta snapshot"}</span><strong>{formatSyncDate(capturedAt)}</strong></div>
            </div>
            <div className="stats-grid">
              <StatCard icon={Trophy} label="Melhor score" value={formatScore(stats.top)} detail={`${currentRows[0]?.brawler ?? "—"} lidera o mapa`} accent="accent-amber" />
              <StatCard icon={BarChart3} label="Média do mapa" value={formatScore(stats.average)} detail="Score Híbrido médio" accent="accent-violet" />
              <StatCard icon={ShieldCheck} label="Tier S + A" value={`${stats.s + stats.a}`} detail={`${stats.s} S · ${stats.a} A recomendados`} accent="accent-cyan" />
              <StatCard icon={Database} label="Amostra" value={`${currentRows.length}`} detail="brawlers catalogados" accent="accent-blue" />
            </div>
            <MapSelector
              maps={liveMapSummaries}
              selectedMap={selectedMap}
              onSelect={selectMap}
              modeFilter={modeFilter}
              onModeFilter={setModeFilter}
              modeOptions={liveModeOptions}
              rows={mapDisplayRows}
              onCopyMaps={copyMapsTsv}
              onDownloadMaps={downloadMapsTsv}
            />
            <RotationAverages
              sourceRows={liveRows}
              activeMaps={liveMapSummaries}
              expectedMapCount={allRankedMaps.length}
              capturedAt={capturedAt}
              isRefreshing={isRefreshing || snapshotQuery.isFetching || statusQuery.isFetching}
              winRateWeight={winRateWeight}
              topBrawlWeight={topBrawlWeight}
            />
            <RankingLaboratory
              winRateWeight={hybridWeights.winRate}
              onWinRateWeightChange={updateWeights}
              sourceBalance={sourceBalance}
              hasCustomBalance={hasCustomBalance}
              onSourceBalanceChange={updateBalance}
            />
            <SourceComparison rows={currentRows} mapName={selectedMap.name} />
            <FormulaCard winRateWeight={hybridWeights.winRate} />
          </div>
        </main>
        <footer className="app-footer"><span>BRAWL HÍBRIDO / 26-map intelligence workspace</span><span>Feito para decisões melhores, não para picks cegos.</span></footer>
      </div>
      <button className="scroll-top-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Voltar ao topo"><ChevronLeft size={17} /></button>
      <MobileNav pathname="/" />
    </div>
  );
}
