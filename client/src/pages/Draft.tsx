import { orderDraftEntries } from "@shared/draft";
import { useDraftRolesVersion } from "@/contexts/DraftRolesContext";
import { DraftRoleEditor } from "@/components/DraftRoleEditor";
import FilaDeColagem from "@/components/FilaDeColagem";
import { Fragment, memo, startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Ban,
  ArrowUp,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Copy,
  Crosshair,
  Download,
  Gauge,
  Layers3,
  Users,
  Menu,
  Mic,
  Radio,
  RotateCcw,
  Search,
  Settings2,
  SkipForward,
  Shield,
  Swords,
  Sparkles,
  Star,
  Stethoscope,
  Target,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useSyncRefresh, type ProcessHealth } from "@/lib/useSyncRefresh";
import { useCounterSync } from "@/contexts/CounterSyncContext";
import { useRankedSync } from "@/contexts/RankedSyncContext";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { allMapSummaries, allRankedRows, buildActiveRankedMapCatalog, normalizeRankedRows, resolveRankedMapSelection, type MapSummary, type RankedRow } from "@/data/rankedData";
import { additionalBrawlerAssetIds } from "@/data/additionalRankedData";
import { useHybridWeights } from "@/lib/hybridWeights";
import { useSourceBalance } from "@/lib/sourceBalance";
import { useDraftRules, type DraftRulePreference } from "@/lib/draftRules";
import { analyzeDraftComposition, buildScrimSequence, calculateDraftHybridScore, calculateDraftSignal, calculateLaneMatchup, calculateNormalizedDraftPoints, describeDraftStep, draftRoleLabels, draftSteps, estimateDraftWinProbability, estimateRoleWinRate, getBrawlerBuild, getBrawlerClass, getCounterMatchup, getCounterProfile, getDraftCounterWindow, getDraftLockedNames, getDraftMaximumHybridScore, getDraftTopRecommendationNames, getGlobalPickNumber, getLiveCounterSuggestions, getOpeningBonusEligibilityLabel, getTacticalPlan, inferDraftRole, normalizeScrimSequence, openingRangeThreshold, rankDraftEntries, remapDraftProgress, scrimPresetLabels, type CoachComposition, type DraftRoleFilter, type DraftSignal, type DraftStep, type DraftTeam, type LiveCounterSuggestion, type RankedDraftEntry, type ScrimPreset } from "@shared/draft";
import { getCounterBonusRate, getSynergyBonusRate } from "@shared/draft";
import { buildGamePlanText } from "@shared/coachPlan";
import { getLiteralCounterRelations } from "@shared/counterSourceRelations";
import { resolveSpokenBrawler } from "@shared/brawlerVoice";
import { findBrawlPlanetMapTeam, getBrawlPlanetMapTeamBoard, BRAWL_PLANET_MAP_TEAM_LIMIT, type BrawlPlanetMapTeam } from "@shared/brawlPlanetMapTeams";
import { counterPickMultiplierOptions } from "@shared/draftRules";
import { brawlScopeReadings, type BrawlScopeReadingId } from "@shared/brawlScopeReading";
import { useBrawlScopeReading } from "@/lib/brawlScopeReading";
import { useBrawlScopeLiveMatchups } from "@/lib/brawlScopeMatchups";
import { brawlScopeModeCoverage } from "@shared/brawlScopeMatchupsByMode.generated";
import { brawlScopeMatchupDeltas } from "@shared/brawlScopeMatchupDeltas.generated";
import { leavingEntries, quarantinedEntries, type RosterEntry, type RosterState } from "@shared/rosterDiscovery";
import type { DraftRuleSettings } from "@shared/draftRules";
import "./draftRules.css";
import { MobileNav } from "@/components/MobileNav";

const LOGO_URL = "/manus-storage/brawl-hibrido-logo_6c9584aa.png";
const TEXTURE_URL = "/manus-storage/brawl-hibrido-texture_3661e183.jpg";
const MAP_BG_URL = "/manus-storage/brawl-hibrido-map-bg_531ad86a.jpg";
const DRAFT_ARENA_BG_URL = "/manus-storage/brawl-stars-draft-background_4a31ad8d.webp";

type TeamId = DraftTeam;
type VoiceCaptureState = "idle" | "listening" | "processing";
type VoiceRecognitionResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type VoiceRecognitionErrorEvent = { error: string };
type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: VoiceRecognitionResultEvent) => void) | null;
  onerror: ((event: VoiceRecognitionErrorEvent) => void) | null;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}
type ContextualDraftScoreEntry = {
  row: RankedRow;
  rank: number;
  draftScore: number;
  basePoints: number;
  finalPoints: number;
  openingBonusActive: boolean;
};

function formatMetric(value: number | null | undefined, suffix = "%") {
  return typeof value === "number" ? `${value.toFixed(2)}${suffix}` : "—";
}

function formatRulePercentage(value: number) {
  return Number(value.toFixed(2));
}

function rateFromContextualPoints(points: number, hybridPoints: number) {
  return hybridPoints > 0 ? (points / hybridPoints) * 100 : 0;
}

function normalizeContextualPoints(points: number, basePoints: number, hybridPoints: number) {
  return hybridPoints > 0 ? points * (basePoints / hybridPoints) : 0;
}

type ActiveDraftBonus = { label: string; rate: number; points: number; source?: string };
type ExperimentalWeights = { winRate: number; usageRate: number };

/**
 * Classifica cada ban registado do ponto de vista de UM candidato.
 *
 * Existe para o cartão poder falar do bónus de Ban mesmo quando ele não paga.
 * Um ban registado cai sempre numa de três categorias, e dizer em qual é o que
 * separa "a condição não aconteceu" de "o bónus está avariado".
 */
export function buildBanAudit(signal: DraftSignal, brawlerName: string) {
  const registered = signal.bonusSources.registeredBans ?? [];
  const paying = signal.bonusSources.bannedCounters ?? [];
  const outsideTop25 = signal.bonusSources.nonTop25BannedCounters ?? [];
  const notCounters = signal.bonusSources.bannedNonCounters ?? [];
  const aria = registered.length
    ? [
        `${registered.length} ban${registered.length === 1 ? "" : "s"} registado${registered.length === 1 ? "" : "s"}: ${registered.join(", ")}.`,
        paying.length ? `Pagam bónus a ${brawlerName}: ${paying.join(", ")}.` : `Nenhum ban paga bónus a ${brawlerName}.`,
        outsideTop25.length ? `Counteram mas estão fora do Top 25 do mapa: ${outsideTop25.join(", ")}.` : "",
        notCounters.length ? `Não counteram este brawler: ${notCounters.join(", ")}.` : "",
      ].filter(Boolean).join(" ")
    : "Nenhum ban registado neste draft.";
  return { registered, paying, outsideTop25, notCounters, aria };
}

export function getActiveDraftBonuses(signal: DraftSignal, role: ReturnType<typeof inferDraftRole>, brawlerName?: string): ActiveDraftBonus[] {
  const openingEligibility = brawlerName ? getOpeningBonusEligibilityLabel(brawlerName) : null;
  const openingSource = openingEligibility
    ? openingEligibility === `≥${openingRangeThreshold} blocos`
      ? `ataque principal ${openingEligibility} · Pick ${signal.scoreBreakdown.counterBonusPick}`
      : `exceção tática: ${openingEligibility} · Pick ${signal.scoreBreakdown.counterBonusPick}`
    : undefined;
  const counterMultiplier = signal.scoreBreakdown.counterPickMultiplier ?? 1;
	const bonuses: ActiveDraftBonus[] = [
		  { label: signal.counterMatchups.length > 1 ? `Counter ×${signal.counterMatchups.length}` : "Counter", rate: signal.counterMatchups.reduce((total, matchup) => total + matchup.counterDelta, 0) * counterMultiplier, points: signal.scoreBreakdown.counterPoints, source: signal.counterMatchups.length ? `${signal.counterMatchups.map((matchup) => `${matchup.defender} ${matchup.counterDelta > 0 ? "+" : ""}${formatRulePercentage(matchup.counterDelta)}% · ${matchup.note}`).join(" · ")}${counterMultiplier === 1 ? "" : ` · ajuste ×${counterMultiplier}`}` : undefined },
    { label: role === "flex" ? "Fit Mid/Lane" : "Fit Mid", rate: rateFromContextualPoints(signal.scoreBreakdown.missingMidPoints, signal.scoreBreakdown.hybridPoints), points: signal.scoreBreakdown.missingMidPoints },
    { label: role === "flex" ? "Fit Mid/Lane" : "Fit Lane", rate: rateFromContextualPoints(signal.scoreBreakdown.missingSidePoints, signal.scoreBreakdown.hybridPoints), points: signal.scoreBreakdown.missingSidePoints },
    { label: signal.bannedCounterCount > 1 ? `Ban ×${signal.bannedCounterCount} · Pick ${signal.scoreBreakdown.banBonusPick}` : `Ban · Pick ${signal.scoreBreakdown.banBonusPick}`, rate: signal.scoreBreakdown.banBonusRate * 100 * signal.bannedCounterCount, points: signal.scoreBreakdown.banPoints, source: signal.bonusSources.bannedCounters.length ? `banido: ${signal.bonusSources.bannedCounters.join(", ")} · Top 10 de counters (BrawlScope / PL Prodigy) + Top 25 do mapa · +${formatRulePercentage(signal.scoreBreakdown.banBonusRate * 100)}% por counter` : undefined },
    { label: "Abertura", rate: rateFromContextualPoints(signal.scoreBreakdown.openingLongRangePoints, signal.scoreBreakdown.hybridPoints), points: signal.scoreBreakdown.openingLongRangePoints, source: openingSource },
    { label: `Equipa do mapa · Pick ${signal.scoreBreakdown.synergyBonusPick}`, rate: rateFromContextualPoints(signal.scoreBreakdown.mapTeamSynergyPoints, signal.scoreBreakdown.hybridPoints), points: signal.scoreBreakdown.mapTeamSynergyPoints, source: signal.bonusSources.mapTeamSynergy ? `Brawl Planet · ${signal.bonusSources.mapTeamSynergy.map}: ${signal.bonusSources.mapTeamSynergy.brawlers.join(" · ")} · WR ${signal.bonusSources.mapTeamSynergy.winRate.toFixed(1)}%` : undefined },
    {
      label: signal.scoreBreakdown.hasPublishedSynergyRate ? `Sinergia · ${signal.bonusSources.synergySource ?? "fonte"}` : `Sinergia · Pick ${signal.scoreBreakdown.synergyBonusPick}`,
      rate: signal.scoreBreakdown.synergyBonusRate * 100,
      points: signal.scoreBreakdown.synergyPoints,
      // Diz de onde veio cada ponto: o valor publicado para aquele par, ou a taxa fixa do pick.
      source: signal.bonusSources.synergyDetails?.length
        ? signal.bonusSources.synergyDetails
            .map((detalhe) => typeof detalhe.delta === "number"
              ? `${detalhe.brawler} +${formatRulePercentage(detalhe.delta)}% (valor da ficha ${detalhe.source})`
              : `${detalhe.brawler} · taxa fixa do pick ${signal.scoreBreakdown.synergyBonusPick}`)
            .join(" · ")
        : signal.bonusSources.synergyAllies.length ? `com ${signal.bonusSources.synergyAllies.join(", ")}` : undefined,
    },
	  ].filter((bonus) => bonus.points > 0);

  if (signal.scoreBreakdown.counterPoints < 0) {
    bonuses.push({
      label: signal.counterMatchups.length > 1 ? `Desbônus Counter ×${signal.counterMatchups.length}` : "Desbônus Counter",
      rate: rateFromContextualPoints(signal.scoreBreakdown.counterPoints, signal.scoreBreakdown.hybridPoints),
      points: signal.scoreBreakdown.counterPoints,
      source: signal.counterMatchups.map((matchup) => `${matchup.defender} ${matchup.counterDelta > 0 ? "+" : ""}${formatRulePercentage(matchup.counterDelta)}% · ${matchup.note}`).join(" · "),
    });
  }

  if (signal.bonusSources.coveredCounterTargets.length) {
    const coveredTargets = signal.bonusSources.coveredCounterTargets
      .map((coverage) => `${coverage.enemy} já counterado por ${coverage.allies.join(", ")}`)
      .join(" · ");
    bonuses.push({
      label: "Counter unitário já coberto",
      rate: 0,
      points: 0,
      source: `${coveredTargets} · sem bónus repetido`,
    });
  }

  if (signal.bonusSources.nonTop25BannedCounters.length) {
    bonuses.push({
      label: "Counter banido fora do Top 25",
      rate: 0,
      points: 0,
      source: `${signal.bonusSources.nonTop25BannedCounters.join(", ")} · sem bónus: fora do Top 25 por Score Híbrido base`,
    });
  }

  if (signal.scoreBreakdown.enemyCounterPenaltyPoints > 0) {
    const count = signal.bonusSources.enemyCounters?.length || 1;
    bonuses.push({
      label: count > 1 ? `Desbônus Enemy Counter ×${count}` : "Desbônus Enemy Counter",
      rate: -rateFromContextualPoints(signal.scoreBreakdown.enemyCounterPenaltyPoints, signal.scoreBreakdown.hybridPoints),
      points: -signal.scoreBreakdown.enemyCounterPenaltyPoints,
      source: signal.bonusSources.enemyCounters?.length ? `por ${signal.bonusSources.enemyCounters.join(", ")}` : undefined,
    });
  }
  if (signal.scoreBreakdown.repeatedEnemyCounterPressurePoints > 0) {
    const pressures = signal.bonusSources.repeatedEnemyCounterPressures ?? [];
    const rate = pressures.reduce((sum, pressure) => sum + pressure.rate * 100, 0);
    bonuses.push({
      label: pressures.length > 1 ? `Pressão Enemy Counter ×${pressures.length}` : "Pressão Enemy Counter",
      rate: -rate,
      points: -signal.scoreBreakdown.repeatedEnemyCounterPressurePoints,
      source: pressures.map((pressure) => `${pressure.enemy}: ${pressure.counteredAllies.join(", ")}`).join(" · ") || undefined,
    });
  }
  const topCounterRisks = signal.bonusSources.topTwentyCounters ?? [];
  if (topCounterRisks.length) {
    const windowSize = signal.scoreBreakdown.topCounterWindowSize;
    bonuses.push({
      label: `Risco Counter Top ${windowSize}`,
      rate: 0,
      points: 0,
      source: `aviso sem desbónus: ${topCounterRisks.join(", ")}`,
    });
  }
  if (signal.scoreBreakdown.sameClassPenaltyPoints > 0) {
    const triggers = signal.bonusSources.sameClassPenalties ?? [];
    const count = triggers.length || 1;
    const classLabel = signal.bonusSources.sameClassClass ? ` · classe ${signal.bonusSources.sameClassClass}` : "";
    bonuses.push({
      label: count > 1 ? `Desbônus Mesma Classe ×${count}` : "Desbônus Mesma Classe",
      rate: -rateFromContextualPoints(signal.scoreBreakdown.sameClassPenaltyPoints, signal.scoreBreakdown.hybridPoints),
      points: -signal.scoreBreakdown.sameClassPenaltyPoints,
      source: triggers.length ? `ativado por: ${triggers.join(", ")}${classLabel}` : `ativador não identificado${classLabel}`,
    });
  }
  // Quando o limite por estado de Draft corta os fatores, os pontos somados nos
  // chips deixam de bater certo com o ajuste final. Este chip explica a diferença.
  if (signal.scoreBreakdown.contextualCapApplied) {
    const bonusTrim = signal.scoreBreakdown.rawContextualBonusPoints - Math.min(signal.scoreBreakdown.rawContextualBonusPoints, signal.scoreBreakdown.contextualBonusCapPoints);
    const penaltyTrim = signal.scoreBreakdown.rawContextualPenaltyPoints - Math.min(signal.scoreBreakdown.rawContextualPenaltyPoints, signal.scoreBreakdown.contextualPenaltyCapPoints);
    const parts = [
      bonusTrim > 0 ? `bónus cortado em ${bonusTrim.toFixed(2)} pts (limite +${formatRulePercentage(signal.scoreBreakdown.contextualBonusCapRate * 100)}% da Base)` : "",
      penaltyTrim > 0 ? `desbónus cortado em ${penaltyTrim.toFixed(2)} pts (limite −${formatRulePercentage(signal.scoreBreakdown.contextualPenaltyCapRate * 100)}% da Base)` : "",
    ].filter(Boolean);
    bonuses.push({
      label: "Limite contextual",
      rate: 0,
      points: 0,
      source: parts.join(" · ") || "fatores limitados pelo estado do Draft",
    });
  }
  if (signal.scoreBreakdown.worstTeammatePenaltyPoints > 0) {
    const count = signal.bonusSources.worstTeammatePenalties?.length || 1;
    bonuses.push({
      label: count > 1 ? `Worst Teammate ×${count}` : "Worst Teammate",
      rate: -rateFromContextualPoints(signal.scoreBreakdown.worstTeammatePenaltyPoints, signal.scoreBreakdown.hybridPoints),
      points: -signal.scoreBreakdown.worstTeammatePenaltyPoints,
      source: signal.bonusSources.worstTeammatePenalties?.length ? `Brawl Planet: ${signal.bonusSources.worstTeammatePenalties.join(", ")}` : undefined,
    });
  }
  return bonuses;
}

export type DuelTeamScoreInput = Readonly<{ blueScore: number; redScore: number }>;

export function calculateDuelTeamScoreSummary(duels: readonly DuelTeamScoreInput[]) {
  const totals = duels.reduce(
    (summary, duel) => ({
      blueTotal: summary.blueTotal + duel.blueScore,
      redTotal: summary.redTotal + duel.redScore,
    }),
    { blueTotal: 0, redTotal: 0 },
  );
  const duelCount = duels.length;
  const combinedTotal = totals.blueTotal + totals.redTotal;

  return {
    ...totals,
    duelCount,
    blueAverage: duelCount ? totals.blueTotal / duelCount : 0,
    redAverage: duelCount ? totals.redTotal / duelCount : 0,
    difference: totals.blueTotal - totals.redTotal,
    bluePercentage: duelCount && combinedTotal > 0 ? (totals.blueTotal / combinedTotal) * 100 : 0,
    redPercentage: duelCount && combinedTotal > 0 ? (totals.redTotal / combinedTotal) * 100 : 0,
  };
}

export function getDuelTeamScoreLeader(summary: ReturnType<typeof calculateDuelTeamScoreSummary>): "blue" | "red" | "tie" | null {
  if (!summary.duelCount) return null;
  if (Math.abs(summary.difference) < 0.01) return "tie";
  return summary.difference > 0 ? "blue" : "red";
}

function brawlerImageFor(row: RankedRow) {
  const id = row.brawlerId ?? additionalBrawlerAssetIds[row.brawler];
  return id ? `https://cdn.brawlify.com/brawlers/borderless/${id}.png` : null;
}

function mapImageFor(map: MapSummary) {
  return MAP_BG_URL;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-motif ${compact ? "is-compact" : ""}`} aria-hidden="true">
      <img src={LOGO_URL} alt="" />
      <span>{compact ? "BH" : "BRAWL HÍBRIDO"}</span>
    </span>
  );
}

function DraftSidebar({ active }: { active: string }) {
  /**
   * Isto dizia "Score 80/20" enquanto a fórmula corria a 70/30, e passou a ser
   * configurável por quem usa o site. Uma etiqueta fixa era uma informação
   * errada num sítio onde ninguém iria verificar.
   */
  const { weights } = useHybridWeights();
  const { balance } = useSourceBalance();
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: Gauge, href: "/" },
    { id: "maps", label: "Mapas Ranked", icon: Layers3, href: "/#maps" },
    { id: "draft", label: "Draft Híbrido", icon: Sparkles, href: "/draft" },
    { id: "matchups", label: "Matriz 1v1", icon: Swords, href: "/matchups" },
    { id: "brawlers", label: "Brawlers", icon: Crosshair, href: "/brawlers" },
    { id: "sources", label: "Fontes", icon: Radio, href: "/#sources" },
    { id: "formula", label: "Como funciona", icon: CircleHelp, href: "/#formula" },
  ];

  return (
    <aside className="app-sidebar draft-sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark-shell"><img src={LOGO_URL} alt="" className="brand-mark" /></div>
        <div><div className="brand-name">Brawl Híbrido</div><div className="brand-kicker">Ranked intelligence</div></div>
      </div>
      <div className="sidebar-status"><span className="status-pulse" /><span>WORKSPACE LIVE</span><strong>Draft competitivo</strong></div>
      <nav className="sidebar-nav" aria-label="Navegação principal">
        <div className="nav-label">Workspace</div>
        {navItems.map(({ id, label, icon: Icon, href }) => (
          <a key={id} href={href} className={`sidebar-link ${active === id ? "is-active" : ""}`}>
            <Icon size={18} /><span>{label}</span>{id === "maps" && <span className="nav-count">26</span>}
          </a>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-note"><div className="note-icon"><Zap size={16} /></div><div><strong>Draft Híbrido</strong><p>Escolhe por pontos, contexto e posição ideal.</p></div></div>
      <div className="sidebar-footer" title={`Vitória ${weights.winRate}% / Uso ${weights.usageRate}% · TopBrawl ${balance.topBrawl}% / Brawl Planet ${balance.brawlPlanet}%`}>
        <span className="footer-dot" /> Dados por mapa · Score {weights.winRate}/{weights.usageRate}
      </div>
    </aside>
  );
}

/**
 * Idade dos dados em linguagem corrente. O objetivo não é precisão ao segundo —
 * é impedir que alguém decida um draft com dados de ontem sem dar por isso.
 */
function describeDataAge(capturedAt?: string | null) {
  if (!capturedAt) return null;
  const captured = new Date(capturedAt).getTime();
  if (!Number.isFinite(captured)) return null;
  const minutos = Math.max(0, Math.round((Date.now() - captured) / 60_000));
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.round(horas / 24)} dias`;
}

/**
 * Estado real da sincronização, em vez do rótulo fixo "Sync 1h" que estava aqui
 * antes. Aquele rótulo era simplesmente falso: a sincronização corre de 15 em 15
 * minutos e não dizia nada sobre a idade dos dados que estavam no ecrã.
 */
function SyncStatusChip({ capturedAt, syncState, blockedSources }: {
  capturedAt?: string | null;
  syncState: string;
  blockedSources: string[];
}) {
  const idade = describeDataAge(capturedAt);
  const bundled = syncState === "bundled" || !idade;

  if (blockedSources.length) {
    return (
      <span
        className="live-chip is-warning"
        title={`Sem resposta de: ${blockedSources.join(", ")}. O site continua a funcionar com o catálogo do repositório; os números não estão errados, apenas não são de agora.`}
      >
        <AlertTriangle size={13} /> Fonte indisponível
      </span>
    );
  }

  return (
    <span
      className="live-chip"
      title={bundled
        ? "A mostrar o catálogo incluído no projeto. A sincronização ainda não trouxe dados novos nesta sessão."
        : `Última sincronização ${idade}. Corre sozinha de 15 em 15 minutos; "Atualizar agora" força já.`}
    >
      <span className="live-dot" /> {bundled ? "Catálogo local" : `Dados ${idade}`}
    </span>
  );
}

/**
 * Novidades detetadas sozinhas na rotação e no catálogo de brawlers.
 *
 * Aparece só quando há alguma coisa a dizer. Um mapa que entrou esta semana não
 * tem estatísticas publicadas em lado nenhum, por isso não pode alimentar
 * recomendações — mas esconder-lhe a existência seria pior: quem abre o site
 * depois de uma mudança de temporada quer perceber porque é que o mapa novo
 * ainda não está lá.
 */
function RosterWatchPanel({ roster }: { roster?: RosterState }) {
  const novos = roster ? quarantinedEntries(roster.maps) : [];
  const novosBrawlers = roster ? quarantinedEntries(roster.brawlers) : [];
  const aSairMapas = roster ? leavingEntries(roster.maps) : [];
  const aSairBrawlers = roster ? leavingEntries(roster.brawlers) : [];

  if (!novos.length && !novosBrawlers.length && !aSairMapas.length && !aSairBrawlers.length) return null;

  const linha = (entry: RosterEntry, tipo: string) => (
    <li key={`${tipo}-${entry.name}`}>
      <strong>{entry.name}</strong>
      <span className="roster-watch-kind">{tipo}</span>
      {entry.missing?.length ? <em>falta: {entry.missing.join(", ")}</em> : null}
    </li>
  );

  return (
    <section className="roster-watch" aria-label="Novidades detetadas na rotação Ranked">
      <div className="roster-watch-head">
        <Sparkles size={16} />
        <div>
          <strong>Novidades detetadas</strong>
          <p>
            A rotação é lida diretamente da fonte a cada sincronização. O que entra fica aqui até ter dados
            publicados suficientes — só então passa a contar para as recomendações. O que sai da rotação continua
            a contar até uma segunda leitura completa confirmar a saída, para uma falha de rede não apagar mapas.
          </p>
        </div>
      </div>
      {(novos.length || novosBrawlers.length) ? (
        <div className="roster-watch-group">
          <span className="roster-watch-label">A recolher dados</span>
          <ul>
            {novos.map((entry) => linha(entry, "mapa novo"))}
            {novosBrawlers.map((entry) => linha(entry, "brawler novo"))}
          </ul>
        </div>
      ) : null}
      {(aSairMapas.length || aSairBrawlers.length) ? (
        <div className="roster-watch-group is-leaving">
          <span className="roster-watch-label">A sair</span>
          <ul>
            {aSairMapas.map((entry) => linha(entry, "mapa"))}
            {aSairBrawlers.map((entry) => linha(entry, "brawler"))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}


/**
 * Painel que fica fechado até alguém precisar dele.
 *
 * A página tinha nove blocos empilhados, todos sempre abertos — e a sensação de
 * desarrumação vinha mais daí do que da quantidade de informação. A informação
 * é boa; o que não pode é estar toda a pedir atenção ao mesmo tempo.
 *
 * Fechado mostra uma linha de resumo, para continuar a valer alguma coisa sem
 * ocupar o ecrã. Nada é escondido: está tudo a um clique.
 */
/** As sete vistas do BrawlScope, na ordem em que fazem sentido preencher. */
const VISTAS_BRAWLSCOPE = [
  { id: "overall", label: "Geral" },
  { id: "knockout", label: "Nocaute" },
  { id: "brawlBall", label: "Fute-Brawl" },
  { id: "gemGrab", label: "Pique-Gema" },
  { id: "bounty", label: "Caça-Estrelas" },
  { id: "heist", label: "Roubo" },
  { id: "hotZone", label: "Zona Estratégica" },
] as const;

type SourceStateView = { status: string; complete: boolean; fetchedAt: string; relationCount: number; modes?: string[]; note?: string };


const NOME_DA_FONTE: Record<string, string> = {
  brawlscope: "BrawlScope",
  planet: "Brawl Planet",
  prodigy: "PL Prodigy",
};

/**
 * Estado de cada fonte, com o motivo por extenso.
 *
 * Nasceu de uma pergunta que não devia ter sido precisa: "já se passaram horas
 * e os counters não atualizaram". O sistema sabia porquê — cada fonte grava uma
 * nota a dizer o que correu mal — mas essa nota nunca chegava ao ecrã. Só havia
 * um chip de "Fonte indisponível", que nada dizia sobre uma fonte que responde
 * e mesmo assim não produz leitura.
 *
 * Uma recolha parada e uma recolha a funcionar não podem parecer iguais.
 */
type ProbeStep = { label: string; level: "ok" | "warn" | "fail"; detail: string };
type ProbeResult = { source: string; url: string; ok: boolean; bytes: number; error?: string; steps: ProbeStep[]; excerpt?: { label: string; html: string } };

function readableSourceNote(value: unknown) {
  if (typeof value !== "string") return null;
  const note = value.replace(/\s+/g, " ").trim();
  if (!note) return null;
  if (note.length > 700 || /^[\[{]/.test(note)) return "A fonte devolveu um detalhe técnico muito extenso; os últimos dados válidos foram mantidos.";
  return note;
}

/** Tempo de vida em palavras, que é como se lê um número destes. */
function formatUptime(segundos: number | null) {
  if (segundos === null) return "—";
  if (segundos < 90) return `${segundos} s`;
  if (segundos < 5400) return `${Math.round(segundos / 60)} min`;
  return `${(segundos / 3600).toFixed(1)} h`;
}

export function SourceHealthPanel({ sourceStates, health, processHealth }: {
  sourceStates?: Record<string, SourceStateView> | null;
  health?: Record<string, { blocked?: boolean; blockedUntil?: number; lastStatus?: number }> | null;
  processHealth?: ProcessHealth | null;
}) {
  /**
   * Diagnóstico a pedido.
   *
   * Uma recolha pode concluir "com sucesso" e não trazer um único número novo:
   * basta a página ser descarregada e o parser não reconhecer nada lá dentro.
   * Nenhum erro apanha esse caso — e foi exatamente esse que deixou os counters
   * parados sem ninguém saber. Este botão descarrega uma página de cada fonte e
   * diz, passo a passo, o que o servidor recebeu e o que conseguiu extrair.
   */
  const probeMutation = trpc.syncJobs.probe.useMutation({
    onError: (error) => toast.error(error.message || "Não foi possível correr o diagnóstico."),
  });
  const probe = probeMutation.data as { ranAt: string; results: ProbeResult[] } | undefined;
  /**
   * Limpar o recuo acumulado.
   *
   * O recuo cresce a cada recusa e não sabe que a configuração mudou. Sem isto,
   * confirmar uma correção obrigava a esperar — e a espera chegou a 160 minutos
   * só por se ter testado três vezes.
   */
  const clearBackoffMutation = trpc.syncJobs.clearBackoff.useMutation({
    onSuccess: () => toast.success("Recuo das fontes limpo. A próxima recolha tenta já."),
    onError: (error) => toast.error(error.message || "Não foi possível limpar o recuo."),
  });
  /**
   * Quem está nesta sessão, e se é o dono.
   *
   * O botão de atualizar respondia "só o dono pode forçar uma atualização" sem
   * nunca dizer quem é o dono nem como se passa a ser. Mostrar o perfil e o
   * identificador aqui transforma um beco sem saída numa configuração de trinta
   * segundos — e evita descobrir o problema só ao carregar no botão.
   */
  const meQuery = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  /**
   * Estado da base de dados.
   *
   * Numa instalação nova, sem as tabelas criadas, o site mostrava
   * "Failed query: select ... from ranked_sync_config" e mais nada. Agora as
   * leituras já não rebentam — o site funciona com o catálogo do projeto — mas
   * a pessoa continua a precisar de saber que nada do que recolher vai ficar
   * guardado, e o que fazer para o resolver.
   */
  /**
   * Acumulação dos dados próprios.
   *
   * Depois de o BrawlScope fechar a porta, esta é a fonte que ninguém nos pode
   * recusar: os jogos verdadeiros. Mostrar o volume a crescer é o que torna a
   * espera compreensível — sem isto, "ainda não conta no Score" parece uma
   * promessa vazia em vez de um contador a subir.
   */
  const observedQuery = trpc.observedMatches.status.useQuery(undefined, { staleTime: 30_000, refetchInterval: 60_000 });
  const observed = observedQuery.data as { officialApiConfigured: boolean; coverage: { battles: number; pairSamples: number } } | undefined;
  const dbQuery = trpc.syncJobs.database.useQuery(undefined, { staleTime: 30_000 });
  /**
   * A chave da API oficial, definida aqui mesmo.
   *
   * Existia só como variável de ambiente, o que obriga a passar pela plataforma
   * de alojamento de cada vez. Quando esse acesso acaba, o site fica impossível
   * de configurar — a correr, com o dono à frente dele, a dizer que falta uma
   * chave que ele não tem por onde dar.
   */
  const [novaChave, setNovaChave] = useState("");
  /**
   * Colagem manual de fichas do BrawlScope.
   *
   * A recolha automática desta fonte acabou: responde 403 a este servidor e quem
   * a mantém não respondeu ao contacto. Não vai ser contornada. Mas as páginas
   * são públicas e abrem no navegador — uma pessoa a copiar uma ficha e a colá-la
   * aqui não é automatismo nenhum, e traz os 105 confrontos daquele brawler.
   */
  const [colagem, setColagem] = useState("");
  const [enderecoColagem, setEnderecoColagem] = useState("");
  const [vistaColagem, setVistaColagem] = useState("");
  /**
   * Depois de colar, as matrizes em cache ficam desatualizadas.
   *
   * Antes só se pedia de novo a vista "overall". Quem colasse a ficha de um
   * modo — Nocaute, Roubo — não via nada mudar: a matriz desse modo continuava
   * a ser a que estava em cache, até cinco minutos depois. Invalidar todas as
   * vistas obriga o Draft a ir buscar a que acabou de ser colada, seja ela
   * qual for.
   */
  const utilsColagem = trpc.useUtils();
  const importar = trpc.counterSync.importPage.useMutation({
    onSuccess: (resultado) => {
      if (resultado.ok) {
        toast.success(`${resultado.brawler} · ${resultado.viewLabel}`, {
          description: `${resultado.pairs} confrontos lidos, ${resultado.relations} relações e ${resultado.synergies} sinergias.${resultado.persisted ? " Guardado." : " Fica guardado no próximo ciclo."}${resultado.unknownNames?.length ? ` Nomes novos aceites: ${resultado.unknownNames.join(", ")}.` : ""}`,
        });
        setColagem("");
        void utilsColagem.counterSync.matchups.invalidate();
        void coberturaQuery.refetch();
      } else {
        toast.error("Não consegui ler essa página.", { description: resultado.error });
      }
    },
    onError: (erro) => toast.error(erro.message || "Não foi possível importar a ficha."),
  });
  const apagarColadas = trpc.counterSync.clearImported.useMutation({
    onSuccess: (resultado) => {
      toast.success(`Apagadas ${resultado.profiles} fichas.`, { description: "Podes colar de novo já a seguir." });
      void utilsColagem.counterSync.matchups.invalidate();
      void coberturaQuery.refetch();
    },
    onError: (erro) => toast.error(erro.message || "Não foi possível apagar."),
  });
  const coberturaQuery = trpc.counterSync.matchups.useQuery({ view: "overall" }, { staleTime: 15_000 });
  const cobertura = (coberturaQuery.data as { views?: Record<string, { profiles: number; pairs: number }> } | undefined)?.views ?? {};
  const chaveQuery = trpc.syncJobs.apiKeyState.useQuery(undefined, { staleTime: 30_000, retry: false });
  const chaveEstado = chaveQuery.data as { configured: boolean; origin: string; hint: string | null } | undefined;
  const guardarChave = trpc.syncJobs.setApiKey.useMutation({
    onSuccess: async (resultado) => {
      const teste = resultado.test as { ok: boolean; reason: string };
      if (teste.ok) toast.success("Chave guardada e aceite pela Supercell.", { description: teste.reason });
      else toast.error("Chave guardada, mas a Supercell recusou.", { description: teste.reason });
      setNovaChave("");
      await Promise.all([chaveQuery.refetch(), observedQuery.refetch()]);
    },
    onError: (erro) => toast.error(erro.message || "Não foi possível guardar a chave."),
  });
  const db = dbQuery.data as { configured: boolean; reachable: boolean; error: string | null } | undefined;
  const sessao = meQuery.data as { email?: string | null; name?: string | null; role?: string; openId?: string } | null | undefined;
  const entradas = Object.entries(sourceStates ?? {});
  const bloqueadas = Object.entries(health ?? {}).filter(([, estado]) => estado?.blocked);
  const comProblema = entradas.filter(([, estado]) => estado.status !== "success");
  const resumo = entradas.length
    ? comProblema.length
      ? `${comProblema.length} de ${entradas.length} fontes sem leitura completa.`
      : `As ${entradas.length} fontes leram por completo.`
    : "Ainda sem leitura nesta sessão.";

  return (
    <FoldPanel
      title="Estado das fontes"
      kicker="Sync"
      tone={bloqueadas.length || comProblema.length ? "warning" : "live"}
      summary={resumo}
      defaultOpen={Boolean(bloqueadas.length)}
    >
      <div className="source-health-list">
        {entradas.length === 0 && <p className="source-health-empty">Nenhuma fonte reportou leitura ainda. Ao arrancar, o primeiro ciclo corre passado um minuto.</p>}
        {entradas.map(([chave, estado]) => (
          <article key={chave} className={`source-health-row is-${estado.status}`}>
            <header>
              <strong>{NOME_DA_FONTE[chave] ?? chave}</strong>
              <span className={`source-health-badge is-${estado.status}`}>
                {estado.status === "success" ? "completa" : estado.status === "partial" ? "parcial" : "falhou"}
              </span>
            </header>
            <small className="source-health-meta">
              {estado.relationCount} relações · lida {estado.fetchedAt ? new Date(estado.fetchedAt).toLocaleString("pt-PT") : "—"}
              {estado.modes?.length ? ` · vistas renovadas: ${estado.modes.join(", ")}` : ""}
            </small>
            {readableSourceNote(estado.note) ? <p className="source-health-note">{readableSourceNote(estado.note)}</p> : null}
          </article>
        ))}
        {bloqueadas.map(([host, estado]) => (
          <article key={host} className="source-health-row is-failed">
            <header><strong>{host}</strong><span className="source-health-badge is-failed">bloqueada</span></header>
            <p className="source-health-note">
              A origem respondeu {estado.lastStatus ?? "com erro"} e a recolha recuou.
              {estado.blockedUntil ? ` Nova tentativa a partir das ${new Date(estado.blockedUntil).toLocaleTimeString("pt-PT")}.` : ""}
              {" "}Enquanto isso o site usa o catálogo do repositório: os números não estão errados, apenas não são de agora.
            </p>
          </article>
        ))}
      </div>

      <FilaDeColagem />

      <details className="paste-box">
        <summary>Colar ficha do BrawlScope</summary>
        <p className="paste-help">
          <b>Não uses Ctrl+U.</b> A tabela de confrontos é montada no navegador e não existe no
          código-fonte — era por isso que vinham zero confrontos. Faz assim:
        </p>
        <ol className="paste-steps">
          <li>Abre a ficha: <code>brawlscope.com/counters/shelly</code> (junta <code>?mode=knockout</code> para um modo)</li>
          <li>Copia o endereço da barra e cola no primeiro campo</li>
          <li>Na própria página: <b>Ctrl+A</b> e <b>Ctrl+C</b></li>
          <li>Cola na caixa grande e guarda</li>
        </ol>
        <input
          className="paste-url"
          value={enderecoColagem}
          onChange={(evento) => setEnderecoColagem(evento.target.value)}
          placeholder="https://brawlscope.com/counters/shelly?mode=knockout"
          spellCheck={false}
          aria-label="Endereço da ficha"
        />
        <textarea
          value={colagem}
          onChange={(evento) => setColagem(evento.target.value)}
          rows={5}
          placeholder="Cola aqui a página (Ctrl+A, Ctrl+C na ficha, depois Ctrl+V aqui)"
          spellCheck={false}
        />
        <div className="paste-actions">
          <select value={vistaColagem} onChange={(evento) => setVistaColagem(evento.target.value)} aria-label="Modo da ficha">
            <option value="">Modo: pelo endereço</option>
            <option value="overall">Geral</option>
            <option value="gemGrab">Pique-Gema</option>
            <option value="brawlBall">Fute-Brawl</option>
            <option value="knockout">Nocaute</option>
            <option value="heist">Roubo</option>
            <option value="hotZone">Zona Estratégica</option>
            <option value="bounty">Caça-Estrelas</option>
          </select>
          <button
            type="button"
            onClick={() => importar.mutate({ html: colagem, view: vistaColagem || undefined, url: enderecoColagem || undefined })}
            disabled={importar.isPending || colagem.trim().length < 400}
          >
            {importar.isPending ? "A ler…" : "Guardar ficha"}
          </button>
          <button
            type="button"
            className="paste-clear"
            onClick={() => { setColagem(""); setEnderecoColagem(""); }}
            disabled={!colagem && !enderecoColagem}
          >
            Limpar campos
          </button>
        </div>

        <div className="paste-coverage">
          <strong>Fichas guardadas</strong>
          <ul>
            {VISTAS_BRAWLSCOPE.map(({ id, label }) => (
              <li key={id} className={cobertura[id]?.profiles ? "tem" : ""}>
                {label}: <b>{cobertura[id]?.profiles ?? 0}</b>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="paste-clear"
            onClick={() => apagarColadas.mutate({})}
            disabled={apagarColadas.isPending}
          >
            {apagarColadas.isPending ? "A apagar…" : "Apagar todas as fichas guardadas"}
          </button>
        </div>
      </details>

      {chaveEstado ? (
        <div className={`api-key-box ${chaveEstado.configured ? "is-set" : ""}`}>
          <strong>Chave da API oficial</strong>
          <small>
            {chaveEstado.configured
              ? `Definida (${chaveEstado.hint}) · origem: ${chaveEstado.origin === "ambiente" ? "variável de ambiente" : "guardada aqui no site"}. Colar uma nova substitui a atual.`
              : "Ainda não há chave. Cria-a em developer.brawlstars.com e cola-a aqui — fica guardada na base de dados do site, sem precisares da plataforma de alojamento."}
          </small>
          <div className="api-key-row">
            <input
              type="password"
              value={novaChave}
              onChange={(evento) => setNovaChave(evento.target.value)}
              placeholder="Cola aqui a chave"
              autoComplete="off"
              spellCheck={false}
              aria-label="Chave da API oficial do Brawl Stars"
            />
            <button
              type="button"
              onClick={() => guardarChave.mutate({ key: novaChave })}
              disabled={guardarChave.isPending || novaChave.trim().length < 20}
            >
              {guardarChave.isPending ? "A guardar e testar…" : "Guardar e testar"}
            </button>
          </div>
        </div>
      ) : null}

      {observed ? (
        <p className={`source-health-observed ${observed.officialApiConfigured ? "" : "is-missing"}`}>
          <b>Dados próprios</b> — batalhas Ranked reais lidas da API oficial, agregadas por mapa e modo.{" "}
          {observed.officialApiConfigured ? (
            <>
              {observed.coverage.battles.toLocaleString("pt-PT")} partidas ·{" "}
              {observed.coverage.pairSamples.toLocaleString("pt-PT")} observações de confronto.
              {observed.coverage.pairSamples < 5000
                ? " Ainda a acumular: um confronto só conta no Score a partir de 30 observações no mesmo mapa."
                : " Já há volume suficiente para muitos confrontos terem leitura própria."}
            </>
          ) : (
            <>Inativo: falta definir <code>BRAWL_STARS_API_KEY</code> nas variáveis de ambiente. Sem ela não há batalhas para ler.</>
          )}
        </p>
      ) : null}

      {db && !db.reachable ? (
        <p className="source-health-db">
          <b>Base de dados inacessível.</b> O site está a funcionar com o catálogo do projeto, mas nada do que for
          recolhido fica guardado — a cada reinício perde-se tudo.
          {db.configured
            ? " Se for uma instalação nova, as tabelas ainda não existem: corre pnpm db:push."
            : " A variável DATABASE_URL não está definida."}
          {db.error ? <><br /><code>{db.error}</code></> : null}
        </p>
      ) : null}

      {sessao ? (
        <p className={`source-health-owner ${sessao.role === "admin" ? "is-owner" : ""}`}>
          Sessão: <b>{sessao.email ?? sessao.name ?? "—"}</b> · perfil <b>{sessao.role === "admin" ? "dono" : "utilizador"}</b>
          {sessao.role === "admin" ? null : (
            <>
              {" "}— sem perfil de dono, "Atualizar agora" e o diagnóstico ficam bloqueados. Define{" "}
              <code>OWNER_OPEN_ID={sessao.openId ?? "?"}</code> nas variáveis de ambiente e volta a entrar.
            </>
          )}
        </p>
      ) : null}

      {processHealth ? (
        <p className={`source-health-uptime ${processHealth.uptimeSeconds !== null && processHealth.uptimeSeconds < 120 ? "is-fresh" : ""}`}>
          Servidor de pé há <b>{formatUptime(processHealth.uptimeSeconds)}</b>
          {processHealth.rssMb !== null ? ` · ${processHealth.rssMb} MB de memória` : ""}
          {processHealth.uptimeSeconds !== null && processHealth.uptimeSeconds < 120
            ? " — se este número nunca passar de uns minutos, o servidor está a reiniciar em ciclo."
            : ""}
        </p>
      ) : null}

      <div className="source-probe">
        <div className="source-probe-actions">
        <button
          type="button"
          className="source-probe-button"
          onClick={() => probeMutation.mutate()}
          disabled={probeMutation.isPending}
        >
          <Stethoscope size={14} />
          {probeMutation.isPending ? "A testar as fontes…" : "Testar fontes agora"}
        </button>
        <button
          type="button"
          className="source-probe-button"
          onClick={() => clearBackoffMutation.mutate({})}
          disabled={clearBackoffMutation.isPending}
        >
          <RotateCcw size={14} />
          {clearBackoffMutation.isPending ? "A limpar…" : "Limpar espera das fontes"}
        </button>
        </div>
        <small className="source-probe-hint">
          O teste descarrega uma página de cada fonte e mostra o que o parser conseguiu ler; não altera dados nem
          aumenta a espera. "Limpar espera" esquece o recuo acumulado, para uma correção poder ser confirmada já.
        </small>

        {probe ? (
          <div className="source-probe-results">
            {probe.results.map((resultado) => (
              <article key={`${resultado.source}-${resultado.url}`} className="source-probe-card">
                <header>
                  <strong>{resultado.source}</strong>
                  <span>{resultado.bytes ? `${Math.round(resultado.bytes / 1024)} KB` : "sem resposta"}</span>
                </header>
                {resultado.steps.map((passo) => (
                  <p key={passo.label} className={`source-probe-step is-${passo.level}`}>
                    <b>{passo.label}</b>
                    <span>{passo.detail}</span>
                  </p>
                ))}
                {resultado.error ? <p className="source-probe-step is-fail"><b>Erro</b><span>{resultado.error}</span></p> : null}
                {/*
                  O excerto só aparece quando alguma coisa falhou. É para ser
                  copiado: sem ver a marcação real, corrigir o parser é adivinhar.
                */}
                {resultado.excerpt ? (
                  <details className="source-probe-excerpt">
                    <summary>{resultado.excerpt.label} — copia isto</summary>
                    <textarea readOnly value={resultado.excerpt.html} rows={8} onFocus={(event) => event.currentTarget.select()} />
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </FoldPanel>
  );
}

function FoldPanel({ title, kicker, summary, children, defaultOpen = false, tone = "neutral" }: {
  title: string;
  kicker?: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: "neutral" | "live" | "warning";
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`fold-panel tone-${tone} ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="fold-panel-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="fold-panel-title">
          {kicker ? <em>{kicker}</em> : null}
          <strong>{title}</strong>
          {summary ? <small>{summary}</small> : null}
        </span>
        <ChevronDown size={16} className="fold-panel-chevron" />
      </button>
      {open ? <div className="fold-panel-body">{children}</div> : null}
    </section>
  );
}


/**
 * Número que anima até ao novo valor em vez de saltar.
 *
 * Não é enfeite. Num draft, o Score de um brawler muda porque entrou um pick —
 * e o que interessa não é o valor final, é o SALTO: subiu ou desceu, e quanto.
 * Um número que troca instantaneamente esconde essa informação; um número que
 * percorre a distância mostra-a sem precisar de a explicar.
 *
 * Respeita `prefers-reduced-motion`: quem pediu um ecrã quieto recebe o valor
 * final de imediato, sem animação nenhuma.
 */
function CountUp({ value, decimals = 1, className }: { value: number; decimals?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    const quieto = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (quieto || from === value) {
      fromRef.current = value;
      setShown(value);
      return;
    }

    const inicio = performance.now();
    const duracao = 420;
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracao);
      // Desacelera no fim: chega ao valor sem parecer que bateu numa parede.
      const suave = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * suave);
      if (t < 1) frameRef.current = requestAnimationFrame(passo);
      else fromRef.current = value;
    };
    frameRef.current = requestAnimationFrame(passo);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [value]);

  const subiu = value > fromRef.current;
  return (
    <span className={`count-up ${subiu ? "is-up" : ""} ${className ?? ""}`}>
      {Number.isFinite(shown) ? shown.toFixed(decimals) : "—"}
    </span>
  );
}

function DraftTopbar({ onReset, isRefreshing, refreshProgress, onRefresh, observedLabel, capturedAt, syncState, blockedSources }: {
  refreshProgress?: string | null;
  onReset: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  observedLabel: string;
  capturedAt?: string | null;
  syncState: string;
  blockedSources: string[];
}) {
  return (
    <header className="topbar">
      <div className="topbar-crumbs"><span className="crumb-muted">Ranked</span><span>›</span><span className="crumb-muted">Brawl Híbrido</span><span>›</span><span className="crumb-active">Draft</span></div>
      <div className="topbar-actions">
        <SyncStatusChip capturedAt={capturedAt} syncState={syncState} blockedSources={blockedSources} />
        <span className="live-chip" title="Partidas Ranked observadas e deduplicadas; não alteram o Score até atingirem evidência suficiente."><span className="live-dot" /> {observedLabel}</span>
        {/*
          O rótulo mostra o passo real quando o servidor o reporta. "A atualizar…"
          durante minutos é indistinguível de um botão avariado; "BrawlScope ·
          vista 3/7" não é.
        */}
        <button className="refresh-button" title={isRefreshing ? refreshProgress ?? "A sincronização está a decorrer em segundo plano" : "Atualizar dados agora"} onClick={onRefresh} disabled={isRefreshing} aria-label={isRefreshing ? `A atualizar dados${refreshProgress ? `: ${refreshProgress}` : ""}` : "Atualizar dados agora"}>
          <Radio size={16} className={isRefreshing ? "animate-pulse" : undefined} />
          <span>{isRefreshing ? refreshProgress ?? "A atualizar…" : "Atualizar agora"}</span>
        </button>
        <button className="icon-button" title="Limpar draft" onClick={onReset} aria-label="Limpar draft"><RotateCcw size={16} /></button>
        <div className="profile-chip"><span className="profile-avatar">BH</span><span className="profile-label">Analista</span></div>
      </div>
    </header>
  );
}

function EmptySlot({ step, active, onClick }: { step: DraftStep; active: boolean; onClick?: () => void }) {
  return (
    <button className={`draft-slot empty-slot ${active ? "is-active" : ""}`} onClick={onClick} disabled={!onClick} title="Clique para ativar este turno" aria-label={`Ativar ${step.label} para a equipa ${step.team === "blue" ? "Azul" : "Vermelha"}`}>
      <span className="slot-index">{step.label}</span><span className="slot-plus">{active ? "●" : "+"}</span>
    </button>
  );
}

function FilledSlot({ row, step, onClear, teammateNames, mapTeams }: { row: RankedRow; step: DraftStep; onClear: () => void; teammateNames: string[]; mapTeams?: readonly BrawlPlanetMapTeam[] }) {
  const role = inferDraftRole(row.brawler);
  const winRate = row.brawlPlanetWinRate ?? row.topBrawlWinRate ?? row.winRate;
  const mapTeamSynergy = step.kind === "pick" ? findBrawlPlanetMapTeam(row.brawler, teammateNames, mapTeams) : null;
  const synergyPartners = mapTeamSynergy
    ? teammateNames.filter((name) => mapTeamSynergy.brawlers.some((member) => member.toLocaleLowerCase() === name.toLocaleLowerCase()))
    : [];
  const slotButton = (
    <button className={`draft-slot filled-slot ${step.kind}-slot`} onClick={onClear} title="Clique para remover esta escolha">
      <span className="slot-image" style={brawlerImageFor(row) ? { backgroundImage: `url(${brawlerImageFor(row)})` } : undefined}>{!brawlerImageFor(row) && row.brawler.slice(0, 2).toUpperCase()}</span>
      <span className="slot-copy"><strong>{row.brawler}</strong><small>{step.kind === "ban" ? "BAN" : `${role.toUpperCase()} · WR ${formatMetric(winRate)}`}</small></span>
      <span className="slot-remove"><X size={13} /></span>
    </button>
  );
  if (step.kind !== "pick") return slotButton;
  return (
    <HoverCard openDelay={120} closeDelay={100}>
      <HoverCardTrigger asChild>{slotButton}</HoverCardTrigger>
      <HoverCardContent className="pick-insight-tooltip" side="bottom" align="center">
        <div className="pick-insight-kicker"><Gauge size={12} /> PICK INSIGHT · MAPA ATIVO</div>
        <strong>{row.brawler}</strong>
        <div className="pick-insight-metrics">
          <div><span>Win Rate Brawl Planet</span><b>{formatMetric(row.brawlPlanetWinRate)}</b></div>
          <div><span>Win Rate TopBrawl</span><b>{formatMetric(row.topBrawlWinRate)}</b></div>
        </div>
        <div className={`pick-insight-synergy ${mapTeamSynergy ? "is-active" : ""}`}>
          <Sparkles size={13} />
          <div>{mapTeamSynergy ? <><span>Sinergia de equipa confirmada</span><strong>{synergyPartners.join(" · ")}</strong><small>Brawl Planet · composição publicada · WR {formatMetric(mapTeamSynergy.winRate)}</small></> : <><span>Sinergia de equipa</span><small>Sem composição literal do Brawl Planet com os Picks aliados atuais.</small></>}</div>
        </div>
        <small className="pick-insight-hint">Clique no Pick para o remover.</small>
      </HoverCardContent>
    </HoverCard>
  );
}

function SkippedSlot({ step, onClear }: { step: DraftStep; onClear: () => void }) {
  return <button className={`draft-slot skipped-slot ${step.kind}-slot`} onClick={onClear} title="Clique para reabrir este passo"><span className="slot-image"><SkipForward size={14} /></span><span className="slot-copy"><strong>{step.kind === "ban" ? "Ban ignorado" : "Pick ignorado"}</strong><small>{step.kind.toUpperCase()} · PASSO LIVRE</small></span><span className="slot-remove"><X size={13} /></span></button>;
}

/**
 * Quadro literal do Brawl Planet para o mapa ativo: as composições de três
 * brawlers publicadas na tabela Teams, na ordem de Win Rate da fonte. Nada é
 * inferido a partir dos brawlers individuais mais fortes do mapa.
 */
function MapTeamBoardPanel({ mapName, mapTeams, allyNames }: { mapName?: string; mapTeams?: readonly BrawlPlanetMapTeam[]; allyNames: string[] }) {
  const board = useMemo(() => getBrawlPlanetMapTeamBoard(mapTeams, mapName, allyNames), [mapTeams, mapName, allyNames]);
  const sourceUrl = board[0]?.sourceUrl;
  return (
    <section className="draft-arena-map-teams" aria-label="Composições publicadas para o mapa">
      <div className="section-kicker"><Users size={12} /> Equipas do mapa <span>BRAWL PLANET</span></div>
      <strong>Top {BRAWL_PLANET_MAP_TEAM_LIMIT} de composições</strong>
      {board.length ? (
        <ol className="map-team-list">
          {board.map((team) => (
            <li key={`${team.rank}-${team.brawlers.join("-")}`} className={team.matchedAllies.length ? "is-matched" : ""}>
              <span className="map-team-rank">{team.rank}</span>
              <span className="map-team-names">{team.brawlers.map((member) => (
                <em key={member} className={team.matchedAllies.some((ally) => ally.toLocaleLowerCase() === member.toLocaleLowerCase()) ? "is-picked" : ""}>{member}</em>
              ))}</span>
              <span className="map-team-wr">{team.winRate.toFixed(1)}%</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="map-team-empty">Sem composições publicadas para {mapName ?? "este mapa"} na última sincronização. O Draft não cria equipas a partir dos brawlers individuais.</p>
      )}
      <small>{board.length ? "Um Pick aliado dentro de uma destas composições ativa o bónus de Equipa do mapa." : "Corre a sincronização Ranked para recolher a tabela Teams do Brawl Planet."}{sourceUrl ? <> · <a href={sourceUrl} target="_blank" rel="noreferrer">fonte</a></> : null}</small>
    </section>
  );
}

function TeamBoard({ team, myTeam, steps, choices, skipped, rows, mapTeams, activeStep, onClear, onClearSkip, onActivate }: { team: TeamId; myTeam: TeamId; steps: DraftStep[]; choices: (string | null)[]; skipped: boolean[]; rows: RankedRow[]; mapTeams?: readonly BrawlPlanetMapTeam[]; activeStep: number | null; onClear: (stepIndex: number) => void; onClearSkip: (stepIndex: number) => void; onActivate: (stepIndex: number) => void }) {
  const stepsForTeam = steps.map((step, index) => ({ step, index })).filter(({ step }) => step.team === team);
  const findRow = (name: string | null) => rows.find((row) => row.brawler === name);
  const banSteps = stepsForTeam.filter(({ step }) => step.kind === "ban");
  const pickSteps = stepsForTeam.filter(({ step }) => step.kind === "pick");
  const teamPickNames = pickSteps.map(({ index }) => choices[index]).filter((name): name is string => Boolean(name));
  const resolvedTeamSteps = stepsForTeam.filter(({ index }) => choices[index] || skipped[index]).length;
  return (
    <section className={`team-board ${team}`}>
      <div className="team-heading"><div className="team-identity"><div className="team-color-dot" /><div><span className="team-kicker">TEAM {team === "blue" ? "01" : "02"} · {team === "blue" ? "BLUE SIDE" : "RED SIDE"}</span><h3>{team === "blue" ? "Azul" : "Vermelha"}</h3></div></div><div className="team-heading-meta"><span className={`team-perspective ${team === myTeam ? "is-you" : "is-opponent"}`}>{team === myTeam ? "A TUA EQUIPA" : "ADVERSÁRIO"}</span><span className="team-count"><strong>{resolvedTeamSteps}</strong><em>/{stepsForTeam.length}</em></span></div></div>
      <div className="team-lane ban-lane"><div className="lane-label"><span><Shield size={13} /> BANS</span><small>{banSteps.length} slots</small></div><div className="slot-grid">{banSteps.map(({ step, index }) => choices[index] ? <FilledSlot key={index} row={findRow(choices[index]) ?? rows[0]} step={step} teammateNames={[]} onClear={() => onClear(index)} /> : skipped[index] ? <SkippedSlot key={index} step={step} onClear={() => onClearSkip(index)} /> : <EmptySlot key={index} step={step} active={activeStep === index} onClick={() => onActivate(index)} />)}</div></div>
      <div className="team-lane pick-lane"><div className="lane-label"><span><Target size={13} /> PICKS</span><small>{pickSteps.length} slots</small></div><div className="slot-grid">{pickSteps.map(({ step, index }) => choices[index] ? <FilledSlot key={index} row={findRow(choices[index]) ?? rows[0]} step={step} teammateNames={teamPickNames.filter((name) => name !== choices[index])} mapTeams={mapTeams} onClear={() => onClear(index)} /> : skipped[index] ? <SkippedSlot key={index} step={step} onClear={() => onClearSkip(index)} /> : <EmptySlot key={index} step={step} active={activeStep === index} onClick={() => onActivate(index)} />)}</div></div>
    </section>
  );
}

function DraftProbabilityCenter({ blueRows, redRows, activeStepIndex, mapName, modeId }: { blueRows: RankedRow[]; redRows: RankedRow[]; activeStepIndex: number | null; mapName?: string; modeId?: string }) {
  const estimate = estimateDraftWinProbability(blueRows, redRows);
  const totalPicks = blueRows.length + redRows.length;
  const observedMatchup = trpc.observedMatches.matchup.useQuery({
    mapName: mapName ?? "Sem mapa",
    modeId: modeId ?? "ranked",
    brawler: blueRows[0]?.brawler ?? "Sem brawler",
    opponent: redRows[0]?.brawler ?? "Sem oponente",
  }, { enabled: Boolean(mapName && modeId && blueRows[0] && redRows[0]), staleTime: 60_000 });
  const counterText = (team: "blue" | "red") => estimate.counterImpacts.filter((impact) => impact.team === team).map((impact) => `${impact.attacker} → ${impact.defender} (+${impact.impactPoints} pp)`);
  const blueCounters = counterText("blue");
  const redCounters = counterText("red");
  return (
    <div className="draft-probability-center" aria-live="polite" aria-label={`Probabilidade média final: Azul ${estimate.blueWinProbability} por cento, Inimigo ${estimate.redWinProbability} por cento`}>
      <div className="draft-probability-kicker"><Trophy size={12} /> PROBABILIDADE MÉDIA FINAL</div>
      <div className="draft-probability-values">
        <div className="draft-probability-team blue"><span>AZUL</span><strong>{estimate.blueWinProbability}%</strong></div>
        <div className="draft-probability-mid"><span>VS</span><div className="draft-probability-track"><i className="blue-fill" style={{ width: `${estimate.blueWinProbability}%` }} /><i className="red-fill" style={{ width: `${estimate.redWinProbability}%` }} /></div></div>
        <div className="draft-probability-team red"><span>INIMIGO</span><strong>{estimate.redWinProbability}%</strong></div>
      </div>
      {blueRows[0] && redRows[0] && <div className="draft-counter-balance observed-matchup-evidence">
        {observedMatchup.data?.found
          ? <small>Observado neste mapa: <strong>{blueRows[0].brawler} {observedMatchup.data.winRate}%</strong> contra {redRows[0].brawler} · n={observedMatchup.data.samples}. Ainda não altera o Score.</small>
          : <small>Sem amostra observada para {blueRows[0].brawler} × {redRows[0].brawler} neste mapa.</small>}
      </div>}
      {(blueCounters.length || redCounters.length) ? <div className="draft-counter-balance" aria-label="Impacto dos counters na probabilidade">
        <div className="draft-counter-line blue"><strong>AZUL +{estimate.blueCounterImpact.toFixed(1)} pp</strong><span>{blueCounters.join(" · ") || "Sem counter literal ativo"}</span></div>
        <div className="draft-counter-line red"><strong>VERMELHA +{estimate.redCounterImpact.toFixed(1)} pp</strong><span>{redCounters.join(" · ") || "Sem counter literal ativo"}</span></div>
        <small>Saldo de counters: {estimate.netBlueCounterImpact === 0 ? "equilibrado" : estimate.netBlueCounterImpact > 0 ? `Azul +${estimate.netBlueCounterImpact.toFixed(1)} pp` : `Vermelha +${Math.abs(estimate.netBlueCounterImpact).toFixed(1)} pp`} · relações literais: BrawlScope, PL Prodigy e Brawl Planet</small>
      </div> : null}
      <small>{totalPicks ? `${totalPicks}/6 picks · ${estimate.advantageLabel}` : "Base inicial 50/50 · preenche os picks para atualizar"}{activeStepIndex !== null ? ` · TURN ${activeStepIndex + 1}` : ""}</small>
    </div>
  );
}

function DraftScoreReference({ entries, mapName, pickNumber }: { entries: ContextualDraftScoreEntry[]; mapName?: string; pickNumber?: number }) {
  return (
    <aside className="hybrid-usage-reference" aria-label={`Brawlers com mais Pontos Finais em ${mapName ?? "este mapa"}`}>
      <div className="hybrid-usage-head">
        <div>
          <span className="section-kicker"><Trophy size={11} /> PONTOS FINAIS</span>
          <strong>Maiores pontos no mapa</strong>
        </div>
        <span className="usage-ban-hint"><ArrowDown size={11} /> MAIOR → MENOR</span>
      </div>
      <ol className="hybrid-usage-list">
        {entries.map(({ row, rank, basePoints, finalPoints, openingBonusActive }) => {
          const image = brawlerImageFor(row);
          return (
            <li key={row.brawler} className="hybrid-usage-row">
              <span className="hybrid-usage-rank">#{rank}</span>
              <span className="hybrid-usage-avatar" style={image ? { backgroundImage: `url(${image})` } : undefined}>{!image && row.brawler.slice(0, 2).toUpperCase()}</span>
              <span className="hybrid-usage-copy"><strong>{row.brawler}</strong><small>{pickNumber ? `Pick global ${pickNumber}` : "Draft fechado"} · Base {basePoints.toFixed(2)}</small></span>
              <span className="hybrid-usage-value"><b>{finalPoints.toFixed(2)}</b><small>PTS FINAIS{openingBonusActive ? " · abertura ativa" : ""}</small></span>
            </li>
          );
        })}
      </ol>
      <p>Base 100 corresponde ao melhor Score Híbrido disponível no mapa. O rank é decidido pelos Pontos Finais depois das regras contextuais do pick.</p>
    </aside>
  );
}

function LiveCounterEngine({ suggestions, enemyRows, canAutoPick, onSelect, onSimulate }: { suggestions: LiveCounterSuggestion[]; enemyRows: RankedRow[]; canAutoPick: boolean; onSelect: (name: string) => void; onSimulate: () => void }) {
  const visibleSuggestions = suggestions.slice(0, 5);
  const positionLabel: Record<LiveCounterSuggestion["position"], string> = { mid: "MID", left: "SIDE LEFT", right: "SIDE RIGHT" };
  return (
    <section className="live-counter-engine" aria-live="polite">
      <div className="live-counter-head">
        <div>
          <div className="section-kicker"><span className="tiny-live" /> LIVE COUNTER ENGINE <span>REAÇÃO AO INIMIGO</span></div>
          <h2>Resposta automática ao draft.</h2>
          <p>{enemyRows.length ? "Cada pick inimigo recalcula counters, posição e pressão de matchup em tempo real." : "Escolhe um brawler inimigo para ativar a simulação de contra-ataque."}</p>
        </div>
        <button type="button" className="live-counter-simulate" onClick={onSimulate} disabled={!canAutoPick || !visibleSuggestions[0]}><Zap size={14} /> Simular melhor resposta</button>
      </div>
      {enemyRows.length === 0 ? (
        <div className="live-counter-empty"><Crosshair size={18} /><span>Sem picks inimigos registados. A engine ficará ativa assim que o primeiro adversário for escolhido.</span></div>
      ) : visibleSuggestions.length === 0 ? (
        <div className="live-counter-empty"><AlertTriangle size={18} /><span>Não há um counter direto cadastrado para esta combinação; usa o Counter Radar para uma alternativa contextual.</span></div>
      ) : (
        <div className="live-counter-grid">
          {visibleSuggestions.map((suggestion) => (
            <article className="live-counter-card" key={`${suggestion.enemyBrawler}-${suggestion.recommendedBrawler}`}>
              <div className="live-counter-matchup"><span className="live-counter-enemy">{suggestion.enemyBrawler}</span><ArrowRight size={13} /><strong>{suggestion.recommendedBrawler}</strong></div>
              <div className="live-counter-meta"><span>{positionLabel[suggestion.position]}</span><b>{suggestion.advantageScore}% vantagem</b></div>
              <p>{suggestion.explanation}</p>
              <button type="button" onClick={() => onSelect(suggestion.recommendedBrawler)} disabled={!canAutoPick}><Crosshair size={13} /> Escolher counter</button>
            </article>
          ))}
        </div>
      )}
      {enemyRows.length > 0 && !canAutoPick && <small className="live-counter-hint">A simulação fica disponível quando o turno ativo for um pick da tua equipa.</small>}
    </section>
  );
}

/**
 * Radar de um sinal específico.
 *
 * Os dois radares — sinergia e counter — recebiam a MESMA lista de candidatos e
 * mostravam por isso exatamente os mesmos brawlers, com textos diferentes por
 * baixo. Dois painéis a prometer leituras distintas e a dizer o mesmo é pior do
 * que um painel só.
 *
 * Agora cada um ordena pelo seu próprio sinal e mostra quanto esse sinal vale.
 * Quando o sinal ainda não existe — sem picks inimigos não há counter — diz-se
 * isso, em vez de encher o espaço com uma lista repetida.
 */
const SignalCard = memo(function SignalCard({ title, eyebrow, entries, reason, metric, unit, emptyLabel, onSelect }: {
  title: string;
  eyebrow: string;
  entries: Array<Pick<ContextualDraftScoreEntry, "row" | "rank" | "basePoints" | "finalPoints"> & { signalValue?: number }>;
  reason: string;
  metric: string;
  unit?: string;
  emptyLabel: string;
  onSelect: (name: string) => void;
}) {
  return (
    <article className="signal-card">
      <div className="signal-card-heading"><div><div className="section-kicker">{eyebrow}</div><strong>{title}</strong></div><span className="signal-heuristic">{metric}</span></div>
      <p>{reason}</p>
      {entries.length ? (
        <div className="signal-list">{entries.slice(0, 3).map((entry) => (
          <button key={entry.row.brawler} className="signal-row" onClick={() => onSelect(entry.row.brawler)}>
            <span className="signal-rank">{String(entry.rank).padStart(2, "0")}</span>
            <span className="signal-name">{entry.row.brawler}</span>
            <span className="signal-score">{formatMetric(entry.signalValue ?? entry.finalPoints, "")}{unit ?? " pts"}</span>
          </button>
        ))}</div>
      ) : (
        <span className="signal-empty">{emptyLabel}</span>
      )}
    </article>
  );
});

function ScrimSetup({ preset, initialTeam, myTeam, steps, onPresetChange, onInitialTeamChange, onMyTeamChange, onStepsChange }: { preset: ScrimPreset; initialTeam: TeamId; myTeam: TeamId; steps: DraftStep[]; onPresetChange: (preset: ScrimPreset) => void; onInitialTeamChange: (team: TeamId) => void; onMyTeamChange: (team: TeamId) => void; onStepsChange: (steps: DraftStep[]) => void }) {
  const moveStep = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    const next = [...steps];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onStepsChange(next);
  };
  const updateStep = (index: number, patch: Partial<DraftStep>) => onStepsChange(steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  const addStep = (kind: DraftStep["kind"]) => onStepsChange([...steps, { kind, team: initialTeam, label: kind === "ban" ? "Ban" : "Pick" }]);
  const removeStep = (index: number) => { if (steps.length > 1) onStepsChange(steps.filter((_, stepIndex) => stepIndex !== index)); };

  return (
    <section className="scrim-setup-panel">
      <div className="scrim-setup-heading"><div><div className="section-kicker">Scrim lab <span>CONFIGURAÇÃO PERSONALIZADA</span></div><h3>Desenha a tua ordem.</h3><p>Escolhe quem começa e adapta a sequência ao formato do teu treino. Cada alteração reinicia os slots para evitar estados inválidos.</p></div><Settings2 size={20} /></div>
      <div className="scrim-setup-controls">
        <label><span>Preset de draft</span><select value={preset} onChange={(event) => onPresetChange(event.target.value as ScrimPreset)}>{Object.entries(scrimPresetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Lado inicial</span><select value={initialTeam} onChange={(event) => onInitialTeamChange(event.target.value as TeamId)}><option value="blue">Equipa 1 · Azul</option><option value="red">Equipa 2 · Vermelha</option></select></label>
        <label><span>Minha perspetiva</span><select value={myTeam} onChange={(event) => onMyTeamChange(event.target.value as TeamId)}><option value="blue">Eu · Azul</option><option value="red">Eu · Vermelha</option></select></label>
        <div className="scrim-setup-stat"><strong>{steps.length}</strong><span>passos</span></div>
        <div className="scrim-setup-stat"><strong>{steps.filter((step) => step.kind === "ban").length}</strong><span>bans</span></div>
        <div className="scrim-setup-stat"><strong>{steps.filter((step) => step.kind === "pick").length}</strong><span>picks</span></div>
      </div>
      {preset === "custom" && <>
        <div className="scrim-sequence-list">{steps.map((step, index) => <div className="scrim-sequence-row" key={`${index}-${step.kind}-${step.team}`}><span className="scrim-sequence-index">{String(index + 1).padStart(2, "0")}</span><select aria-label={`Tipo do passo ${index + 1}`} value={step.kind} onChange={(event) => updateStep(index, { kind: event.target.value as DraftStep["kind"], label: event.target.value === "ban" ? "Ban" : "Pick" })}><option value="ban">BAN</option><option value="pick">PICK</option></select><select aria-label={`Equipa do passo ${index + 1}`} value={step.team} onChange={(event) => updateStep(index, { team: event.target.value as TeamId })}><option value="blue">AZUL</option><option value="red">VERMELHA</option></select><span className={`scrim-team-marker ${step.team}`} /><button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} aria-label={`Mover passo ${index + 1} para cima`}><ArrowUp size={13} /></button><button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} aria-label={`Mover passo ${index + 1} para baixo`}><ArrowDown size={13} /></button><button type="button" className="scrim-remove-step" onClick={() => removeStep(index)} disabled={steps.length <= 1} aria-label={`Remover passo ${index + 1}`}><X size={13} /></button></div>)}</div>
        <div className="scrim-add-actions"><button type="button" onClick={() => addStep("ban")}><Shield size={13} /> Adicionar ban</button><button type="button" onClick={() => addStep("pick")}><Target size={13} /> Adicionar pick</button></div>
      </>}
      <div className="scrim-sequence-preview"><span>ORDEM ATIVA</span>{steps.map((step, index) => <b key={index} className={step.team}>{index + 1} {step.kind === "ban" ? "B" : "P"} · {step.team === "blue" ? "A" : "V"}</b>)}</div>
    </section>
  );
}

const DraftCard = memo(function DraftCard({ row, index, draftScore, basePoints, finalPoints, signal, onSelect, locked, banned, suggestionTeam, rosterNames, activeCounterWindow, expanded }: { expanded: boolean; row: RankedRow; index: number; draftScore: number; basePoints: number; finalPoints: number; signal: DraftSignal; onSelect: (name: string) => void; locked: boolean; banned: boolean; suggestionTeam: TeamId; rosterNames: string[]; activeCounterWindow: readonly string[] }) {
  const brawlerImage = brawlerImageFor(row);
  const role = inferDraftRole(row.brawler);
  const roleWinRate = row.winRate;
  const profile = getCounterProfile(row.brawler, rosterNames);
  const build = getBrawlerBuild(row.brawler, row.modeId);
  const activeBonusItems = getActiveDraftBonuses(signal, role, row.brawler);
  const sameClassTriggers = signal.bonusSources.sameClassPenalties ?? [];
  const sameClassClass = signal.bonusSources.sameClassClass ?? getBrawlerClass(row.brawler);
  const sameClassPenaltyCount = sameClassTriggers.length || 1;
  const hasSameClassPenalty = signal.scoreBreakdown.sameClassPenaltyPoints > 0;
  const topCounterWindowSize = signal.scoreBreakdown.topCounterWindowSize;
  const enemyCounters = signal.bonusSources.enemyCounters ?? [];
  const repeatedPressures = signal.bonusSources.repeatedEnemyCounterPressures ?? [];
  const topWindowCounters = signal.bonusSources.topTwentyCounters ?? [];
  const topWindowNonCounters = expanded ? activeCounterWindow.filter((windowBrawler) =>
    windowBrawler.toLowerCase() !== row.brawler.toLowerCase()
    && getLiteralCounterRelations(windowBrawler, row.brawler).length === 0,
  ) : [];
  const banAudit = buildBanAudit(signal, row.brawler);
  const directEnemyCounterRate = rateFromContextualPoints(signal.scoreBreakdown.enemyCounterPenaltyPoints, signal.scoreBreakdown.hybridPoints);
  const repeatedPressureRate = rateFromContextualPoints(signal.scoreBreakdown.repeatedEnemyCounterPressurePoints, signal.scoreBreakdown.hybridPoints);
  const topCounterRate = rateFromContextualPoints(signal.scoreBreakdown.topTwentyCounterPenaltyPoints, signal.scoreBreakdown.hybridPoints);
  const sameClassPenaltyRate = rateFromContextualPoints(signal.scoreBreakdown.sameClassPenaltyPoints, signal.scoreBreakdown.hybridPoints);
  return (
    <button className={`draft-recommendation ${locked ? "is-locked" : ""} ${banned ? "is-ban-eligible" : ""} ${hasSameClassPenalty ? "has-class-penalty" : ""}`} onClick={() => onSelect(row.brawler)} disabled={locked} title={banned ? "Ban registado: brawler excluído da pool competitiva" : undefined}>
      <span className="recommendation-rank">{String(index + 1).padStart(2, "0")}</span>
      <span className="recommendation-avatar" style={brawlerImage ? { backgroundImage: `url(${brawlerImage})` } : undefined}>{!brawlerImage && row.brawler.slice(0, 2).toUpperCase()}</span>
      <span className="recommendation-main">
        <strong>{row.brawler} {banned && <em className="recommendation-ban-note">BAN · EXCLUÍDO</em>}</strong>
        <small>{role === "side" ? "LANE" : role.toUpperCase()} · Vitória {formatMetric(roleWinRate)} · Uso {formatMetric(row.usage)}</small>
        {expanded && <>
        <small className="recommendation-factor-line">PONTOS BASE {basePoints.toFixed(2)} · SCORE HÍBRIDO REAL {signal.scoreBreakdown.hybridPoints.toFixed(2)}</small>
        {hasSameClassPenalty && <span className={`recommendation-class-penalty team-${suggestionTeam}`} aria-label={`Desbónus de mesma classe em ${row.brawler}: menos ${formatRulePercentage(sameClassPenaltyRate)} por cento, ativado pelos Picks da equipa ${suggestionTeam === "blue" ? "Azul" : "Vermelha"}: ${sameClassTriggers.join(", ") || "aliado da mesma classe"}`}>
          <AlertTriangle size={13} aria-hidden="true" />
          <span className="recommendation-class-penalty-copy"><b>DESBÓNUS DE CLASSE</b><strong>−{formatRulePercentage(sameClassPenaltyRate)}%</strong><em>{sameClassClass}</em><small>Picks {suggestionTeam === "blue" ? "Azuis" : "Vermelhos"}: {sameClassTriggers.join(", ") || "aliado da mesma classe"}</small></span>
        </span>}
        <span className="recommendation-bonus-breakdown" aria-label={`Fatores ativos: ${activeBonusItems.length ? activeBonusItems.map((bonus) => `${bonus.label} ${bonus.points >= 0 ? "mais" : "menos"} ${Math.abs(bonus.points).toFixed(2)} pontos${bonus.source ? `, ${bonus.source}` : ""}`).join(", ") : "nenhum"}`}>
          <small className="recommendation-bonus-heading">FATORES ATIVOS</small>
          {activeBonusItems.length ? activeBonusItems.map((bonus) => { const normalizedPoints = normalizeContextualPoints(bonus.points, basePoints, signal.scoreBreakdown.hybridPoints); return <small className={`recommendation-bonus-chip ${bonus.points < 0 ? "is-penalty" : ""}`} key={bonus.label}><span className="recommendation-bonus-label">{bonus.label}</span> <b>{normalizedPoints >= 0 ? `+${normalizedPoints.toFixed(2)}` : normalizedPoints.toFixed(2)} pts</b> <em>({bonus.rate >= 0 ? `+${formatRulePercentage(bonus.rate)}%` : `${formatRulePercentage(bonus.rate)}%`})</em>{bonus.source && <span className="recommendation-bonus-source">{bonus.source}</span>}</small>; }) : <small className="recommendation-bonus-empty">Nenhum neste cenário</small>}
        </span>
        <span className="recommendation-counter-audit" aria-label={`Auditoria de counters de ${row.brawler}. Janela Counter Top: Top ${topCounterWindowSize}. Enemy Counter direto: menos ${directEnemyCounterRate} por cento. Pressão Enemy Counter: menos ${repeatedPressureRate} por cento. Counter Top: menos ${topCounterRate} por cento.`}>
          <small className="recommendation-counter-audit-heading"><Shield size={10} /> AUDITORIA DE COUNTERS</small>
          <small className="recommendation-counter-audit-window"><b>JANELA COUNTER TOP · TOP {topCounterWindowSize}</b><span>{activeCounterWindow.length ? activeCounterWindow.join(", ") : "sem janela após o 6.º pick"}</span></small>
          <small className={`recommendation-counter-audit-rule ${enemyCounters.length ? "is-active" : ""}`}><b>ENEMY COUNTER DIRETO {directEnemyCounterRate ? `−${formatRulePercentage(directEnemyCounterRate)}%` : "0%"}</b><span>{enemyCounters.length ? `por ${enemyCounters.join(", ")}` : "nenhum inimigo escolhido countera este candidato"}</span></small>
          <small className={`recommendation-counter-audit-rule ${repeatedPressures.length ? "is-active" : ""}`}><b>PRESSÃO INIMIGA {repeatedPressureRate ? `−${formatRulePercentage(repeatedPressureRate)}%` : "0%"}</b><span>{repeatedPressures.length ? repeatedPressures.map((pressure) => `${pressure.enemy} → ${pressure.counteredAllies.join(", ")}`).join(" · ") : "nenhum inimigo já countera aliado deste lado"}</span></small>
          <small className={`recommendation-counter-audit-rule ${topWindowCounters.length ? "is-active" : ""}`}><b>RISCO COUNTER TOP {topCounterWindowSize} · AVISO 0%</b><span>{topWindowCounters.length ? `counters literais na janela: ${topWindowCounters.join(", ")}` : "nenhum counter literal deste candidato está na janela"}</span></small>
          <small className="recommendation-counter-audit-rule"><b>SEM COUNTER TOP NESTE CANDIDATO</b><span>{topWindowNonCounters.length ? `na janela, mas não counteram ${row.brawler}: ${topWindowNonCounters.join(", ")}` : "todos os outros nomes da janela counteram este candidato"}</span></small>
          <small className="recommendation-counter-audit-note">Counter Top é apenas um aviso do mapa. Enemy Counter direto e Pressão Inimiga aplicam-se quando existem picks inimigos reais.</small>
        </span>
        {/*
          Auditoria de bans, sempre visível.

          O bónus de Ban exige duas condições ao mesmo tempo — o banido tem de
          ser counter literal deste candidato E estar no Top 25 do mapa — e,
          quando falhava, o cartão não dizia nada. Um bónus silencioso parece um
          bónus avariado. Aqui cada ban registado é classificado: paga, não paga
          por estar fora do Top 25, ou não paga por não counterar este brawler.
        */}
        <span className="recommendation-counter-audit" aria-label={`Auditoria de bans de ${row.brawler}. ${banAudit.aria}`}>
          <small className="recommendation-counter-audit-heading"><Ban size={10} /> AUDITORIA DE BANS</small>
          <small className="recommendation-counter-audit-window"><b>BANS REGISTADOS · {banAudit.registered.length}</b><span>{banAudit.registered.length ? banAudit.registered.join(", ") : "nenhum ban registado neste draft"}</span></small>
          <small className={`recommendation-counter-audit-rule ${banAudit.paying.length ? "is-active" : ""}`}><b>BÓNUS DE BAN {banAudit.paying.length ? `+${formatRulePercentage(signal.scoreBreakdown.banBonusRate * 100 * banAudit.paying.length)}%` : "0%"}</b><span>{banAudit.paying.length ? `${banAudit.paying.join(", ")} · counter direto deste brawler e Top 25 do mapa · +${formatRulePercentage(signal.scoreBreakdown.banBonusRate * 100)}% por counter no pick ${signal.scoreBreakdown.banBonusPick}` : "nenhum ban cumpre as duas condições para este candidato"}</span></small>
          <small className={`recommendation-counter-audit-rule ${banAudit.outsideTop25.length ? "is-active" : ""}`}><b>BAN SEM BÓNUS · FORA DO TOP 25</b><span>{banAudit.outsideTop25.length ? `${banAudit.outsideTop25.join(", ")} · countera este brawler, mas não está no Top 25 de Score Híbrido base do mapa` : "nenhum ban ficou de fora por esta razão"}</span></small>
          <small className={`recommendation-counter-audit-rule ${banAudit.notCounters.length ? "is-active" : ""}`}><b>BAN SEM BÓNUS · NÃO COUNTERA</b><span>{banAudit.notCounters.length ? `${banAudit.notCounters.join(", ")} · não consta do Top 10 de counters de ${row.brawler}` : "nenhum ban ficou de fora por esta razão"}</span></small>
          <small className="recommendation-counter-audit-note">O bónus só paga quando o banido é counter literal deste candidato e está no Top 25 do mapa. Banir um brawler forte que não te countera não altera o teu Score — altera o de quem ele counterava.</small>
        </span>
        <small className={`recommendation-factor-line recommendation-total-increase ${finalPoints - basePoints > 0 ? "is-up" : finalPoints - basePoints < 0 ? "is-down" : ""}`}>{finalPoints - basePoints > 0 ? "SUBIU" : finalPoints - basePoints < 0 ? "DESCEU" : "SEM AJUSTE"} <b>{finalPoints - basePoints >= 0 ? `+${(finalPoints - basePoints).toFixed(2)}` : (finalPoints - basePoints).toFixed(2)} pts</b> ({signal.scoreBreakdown.hybridPoints ? `${signal.scoreBreakdown.contextualAdjustment >= 0 ? "+" : ""}${((signal.scoreBreakdown.contextualAdjustment / signal.scoreBreakdown.hybridPoints) * 100).toFixed(0)}%` : "0%"}) · dos {activeBonusItems.filter((bonus) => bonus.points !== 0).length} fatores acima</small>
        <small className="recommendation-decision-line">{signal.decisionType.toUpperCase()} · {role === "flex" ? "FLEX NÃO É POSIÇÃO PRINCIPAL" : "POSIÇÃO PRINCIPAL"}</small><small className="recommendation-position-line">{signal.positionAdvice}</small>
        <small className="recommendation-counter-line"><Swords size={11} /> Countera: {profile.counters.length ? profile.counters.slice(0, 4).join(", ") : "sem relação estruturada"} · Counterado por: {profile.counteredBy.length ? profile.counteredBy.slice(0, 4).join(", ") : "sem relação estruturada"}</small>
        <small className="recommendation-source-line">TB WR {formatMetric(row.topBrawlWinRate)} · USE {formatMetric(row.topBrawlUseRate)} · SCORE {formatMetric(row.topBrawlScore, "")}</small>
        <small className="recommendation-source-line planet-line">BP WR {formatMetric(row.brawlPlanetWinRate)} · PICK {formatMetric(row.brawlPlanetPickRate)} · SP {formatMetric(row.brawlPlanetStarPlayer)}</small>
        <small className="recommendation-reason-line"><Brain size={11} /> {signal.reasons[0]}</small>
        <small className="recommendation-build-line">⚡ Gadget: {build.gadget} | Star Power: {build.starPower} | Gears: {build.gears.join(", ")}</small>
        </>}
        {!expanded && <small className="pick-brief">{hasSameClassPenalty ? "⚠ Classe repetida · " : ""}{finalPoints - basePoints >= 0 ? "+" : ""}{(finalPoints - basePoints).toFixed(2)} pts ({signal.scoreBreakdown.contextualAdjustment >= 0 ? "+" : ""}{(signal.scoreBreakdown.hybridPoints ? signal.scoreBreakdown.contextualAdjustment / signal.scoreBreakdown.hybridPoints * 100 : 0).toFixed(1)}%) · {signal.decisionType}</small>}
      </span>
      <span className="recommendation-metrics"><b>{formatMetric(finalPoints, "")}</b><small>PONTOS FINAIS</small></span>
      <span className="recommendation-side"><span>BASE {basePoints.toFixed(2)} · SCORE DRAFT {draftScore.toFixed(2)}</span><span>SCORE HÍBRIDO {signal.scoreBreakdown.hybridScore.toFixed(2)} · REGRAS CONTEXTUAIS ATIVAS</span></span>
      <span className="recommendation-action">{locked ? "LOCK" : "ADD"}</span>
    </button>
  );
});

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

type MatchupSlot = { position: "left" | "mid" | "right"; ally: RankedRow; enemy: RankedRow };
type MatchupItem = { lane: MatchupSlot; matchup: ReturnType<typeof calculateLaneMatchup> };
type ScoredMatchupItem = MatchupItem & {
  allySignal: DraftSignal;
  enemySignal: DraftSignal;
  allyBasePoints: number;
  allyFinalPoints: number;
  enemyBasePoints: number;
  enemyFinalPoints: number;
};

function ScoreRiseSummary({ label, row, signal, basePoints, finalPoints }: { label: string; row: RankedRow; signal: DraftSignal; basePoints: number; finalPoints: number }) {
  const role = inferDraftRole(row.brawler);
  const bonuses = getActiveDraftBonuses(signal, role, row.brawler);
  const relativeIncrease = signal.scoreBreakdown.hybridPoints
    ? (signal.scoreBreakdown.contextualAdjustment / signal.scoreBreakdown.hybridPoints) * 100
    : 0;
  const normalizedAdjustment = finalPoints - basePoints;
  return (
    <div className="matchup-score-rise-team">
      <div className="matchup-score-rise-team-head"><span>{label}</span><strong>{row.brawler}</strong></div>
      <div className="matchup-score-rise-values"><b>{finalPoints.toFixed(2)} <small>PTS FINAIS</small></b><span>base {basePoints.toFixed(2)} · <strong>{normalizedAdjustment >= 0 ? "+" : ""}{normalizedAdjustment.toFixed(2)} pts</strong></span></div>
      {bonuses.length ? (
        <div className="matchup-score-rise-bonuses" aria-label={`Fatores em ${row.brawler}: ${bonuses.map((bonus) => `${bonus.label}, ${bonus.rate >= 0 ? "mais" : "menos"} ${Math.abs(bonus.rate)} por cento e ${normalizeContextualPoints(bonus.points, basePoints, signal.scoreBreakdown.hybridPoints).toFixed(2)} pontos`).join(", ")}`}>
          {bonuses.map((bonus) => { const normalizedPoints = normalizeContextualPoints(bonus.points, basePoints, signal.scoreBreakdown.hybridPoints); return <span className={bonus.points < 0 ? "is-penalty-chip" : ""} key={bonus.label}>{bonus.label} <b>{bonus.rate >= 0 ? `+${bonus.rate}%` : `${bonus.rate}%`}</b> <em>{normalizedPoints >= 0 ? `+${normalizedPoints.toFixed(2)}` : normalizedPoints.toFixed(2)} pts</em>{bonus.source && <small className="matchup-score-rise-bonus-source">{bonus.source}</small>}</span>; })}
        </div>
      ) : <small className="matchup-score-rise-empty">Sem ajuste ativo: mantém a base híbrida.</small>}
      <small className="matchup-score-rise-total">AJUSTE TÉCNICO: <b>{normalizedAdjustment >= 0 ? `+${normalizedAdjustment.toFixed(2)}` : normalizedAdjustment.toFixed(2)} pts</b> ({signal.scoreBreakdown.contextualAdjustment >= 0 ? "+" : ""}{relativeIncrease.toFixed(0)}%) · Híbrido real {signal.scoreBreakdown.hybridScore.toFixed(2)}</small>
    </div>
  );
}

function MatchupDuelCard({ item }: { item: ScoredMatchupItem }) {
  const { lane, matchup, allySignal, enemySignal, allyBasePoints, allyFinalPoints, enemyBasePoints, enemyFinalPoints } = item;
  const isFavorable = matchup.score >= 55;
  const isRisky = matchup.score <= 45;
  const blueCounters = matchup.source === "explicit-counter";
  const redCounters = matchup.source === "explicit-defense";
  const state = isFavorable ? "FAVORÁVEL" : isRisky ? "SOB PRESSÃO" : "EQUILIBRADO";
  const source = matchup.source === "explicit-counter" ? "Counter direto" : matchup.source === "explicit-defense" ? "Defesa contra counter" : "Leitura por Win Rate";
  const laneLabel = lane.position === "mid" ? "MID" : lane.position === "left" ? "LANE ESQUERDA" : "LANE DIREITA";
  return (
    <article className={`matchup-duel matchup-duel--${lane.position} ${isFavorable ? "is-favorable" : isRisky ? "is-risky" : "is-even"}`}>
      <div className="matchup-duel-top"><span>{laneLabel}</span><strong className={isFavorable ? "is-favorable" : isRisky ? "is-risky" : "is-even"}>{state}</strong></div>
      <div className="matchup-duel-players">
        <div className="matchup-player matchup-player--ally"><span className="matchup-player-avatar">{brawlerImageFor(lane.ally) ? <img src={brawlerImageFor(lane.ally)!} alt="" /> : lane.ally.brawler.slice(0, 2)}</span><div><small>AZUL</small><strong>{lane.ally.brawler}</strong></div></div>
        <div className="matchup-duel-score"><strong>{matchup.score.toFixed(0)}<small>%</small></strong><span>VS</span></div>
        <div className="matchup-player matchup-player--enemy"><div><small>VERMELHA</small><strong>{lane.enemy.brawler}</strong></div><span className="matchup-player-avatar">{brawlerImageFor(lane.enemy) ? <img src={brawlerImageFor(lane.enemy)!} alt="" /> : lane.enemy.brawler.slice(0, 2)}</span></div>
      </div>
      <div className="matchup-duel-bar" aria-label={`${matchup.score.toFixed(0)}% de vantagem para Azul: ${lane.ally.brawler}`}><i style={{ width: `${matchup.score}%` }} /><b style={{ left: `${matchup.score}%` }} /></div>
      <div className="matchup-duel-footer"><span><Target size={12} /> {source}</span><span>{matchup.position === "mid" ? "Jogar Mid" : matchup.position === "left" ? "Jogar Lane esquerda" : "Jogar Lane direita"}</span></div>
      <div className="duel-points-overview">
        {[{ name: lane.ally.brawler, base: allyBasePoints, final: allyFinalPoints, signal: allySignal }, { name: lane.enemy.brawler, base: enemyBasePoints, final: enemyFinalPoints, signal: enemySignal }].map(team =>
          <div key={team.name}><span>{team.name}</span><strong>{team.final.toFixed(2)} <small>pts</small></strong><small>Base {team.base.toFixed(2)} · Ajuste {team.final - team.base >= 0 ? "+" : ""}{(team.final - team.base).toFixed(2)} pts</small><b>{team.signal.scoreBreakdown.contextualAdjustment >= 0 ? "+" : ""}{(team.signal.scoreBreakdown.hybridPoints ? team.signal.scoreBreakdown.contextualAdjustment / team.signal.scoreBreakdown.hybridPoints * 100 : 0).toFixed(1)}%</b></div>)}
      </div>
      <details className="duel-details"><summary>Ver counters, fontes e cálculo dos pontos</summary>
      <p>{matchup.note}</p>
      <div className="matchup-perspectives" aria-label={`Leitura direcional entre Azul ${lane.ally.brawler} e Vermelha ${lane.enemy.brawler}`}>
        <div className={`matchup-perspective matchup-perspective--blue ${blueCounters ? "is-counter" : redCounters ? "is-countered" : "is-neutral"}`}><span>AZUL</span><strong>{blueCounters ? `${lane.ally.brawler} countera ${lane.enemy.brawler}` : redCounters ? `${lane.ally.brawler} é counterado por ${lane.enemy.brawler}` : "Sem counter literal"}</strong><small>{blueCounters ? "Ataque favorável publicado para este duelo." : redCounters ? "Atenção: o counter publicado favorece Vermelha." : "O melhor duelo é escolhido pela leitura de Win Rate."}</small></div>
        <div className={`matchup-perspective matchup-perspective--red ${redCounters ? "is-counter" : blueCounters ? "is-countered" : "is-neutral"}`}><span>VERMELHA</span><strong>{redCounters ? `${lane.enemy.brawler} countera ${lane.ally.brawler}` : blueCounters ? `${lane.enemy.brawler} é counterado por ${lane.ally.brawler}` : "Sem counter literal"}</strong><small>{redCounters ? "Ataque favorável publicado para este duelo." : blueCounters ? "Atenção: o counter publicado favorece Azul." : "O melhor duelo é escolhido pela leitura de Win Rate."}</small></div>
      </div>
      <div className="matchup-score-rise"><div className="matchup-score-rise-heading"><span>{lane.position === "mid" ? "POR QUE OS PONTOS SUBIRAM?" : "DETALHAMENTO DOS PONTOS"}</span><small>Simulação antes de fixar cada brawler neste contexto</small></div><div className="matchup-score-rise-grid"><ScoreRiseSummary label="AZUL" row={lane.ally} signal={allySignal} basePoints={allyBasePoints} finalPoints={allyFinalPoints} /><ScoreRiseSummary label="VERMELHA" row={lane.enemy} signal={enemySignal} basePoints={enemyBasePoints} finalPoints={enemyFinalPoints} /></div></div>
      </details>
    </article>
  );
}

const LaneMatchupDesk = memo(function LaneMatchupDesk({ blueRows, redRows, mapName, mapModeId, mapTeams, bannedNames, baseHybridTop25Names, baseHybridTop30Names, pickNumber, completedPickCount, topRecommendationNames, counterPenaltyEligibleNames, experimentalWeights, maxHybridScore, ruleSettings }: { blueRows: RankedRow[]; redRows: RankedRow[]; mapName?: string; mapModeId?: string; mapTeams?: readonly BrawlPlanetMapTeam[]; bannedNames: ReadonlySet<string>; baseHybridTop25Names?: readonly string[]; baseHybridTop30Names?: readonly string[]; pickNumber?: number; completedPickCount?: number; topRecommendationNames?: readonly string[]; counterPenaltyEligibleNames?: readonly string[]; experimentalWeights?: ExperimentalWeights; maxHybridScore?: number; ruleSettings?: DraftRuleSettings }) {
  const assigned = new Set<string>();
  const pickForLane = (rows: RankedRow[], team: TeamId, position: "left" | "mid" | "right") => {
    const preferredRole = position === "mid" ? "mid" : "side";
    const preferred = rows.find((row) => !assigned.has(`${team}:${row.brawler}`) && inferDraftRole(row.brawler) === preferredRole);
    const fallback = rows.find((row) => !assigned.has(`${team}:${row.brawler}`));
    const selected = preferred ?? fallback;
    if (selected) assigned.add(`${team}:${selected.brawler}`);
    return selected;
  };
  const laneSlots = (["left", "mid", "right"] as const).map((position) => ({
    position,
    ally: pickForLane(blueRows, "blue", position),
    enemy: pickForLane(redRows, "red", position),
  }));
  const matchups: ScoredMatchupItem[] = laneSlots.filter((lane): lane is typeof lane & MatchupSlot => Boolean(lane.ally && lane.enemy)).map((lane) => {
    const allyContext = { mapModeId, mapTeams, allyRows: blueRows.filter((row) => row.brawler !== lane.ally.brawler), enemyRows: redRows, bannedNames, baseHybridTop25Names, baseHybridTop30Names, pickNumber, completedPickCount, topRecommendationNames, counterPenaltyEligibleNames, experimentalWeights, ruleSettings };
    const enemyContext = { mapModeId, mapTeams, allyRows: redRows.filter((row) => row.brawler !== lane.enemy.brawler), enemyRows: blueRows, bannedNames, baseHybridTop25Names, baseHybridTop30Names, pickNumber, completedPickCount, topRecommendationNames, counterPenaltyEligibleNames, experimentalWeights, ruleSettings };
    const neutralAllySignal = calculateDraftSignal(lane.ally, allyContext);
    const neutralEnemySignal = calculateDraftSignal(lane.enemy, enemyContext);
    const reciprocalCounterScores = new Map([
      [lane.ally.brawler.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""), neutralAllySignal.draftScore],
      [lane.enemy.brawler.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""), neutralEnemySignal.draftScore],
    ]);
    const allySignal = calculateDraftSignal(lane.ally, { ...allyContext, reciprocalCounterScores });
    const enemySignal = calculateDraftSignal(lane.enemy, { ...enemyContext, reciprocalCounterScores });
    reciprocalCounterScores.set(lane.ally.brawler.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""), allySignal.draftScore);
    reciprocalCounterScores.set(lane.enemy.brawler.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""), enemySignal.draftScore);
    const matchup = calculateLaneMatchup(lane.ally, lane.enemy, lane.position, reciprocalCounterScores);
    const referenceHybridScore = maxHybridScore && maxHybridScore > 0
      ? maxHybridScore
      : Math.max(allySignal.scoreBreakdown.hybridScore, enemySignal.scoreBreakdown.hybridScore);
    const allyPoints = calculateNormalizedDraftPoints(allySignal.scoreBreakdown.hybridScore, allySignal.draftScore, referenceHybridScore);
    const enemyPoints = calculateNormalizedDraftPoints(enemySignal.scoreBreakdown.hybridScore, enemySignal.draftScore, referenceHybridScore);
    return {
      lane,
      matchup,
      allySignal,
      enemySignal,
      allyBasePoints: allyPoints.basePoints,
      allyFinalPoints: allyPoints.finalPoints,
      enemyBasePoints: enemyPoints.basePoints,
      enemyFinalPoints: enemyPoints.finalPoints,
    };
  });
  const midMatchup = matchups.find((item) => item.lane.position === "mid");
  const laneMatchups = matchups.filter((item) => item.lane.position !== "mid");
  const blueCounters = matchups.filter((item) => item.matchup.source === "explicit-counter");
  const redCounters = matchups.filter((item) => item.matchup.source === "explicit-defense");
  const neutralMatchups = matchups.filter((item) => item.matchup.source !== "explicit-counter" && item.matchup.source !== "explicit-defense");
  const teamScoreSummary = calculateDuelTeamScoreSummary(matchups.map((item) => ({
    blueScore: item.allyFinalPoints,
    redScore: item.enemyFinalPoints,
  })));
  const { duelCount: activeDuelCount, blueAverage: blueScoreAverage, redAverage: redScoreAverage, difference: scoreDifference, bluePercentage, redPercentage } = teamScoreSummary;
  const scoreLeader = getDuelTeamScoreLeader(teamScoreSummary);
  const blueLeads = scoreLeader === "blue";
  const redLeads = scoreLeader === "red";
  const percentageLabel = activeDuelCount ? `${bluePercentage.toFixed(1)}% / ${redPercentage.toFixed(1)}%` : "—";
  const scoreLeadLabel = !activeDuelCount
    ? "Aguardando duelos"
    : Math.abs(scoreDifference) < 0.01
      ? "Empate técnico"
      : scoreDifference > 0
        ? `Azul +${scoreDifference.toFixed(2)} pts`
        : `Vermelha +${Math.abs(scoreDifference).toFixed(2)} pts`;
  const scoreLeadStatus = scoreLeader === "tie" ? "EMPATE 50/50" : blueLeads ? "AZUL LIDERA" : redLeads ? "VERMELHA LIDERA" : "SEM DUELOS";
  const matchupCounterRate = matchups.length
    ? matchups.reduce((total, item) => total + (item.allySignal.counterMatchups.find((matchup) => matchup.defender === item.lane.enemy.brawler)?.counterDelta ?? 0), 0) / matchups.length
    : 0;

  return (
    <section id="matchup-matrix" className="coach-desk lane-matchup-desk" aria-label="Matriz de Matchups 1v1 de Mid e Lanes">
      <div className="coach-desk-header">
        <div>
          <div className="section-kicker"><Swords size={13} /> Matriz 1v1 <span>FLEX & SIDE LANE MATCHUPS</span></div>
          <h2>Duelo Mid e Lanes{mapName ? ` · ${mapName}` : ""}</h2>
          <p>Azul e Vermelha são lidos separadamente: cada painel mostra quem countera, quem é counterado e quando não existe counter literal. Sem relação publicada, a matriz mostra apenas a melhor leitura por Win Rate.</p>
        </div>
        <div className="coach-confidence ready"><span>1V1 ATIVOS</span><strong>{matchups.length}/3</strong><small>{blueRows.length} Azul · {redRows.length} Vermelha</small></div>
      </div>
      <div className="coach-metric-strip">
        <div><span>MID</span><strong>{midMatchup ? "1v1" : "—"}</strong><small>{midMatchup ? `${midMatchup.lane.ally.brawler} vs ${midMatchup.lane.enemy.brawler}` : "Aguardando duelistas"}</small></div>
        <div><span>LANES</span><strong>{laneMatchups.length}/2</strong><small>Esquerda · Direita</small></div>
        <div><span>VANTAGEM AZUL</span><strong>{matchups.length ? `${(matchups.reduce((total, item) => total + item.matchup.score, 0) / matchups.length).toFixed(0)}%` : "—"}</strong><small>Na média dos duelos ativos</small></div>
        <div><span>COUNTER</span><strong>{matchups.length ? `${matchupCounterRate > 0 ? "+" : ""}${matchupCounterRate.toFixed(1)}%` : "—"}</strong><small>média dos deltas individuais</small></div>
      </div>
      <section className="matchup-team-score-summary" aria-label={`Soma e média de Pontos Finais: Azul ${teamScoreSummary.blueTotal.toFixed(2)} pontos, Vermelha ${teamScoreSummary.redTotal.toFixed(2)} pontos. ${scoreLeadLabel}.`}>
        <div className={`matchup-team-score matchup-team-score--blue ${blueLeads ? "is-leading" : scoreLeader === "tie" ? "is-tied" : ""}`}><span><Gauge size={12} /> PONTOS FINAIS · AZUL {blueLeads ? <em className="matchup-team-score-trophy"><Trophy size={11} aria-hidden="true" /> LÍDER</em> : null}</span><strong>{activeDuelCount ? teamScoreSummary.blueTotal.toFixed(2) : "—"} <small>PTS</small></strong><small>{activeDuelCount ? `Média ${blueScoreAverage.toFixed(2)} pts · ${bluePercentage.toFixed(1)}% da soma` : "Aguardando duelo ativo"}</small></div>
        <div className={`matchup-team-score matchup-team-score--difference ${scoreLeader ? `is-${scoreLeader}` : ""}`}><span>{scoreLeader === "tie" ? "REPARTIÇÃO EQUILIBRADA" : "REPARTIÇÃO DA SOMA"}</span><strong>{percentageLabel}</strong><small>{activeDuelCount ? `${scoreLeadStatus} · ${scoreLeadLabel} · Scores de Mid e Lanes 1v1` : "Aguardando duelo ativo"}</small></div>
        <div className={`matchup-team-score matchup-team-score--red ${redLeads ? "is-leading" : scoreLeader === "tie" ? "is-tied" : ""}`}><span><Gauge size={12} /> PONTOS FINAIS · VERMELHA {redLeads ? <em className="matchup-team-score-trophy"><Trophy size={11} aria-hidden="true" /> LÍDER</em> : null}</span><strong>{activeDuelCount ? teamScoreSummary.redTotal.toFixed(2) : "—"} <small>PTS</small></strong><small>{activeDuelCount ? `Média ${redScoreAverage.toFixed(2)} pts · ${redPercentage.toFixed(1)}% da soma` : "Aguardando duelo ativo"}</small></div>
      </section>
      <div className="matchup-perspective-board" aria-label="Resumo de counters por perspetiva">
        <div className="matchup-board-side matchup-board-side--blue"><span>AZUL COUNTERA</span><strong>{blueCounters.length ? blueCounters.map((item) => `${item.lane.ally.brawler} → ${item.lane.enemy.brawler}`).join(" · ") : "Nenhum counter literal ativo"}</strong><small>{blueCounters.length ? "Ataques favoráveis publicados para Azul." : "Sem relação publicada a favor de Azul."}</small></div>
        <div className="matchup-board-side matchup-board-side--red"><span>VERMELHA COUNTERA</span><strong>{redCounters.length ? redCounters.map((item) => `${item.lane.enemy.brawler} → ${item.lane.ally.brawler}`).join(" · ") : "Nenhum counter literal ativo"}</strong><small>{redCounters.length ? "Ataques favoráveis publicados para Vermelha." : "Sem relação publicada a favor de Vermelha."}</small></div>
        <div className="matchup-board-side matchup-board-side--neutral"><span>NEUTROS</span><strong>{neutralMatchups.length ? neutralMatchups.map((item) => `${item.lane.ally.brawler} × ${item.lane.enemy.brawler}`).join(" · ") : "Todos os duelos têm counter literal"}</strong><small>{neutralMatchups.length ? "A decisão usa a melhor leitura por Win Rate." : "Não há duelos estimados nesta matriz."}</small></div>
      </div>
      {matchups.length === 0 ? (
        <div className="draft-empty"><Crosshair size={22} /><strong>A aguardar picks de Azul e Vermelha.</strong><span>Escolhe pelo menos um brawler em cada equipa para abrir a primeira leitura 1v1.</span></div>
      ) : (
        <div className="matchup-matrix">
            <section className="matchup-zone matchup-zone--mid"><div className="matchup-zone-head"><span><Crosshair size={14} /> MID</span><strong>Duelo Mid 1v1</strong><small>Controla o espaço e a rotação.</small></div>{midMatchup ? <MatchupDuelCard item={midMatchup} /> : <div className="matchup-zone-empty"><Crosshair size={19} /><strong>Mid ainda aberto</strong><span>O próximo Mid preencherá este duelo central.</span></div>}</section>
            <section className="matchup-zone matchup-zone--lanes"><div className="matchup-zone-head"><span><Layers3 size={14} /> LANES</span><strong>Lanes 1v1</strong><small>Pressão isolada nas duas extremidades.</small></div><div className="matchup-lanes-grid">{laneMatchups.length ? laneMatchups.map((item) => <MatchupDuelCard key={item.lane.position} item={item} />) : <div className="matchup-zone-empty"><Layers3 size={19} /><strong>Lanes ainda abertas</strong><span>Escolhe brawlers de Lane para comparar os dois lados.</span></div>}</div></section>
        </div>
      )}
    </section>
  );
});

function FinalWinProbability({ blueRows, redRows, myTeam }: { blueRows: RankedRow[]; redRows: RankedRow[]; myTeam: TeamId }) {
  const estimate = estimateDraftWinProbability(blueRows, redRows);
  const myProbability = myTeam === "blue" ? estimate.blueWinProbability : estimate.redWinProbability;
  return (
    <section className="final-win-probability" aria-label="Estimativa final de vitória">
      <div className="final-win-heading"><div><div className="section-kicker"><Trophy size={13} /> Final draft read <span>MODEL ESTIMATE</span></div><h3>Probabilidade estimada de vitória</h3><p>Leitura final do modelo com Win Rate, Hybrid Score e diferença de composição. Não é uma odd oficial nem substitui a execução em jogo.</p></div><div className="final-win-call"><span>{myTeam === "blue" ? "TU · AZUL" : "TU · VERMELHA"}</span><strong>{myProbability}%</strong><small>{estimate.advantageLabel}</small></div></div>
      <div className="final-win-bars"><div className="final-win-team blue"><div><span>AZUL</span><strong>{estimate.blueWinProbability}%</strong></div><div className="final-win-track"><i style={{ width: `${estimate.blueWinProbability}%` }} /></div></div><div className="final-win-team red"><div><span>VERMELHA</span><strong>{estimate.redWinProbability}%</strong></div><div className="final-win-track"><i style={{ width: `${estimate.redWinProbability}%` }} /></div></div></div>
      {estimate.counterImpacts.length ? <p className="final-counter-note">Counters no cálculo: Azul +{estimate.blueCounterImpact.toFixed(1)} pp · Vermelha +{estimate.redCounterImpact.toFixed(1)} pp. O saldo inclui riscos cruzados contra os teus próprios picks.</p> : null}
    </section>
  );
}

function QuickPickRail({ activeStep, entries, selectionLockedNames, onSelect, onSkip }: { activeStep: DraftStep | null; entries: readonly RankedDraftEntry<RankedRow>[]; selectionLockedNames: Set<string>; onSelect: (name: string) => void; onSkip: () => void }) {
  const [quickQuery, setQuickQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quickEntries = useMemo(
    () => {
      const normalizedQuery = quickQuery.trim().toLowerCase();
      return entries
        .filter((entry) => !normalizedQuery || entry.row.brawler.toLowerCase().includes(normalizedQuery))
        .slice(0, normalizedQuery ? 7 : 5);
    },
    [entries, quickQuery],
  );
  const firstAvailableRow = quickEntries.find((entry) => !selectionLockedNames.has(entry.row.brawler))?.row;
  const actionLabel = activeStep?.kind === "ban" ? "Banir" : "Escolher";

  useEffect(() => { setQuickQuery(""); }, [activeStep?.label]);

  const selectQuickBrawler = (name: string) => {
    if (!activeStep || selectionLockedNames.has(name)) return;
    setQuickQuery("");
    onSelect(name);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const submitQuickSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeStep || !firstAvailableRow) return;
    selectQuickBrawler(firstAvailableRow.brawler);
  };

  return (
    <aside className="draft-quick-pick" aria-label="Seleção rápida do Draft">
      <div className="draft-quick-pick-heading">
        <div>
          <div className="section-kicker"><Target size={12} /> PICK AGORA <span>COMANDO RÁPIDO</span></div>
          <strong>{activeStep ? `${activeStep.kind === "ban" ? "Ban" : "Pick"} · ${activeStep.team === "blue" ? "Azul" : "Vermelha"}` : "Draft resolvido"}</strong>
          <small>{activeStep ? "Pesquisa por nome e confirma diretamente no turno ativo." : "Reabre um slot ou reinicia o draft para continuar."}</small>
        </div>
        {activeStep && <button type="button" className="quick-skip-button" onClick={onSkip}><SkipForward size={13} /> {activeStep.kind === "ban" ? "Passar ban" : "Pular"}</button>}
      </div>
      <form className="quick-pick-search" onSubmit={submitQuickSearch}>
        <Search size={15} aria-hidden="true" />
        <input
          ref={searchInputRef}
          value={quickQuery}
          onChange={(event) => setQuickQuery(event.target.value)}
          placeholder="Pesquisar brawler…"
          aria-label="Pesquisar brawler para o turno ativo"
          disabled={!activeStep}
        />
        {quickQuery && <button type="button" className="quick-search-clear" onClick={() => setQuickQuery("")} aria-label="Limpar pesquisa"><X size={13} /></button>}
        <button type="submit" className="quick-search-submit" disabled={!activeStep || !firstAvailableRow}>
          {actionLabel}
        </button>
      </form>
      <div className="quick-search-status" aria-live="polite">
        {quickQuery.trim()
          ? `${quickEntries.length} resultado${quickEntries.length === 1 ? "" : "s"} para “${quickQuery.trim()}”`
          : "Top opções para o mapa e o turno atual"}
      </div>
      <div className="quick-pick-list">
        {quickEntries.map((entry) => {
          const { row } = entry;
          const { signal } = entry;
          const locked = selectionLockedNames.has(row.brawler);
          const image = brawlerImageFor(row);
          return (
            <button key={row.brawler} type="button" className={`quick-pick-row ${locked ? "is-locked" : ""}`} disabled={locked} onClick={() => selectQuickBrawler(row.brawler)}>
              <span className="quick-pick-rank">{quickQuery.trim() ? "→" : String(entry.rank).padStart(2, "0")}</span>
              <span className="quick-pick-avatar" style={image ? { backgroundImage: `url(${image})` } : undefined}>{!image && row.brawler.slice(0, 2).toUpperCase()}</span>
              <span className="quick-pick-copy"><strong>{row.brawler}{locked && <em> BLOQUEADO</em>}</strong><small>{signal.decisionType.toUpperCase()} · {signal.position === "mid" ? "MID" : signal.position === "left" ? "SIDE ESQ." : "SIDE DIR."}</small></span>
              <span className="quick-pick-score">{Math.round(entry.finalPoints)}<small>PTS</small></span>
            </button>
          );
        })}
        {quickEntries.length === 0 && <div className="quick-pick-empty"><Search size={16} /><span>Nenhum brawler encontrado neste mapa.</span></div>}
      </div>
      {!quickQuery && <button type="button" className="quick-pick-more" onClick={() => document.getElementById("ranked-picks")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Ver lista completa de recomendações →</button>}
    </aside>
  );
}

type DraftRuleField = {
  key: keyof DraftRulePreference;
  label: string;
  helper?: string;
  /**
   * Preenchido quando o motor deixou de aplicar esta regra. O campo continua a
   * existir na configuração, mas aparece desligado e com a razão à vista — um
   * campo editável que não muda nada é pior do que um campo que não existe.
   */
  inactive?: string;
};

const draftRuleSections: Array<{ title: string; description: string; fields: DraftRuleField[] }> = [
  {
    title: "Sinergia por Pick",
    description: "Cada Pick global tem uma percentagem própria. A mesma taxa vale para sinergia literal e composição Brawl Planet do mapa.",
    fields: [
      { key: "synergyPick1", label: "Pick 1" }, { key: "synergyPick2", label: "Pick 2" }, { key: "synergyPick3", label: "Pick 3" },
      { key: "synergyPick4", label: "Pick 4" }, { key: "synergyPick5", label: "Pick 5" }, { key: "synergyPick6", label: "Pick 6" },
    ],
  },
  {
    title: "Counter banido",
    description: "Percentagem por counter direto removido em cada posição do Draft.",
    fields: [
      { key: "banPick1", label: "Pick 1", helper: "O banido tem de ser counter literal do candidato E estar no Top 25 do mapa." }, { key: "banPick2", label: "Pick 2" }, { key: "banPick3", label: "Pick 3" },
      { key: "banPick4", label: "Pick 4" }, { key: "banPick5Plus", label: "Pick 5+" },
    ],
  },
  {
    title: "Fit e abertura",
    description: "Cobertura de função e alcance elegível nos três primeiros Picks.",
    fields: [
      { key: "missingMid", label: "Mid em falta", helper: "Aplica-se desde o primeiro pick. Com a equipa vazia vale como Fit de abertura, escalado pela prioridade da função no modo (100% / 72% / 48%); com aliados já escolhidos, só quando falta mesmo o Mid." }, { key: "missingSide", label: "Lane em falta", helper: "Aplica-se desde o primeiro pick, como Fit de abertura escalado pela prioridade da função no modo; depois, só com menos de duas lanes preenchidas." }, { key: "openingLongRange", label: "Alcance de abertura", helper: "Apenas nos picks 1 a 3, e só para brawlers com alcance ≥ 6 blocos." },
    ],
  },
  {
    title: "Desbónus",
    description: "As penalizações cumulativas mantêm as mesmas condições competitivas; apenas a intensidade muda.",
    fields: [
      {
        key: "enemyCounterPenalty",
        label: "Enemy Counter direto",
        // Um campo que aceita um valor e não faz nada é pior do que não existir.
        inactive: "O confronto desfavorável já desconta pontos pelo delta publicado, com sinal negativo. Somar aqui outra penalização contava o mesmo matchup duas vezes — usa o ajuste do Counter por Pick para lhe dar mais ou menos peso.",
      },
      { key: "repeatedEnemyCounterPressure", label: "Pressão por aliado", helper: "Quando um inimigo já escolhido countera um aliado teu além do candidato." },
      {
        key: "topCounterPenalty",
        label: "Counter no Top",
        inactive: "Counter no Top é risco possível, não confronto real: penalizá-lo antes de haver picks inimigos reordenava o ranking base. Continua visível na auditoria, sem mexer no Score.",
      },
      { key: "sameClassPenalty", label: "Mesma classe", helper: "Por cada aliado já escolhido da mesma classe oficial do candidato." },
      { key: "worstTeammatePenalty", label: "Worst Teammate", helper: "Quando a fonte publica o aliado escolhido como mau parceiro deste brawler." },
    ],
  },
];

function DraftRulesPanel({ preference, hasCustomRules, onChange, onReset, reading, onReadingChange, liveCoverage, liveCapturedAt }: {
  preference: DraftRulePreference;
  hasCustomRules: boolean;
  onChange: (next: DraftRulePreference) => void;
  onReset: () => void;
  reading: BrawlScopeReadingId;
  onReadingChange: (next: BrawlScopeReadingId) => void;
  liveCoverage?: Record<string, { profiles: number; pairs: number }>;
  liveCapturedAt?: string | null;
}) {
  /**
   * Cobertura por modo, juntando as duas origens.
   *
   * O catálogo do repositório é o arranque a frio; a recolha em direto é o que
   * manda assim que existe. Antes só se contava o catálogo, e o painel chegava a
   * dizer "ainda não há tabelas por modo recolhidas" mesmo por baixo da linha
   * que anunciava milhares de pares recolhidos em direto — duas frases
   * verdadeiras cada uma por si e contraditórias lado a lado.
   */
  const modeCoverage: Record<string, number> = brawlScopeModeCoverage();
  const coberturaPorModo = new Map(Object.entries(modeCoverage).map(([mode, total]) => [mode, { perfis: total, live: false }]));
  for (const [view, dados] of Object.entries(liveCoverage ?? {})) {
    if (view === "overall") continue;
    const atual = coberturaPorModo.get(view);
    // A leitura em direto substitui a do repositório para essa vista.
    if (!atual || dados.profiles >= atual.perfis) coberturaPorModo.set(view, { perfis: dados.profiles, live: true });
  }
  const modesComDados = Array.from(coberturaPorModo.entries()).filter(([, dados]) => dados.perfis > 0);
  /**
   * Mostrar "4 fichas" sem o total faz uma cobertura de 4% parecer sucesso. Com
   * o denominador à vista percebe-se de imediato que quase todos os pares vão
   * continuar a ler a tabela geral.
   */
  const totalBrawlers = Object.keys(brawlScopeMatchupDeltas).length;
  const [expanded, setExpanded] = useState(false);
  const setRate = (key: keyof DraftRulePreference, rawValue: string) => {
    const value = Number(rawValue);
    onChange({ ...preference, [key]: Number.isFinite(value) ? value : 0 });
  };

  return (
    <section className={`draft-rules-panel ${expanded ? "is-expanded" : ""}`} aria-label="Configurações das regras percentuais do Draft">
      <div className="draft-rules-panel-head">
        <div><div className="section-kicker">Draft lab <span>REGRAS %</span></div><strong>{hasCustomRules ? "Regras personalizadas ativas" : "Regras competitivas padrão"}</strong><p>Define qualquer valor entre 0% e 100%. As sugestões, duelos e comparação de equipa recalculam imediatamente neste navegador.</p></div>
        <button type="button" className="draft-rules-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}><Settings2 size={16} /> {expanded ? "Fechar regras" : "Configurar regras"}</button>
      </div>
      {expanded && <div className="draft-rules-body">
        <p>Counter Pick: delta BrawlScope + 2% por confirmação na mesma direção de PL Prodigy e Brawl Planet. Valores negativos recebem −2% por confirmação.</p>
        <fieldset className="draft-rules-section counter-reading">
          <legend>Leitura dos matchups</legend>
          <p>O BrawlScope publica a mesma tabela numa vista geral e em seis vistas por modo. Escolhe qual delas alimenta o Counter por Pick.</p>
          <div className="counter-multiplier-options" role="group" aria-label="Leitura dos matchups BrawlScope">
            {brawlScopeReadings.map((option) => (
              <button
                type="button"
                key={option.id}
                className={reading === option.id ? "is-active" : ""}
                aria-pressed={reading === option.id}
                title={option.hint}
                onClick={() => onReadingChange(option.id)}
              >{option.label}</button>
            ))}
          </div>
          {liveCapturedAt && liveCoverage && Object.keys(liveCoverage).length ? (
            <small className="counter-reading-live"><span className="tiny-live" /> Em direto: {Object.entries(liveCoverage).map((entry) => `${entry[0]} ${entry[1].pairs} pares`).join(" · ")} · recolhido {new Date(liveCapturedAt).toLocaleString("pt-PT")}</small>
          ) : (
            <small className="counter-reading-live is-idle">Sem recolha em direto ainda nesta sessão do servidor — a usar as tabelas do projeto.</small>
          )}
          <small>{reading === "byMode"
            ? modesComDados.length
              ? `Por modo: ${modesComDados.map(([mode, dados]) => `${mode} ${dados.perfis}/${totalBrawlers} fichas${dados.live ? " em direto" : ""}`).join(" · ")}. Os restantes pares usam a tabela geral — cada confronto indica de onde veio o valor.`
              : "Por modo escolhido, mas ainda não há tabelas por modo recolhidas — todos os pares usam o valor geral até a sincronização as trazer. A recolha lê uma vista por ciclo, por isso as seis podem demorar a aparecer num servidor acabado de arrancar."
            : "Geral: um único valor por confronto, somando todos os modos."}</small>
        </fieldset>
        <fieldset className="draft-rules-section counter-multiplier">
          <legend>Counter por Pick · ajuste separado</legend>
          <p>
            Multiplica a percentagem publicada do confronto antes de virar pontos, <strong>pick a pick</strong>.
            1× mantém o valor da fonte, 2× duplica, 3× triplica; abaixo de 1× reduz o peso do counter no Score.
            É útil porque um counter não vale o mesmo em todos os momentos: no pick 1 escolhe-se às cegas e o
            adversário tem cinco escolhas para responder; no pick 6 o counter é definitivo.
          </p>
          <div className="counter-pick-grid">
            {([1, 2, 3, 4, 5, 6] as const).map((pick) => {
              const key = `counterPickMultiplier${pick}` as keyof DraftRulePreference;
              const value = preference[key];
              return (
                <div className="counter-pick-row" key={pick}>
                  <span className="counter-pick-label">Pick {pick}</span>
                  <div className="counter-multiplier-options" role="group" aria-label={`Ajuste do Counter no pick ${pick}`}>
                    {counterPickMultiplierOptions.map((option) => (
                      <button
                        type="button"
                        key={option}
                        className={value === option ? "is-active" : ""}
                        aria-pressed={value === option}
                        onClick={() => onChange({ ...preference, [key]: option })}
                      >{option}×</button>
                    ))}
                  </div>
                  <span className="counter-pick-effect">+10% → {Number((10 * value).toFixed(2))}%</span>
                </div>
              );
            })}
          </div>
          <div className="counter-pick-presets">
            <span>Atalhos:</span>
            <button type="button" onClick={() => onChange({ ...preference, counterPickMultiplier1: 1, counterPickMultiplier2: 1, counterPickMultiplier3: 1, counterPickMultiplier4: 1, counterPickMultiplier5: 1, counterPickMultiplier6: 1 })}>
              Todos a 1×
            </button>
            <button
              type="button"
              title="Counter vale menos quando se escolhe às cegas e mais quando já ninguém pode responder."
              onClick={() => onChange({ ...preference, counterPickMultiplier1: 0.5, counterPickMultiplier2: 0.75, counterPickMultiplier3: 0.75, counterPickMultiplier4: 1, counterPickMultiplier5: 1.5, counterPickMultiplier6: 1.5 })}
            >
              Escada por posição
            </button>
          </div>
        </fieldset>
        {draftRuleSections.map((section) => <fieldset className="draft-rules-section" key={section.title}>
          <legend>{section.title}</legend><p>{section.description}</p>
          <div className="draft-rules-grid">{section.fields.map((field) => {
            const inactive = field.inactive;
            return (
              <label className={`draft-rule-input ${inactive ? "is-inactive" : ""}`} key={field.key} title={inactive}>
                <span>
                  {field.label}
                  {inactive ? <em className="rule-inactive-tag">não aplicado</em> : null}
                  {!inactive && field.helper ? <em className="rule-when" title={field.helper}>quando?</em> : null}
                </span>
                <div>
                  <input
                    type="number" min="0" max="100" step="0.5" inputMode="decimal"
                    value={preference[field.key]}
                    disabled={Boolean(inactive)}
                    onChange={(event) => setRate(field.key, event.currentTarget.value)}
                  /><em>%</em>
                </div>
                {inactive
                  ? <small className="rule-inactive-note">{inactive}</small>
                  : field.helper ? <small className="rule-helper-note">{field.helper}</small> : null}
              </label>
            );
          })}</div>
        </fieldset>)}
        <div className="draft-rules-actions"><span>{hasCustomRules ? "A configuração é guardada localmente neste navegador." : "Estão ativos os valores competitivos recomendados."}</span><button type="button" onClick={onReset} disabled={!hasCustomRules}><RotateCcw size={15} /> Restaurar padrão</button></div>
      </div>}
    </section>
  );
}

export default function Draft() {
  const [showPickDetails, setShowPickDetails] = useState(false);
  const [rankingOrder, setRankingOrder] = useState<"base" | "context">("base");
  const roleVersion = useDraftRolesVersion();
  const { version: counterSnapshotVersion } = useCounterSync();
  const trpcUtils = trpc.useUtils();
  const rankedSync = useRankedSync();
  const statusQuery = trpc.rankedSync.status.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: true });
  const counterStatusQuery = trpc.counterSync.status.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: true });
  /**
   * Fontes que responderam com bloqueio. Se o BrawlScope ou o Brawl Planet
   * pararem de responder, o site continua a funcionar com o catálogo do
   * repositório — mas quem está a draftar tem de saber que os números não são
   * de agora, em vez de descobrir isso tarde.
   */
  const blockedSources = useMemo(() => {
    const health = (counterStatusQuery.data as { sourceHealth?: Record<string, { blocked?: boolean }> } | undefined)?.sourceHealth ?? {};
    return Object.entries(health).filter(([, estado]) => estado?.blocked).map(([host]) => host);
  }, [counterStatusQuery.data]);
  const eventsQuery = trpc.brawlApi.events.useQuery(undefined, { refetchInterval: 120_000, staleTime: 60_000 });
  const observedStatusQuery = trpc.observedMatches.status.useQuery(undefined, { refetchInterval: 60_000, staleTime: 30_000 });
  /**
   * O botão de atualizar vive num hook partilhado (`useSyncRefresh`).
   *
   * Estava duplicado em três páginas, e foi essa duplicação que deixou o
   * Início e os Brawlers a ler um resultado que o servidor já não devolve.
   * Uma cópia só: arranca o trabalho, segue o progresso, e tem um teto que
   * impede o botão de ficar preso.
   */
  const { isRefreshing, progress: syncProgress, start: startRefresh, processHealth } = useSyncRefresh();
  const { weights: hybridWeights } = useHybridWeights();
  const { topBrawlWeight } = useSourceBalance();
  const { reading: brawlScopeReading, setReading: setBrawlScopeReadingPreference } = useBrawlScopeReading();
  const { preference: draftRulePreference, rules: draftRuleSettings, hasCustomRules, updatePreference: updateDraftRulePreference, resetPreference: resetDraftRulePreference } = useDraftRules();
  const winRateWeight = hybridWeights.winRate / 100;
  const experimentalWeights = useMemo<ExperimentalWeights>(() => ({
    winRate: hybridWeights.winRate,
    usageRate: hybridWeights.usageRate,
  }), [hybridWeights]);
  const hasCustomGlobalWeights = hybridWeights.winRate !== 70;

  const liveRows = useMemo(() => normalizeRankedRows(rankedSync.snapshot?.rows ?? allRankedRows, winRateWeight, topBrawlWeight), [winRateWeight, topBrawlWeight, rankedSync.snapshot?.rows]);
  const liveMaps = useMemo(
    () => buildActiveRankedMapCatalog(rankedSync.snapshot?.maps, liveRows, allMapSummaries, winRateWeight, topBrawlWeight),
    [winRateWeight, topBrawlWeight, rankedSync.snapshot?.maps, liveRows],
  );
  const [selectedMapName, setSelectedMapName] = useState("Beach Ball");
  const selectedMap = resolveRankedMapSelection(liveMaps, selectedMapName);
  const [scrimPreset, setScrimPreset] = useState<ScrimPreset>("standard");
  const [initialTeam, setInitialTeam] = useState<TeamId>("blue");
  const [customSteps, setCustomSteps] = useState<DraftStep[]>(() => draftSteps.map((step) => ({ ...step })));
  const draftSequence = useMemo(() => scrimPreset === "custom" ? normalizeScrimSequence(customSteps) : buildScrimSequence(scrimPreset, initialTeam), [scrimPreset, initialTeam, customSteps]);
  const [choices, setChoices] = useState<(string | null)[]>(() => Array(draftSequence.length).fill(null));
  const [analysisChoices, setAnalysisChoices] = useState<(string | null)[]>(() => Array(draftSequence.length).fill(null));
  const [skipped, setSkipped] = useState<boolean[]>(() => Array(draftSequence.length).fill(false));
  const [analysisSkipped, setAnalysisSkipped] = useState<boolean[]>(() => Array(draftSequence.length).fill(false));
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [analysisSelectedStepIndex, setAnalysisSelectedStepIndex] = useState<number | null>(null);
  const [myTeam, setMyTeam] = useState<TeamId>("blue");
  const [query, setQuery] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceCaptureState>("idle");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [roleFilter, setRoleFilter] = useState<DraftRoleFilter>("Todas");
  const [rosterPage, setRosterPage] = useState(1);
  const analysisRefreshFrameRef = useRef<number | null>(null);

  const currentRows = useMemo(() => liveRows.filter((row) => row.map === selectedMap?.name), [liveRows, selectedMap?.name, roleVersion]);
  // Matrizes completas vindas da sincronização: a geral e, na leitura por modo, a do mapa ativo.
  const liveMatchups = useBrawlScopeLiveMatchups(
    brawlScopeReading === "byMode" && selectedMap?.modeId ? [selectedMap.modeId] : [],
    counterSnapshotVersion,
  );
  const mapTeams = useMemo(() => (rankedSync.snapshot?.mapTeams ?? []).filter((team) => team.map === selectedMap?.name), [rankedSync.snapshot?.mapTeams, selectedMap?.name]);
  const rosterNames = useMemo(() => currentRows.map((row) => row.brawler), [currentRows]);
  const firstPendingStepIndex = choices.findIndex((choice, index) => choice === null && !skipped[index]);
  const activeStepIndex = selectedStepIndex !== null && choices[selectedStepIndex] === null && !skipped[selectedStepIndex]
    ? selectedStepIndex
    : firstPendingStepIndex === -1 ? null : firstPendingStepIndex;
  const activeDraftStep = activeStepIndex === null ? null : draftSequence[activeStepIndex];
  const activeGlobalPickNumber = getGlobalPickNumber(draftSequence, activeStepIndex);
  const analysisFirstPendingStepIndex = analysisChoices.findIndex((choice, index) => choice === null && !analysisSkipped[index]);
  const analysisActiveStepIndex = analysisSelectedStepIndex !== null && analysisChoices[analysisSelectedStepIndex] === null && !analysisSkipped[analysisSelectedStepIndex]
    ? analysisSelectedStepIndex
    : analysisFirstPendingStepIndex === -1 ? null : analysisFirstPendingStepIndex;
  const analysisDraftStep = analysisActiveStepIndex === null ? null : draftSequence[analysisActiveStepIndex];
  const analysisGlobalPickNumber = getGlobalPickNumber(draftSequence, analysisActiveStepIndex);
  const analysisCompletedPickCount = useMemo(
    () => draftSequence.reduce((count, step, index) => count + (step.kind === "pick" && Boolean(analysisChoices[index]) ? 1 : 0), 0),
    [analysisChoices, draftSequence],
  );
  const banNames = useMemo(() => new Set(draftSequence.map((step, index) => step.kind === "ban" ? analysisChoices[index] : null).filter(Boolean) as string[]), [analysisChoices, draftSequence]);
  const pickNames = useMemo(() => new Set(draftSequence.map((step, index) => step.kind === "pick" ? analysisChoices[index] : null).filter(Boolean) as string[]), [analysisChoices, draftSequence]);
  // Ranked rule: any resolved ban or pick locks the brawler for the rest of the sequence.
  const lockedNames = useMemo(() => getDraftLockedNames(draftSequence, choices, activeStepIndex), [draftSequence, choices, activeStepIndex]);
  const analysisLockedNames = useMemo(() => getDraftLockedNames(draftSequence, analysisChoices, analysisActiveStepIndex), [analysisChoices, draftSequence, analysisActiveStepIndex]);
  const bluePickNames = useMemo(() => new Set(draftSequence.map((step, index) => step.team === "blue" && step.kind === "pick" ? analysisChoices[index] : null).filter(Boolean) as string[]), [draftSequence, analysisChoices]);
  const redPickNames = useMemo(() => new Set(draftSequence.map((step, index) => step.team === "red" && step.kind === "pick" ? analysisChoices[index] : null).filter(Boolean) as string[]), [draftSequence, analysisChoices]);
  const bluePicks = useMemo(() => currentRows.filter((row) => bluePickNames.has(row.brawler)), [currentRows, bluePickNames]);
  const redPicks = useMemo(() => currentRows.filter((row) => redPickNames.has(row.brawler)), [currentRows, redPickNames]);
  const baseHybridTop25Names = useMemo(() => currentRows
    .map((row) => ({ brawler: row.brawler, hybridScore: calculateDraftHybridScore(row, experimentalWeights) }))
    .sort((a, b) => b.hybridScore - a.hybridScore || a.brawler.localeCompare(b.brawler))
    .slice(0, 25)
    .map((entry) => entry.brawler), [currentRows, experimentalWeights]);
  const baseHybridTop30Names = useMemo(() => currentRows
    .map((row) => ({ brawler: row.brawler, hybridScore: calculateDraftHybridScore(row, experimentalWeights) }))
    .sort((a, b) => b.hybridScore - a.hybridScore || a.brawler.localeCompare(b.brawler))
    .slice(0, 30)
    .map((entry) => entry.brawler), [currentRows, experimentalWeights]);
  const myPicks = myTeam === "red" ? redPicks : bluePicks;
  const myPickNames = useMemo(() => myPicks.map((row) => row.brawler), [myPicks]);
  const opponentPicks = myTeam === "red" ? bluePicks : redPicks;
  const suggestionTeam = analysisDraftStep?.team ?? myTeam;
  const activeTeamPicks = suggestionTeam === "red" ? redPicks : bluePicks;
  const enemyPicks = suggestionTeam === "red" ? bluePicks : redPicks;
  const baseRoleContext = useMemo(() => ({ mapModeId: selectedMap?.modeId, mapTeams, mapName: selectedMap?.name, popularityRows: currentRows, allyRows: activeTeamPicks, enemyRows: enemyPicks, bannedNames: banNames, baseHybridTop25Names, baseHybridTop30Names, pickNumber: analysisGlobalPickNumber, completedPickCount: analysisCompletedPickCount, experimentalWeights, ruleSettings: draftRuleSettings, counterSnapshotVersion, brawlScopeReading, liveMatchupsVersion: liveMatchups.version }), [selectedMap?.modeId, selectedMap?.name, mapTeams, currentRows, activeTeamPicks, enemyPicks, banNames, baseHybridTop25Names, baseHybridTop30Names, analysisGlobalPickNumber, analysisCompletedPickCount, experimentalWeights, draftRuleSettings, counterSnapshotVersion, brawlScopeReading, liveMatchups.version]);
  const counterWindow = useMemo(() => getDraftCounterWindow(currentRows, analysisLockedNames, "", baseRoleContext), [currentRows, analysisLockedNames, baseRoleContext]);
  const topRecommendationNames = counterWindow.topRecommendationNames;
  const activeCounterWindow = useMemo(() => topRecommendationNames.slice(0, Math.max(0, 20 - (analysisCompletedPickCount * 4))), [topRecommendationNames, analysisCompletedPickCount]);
  const roleContext = useMemo(() => ({ ...baseRoleContext, topRecommendationNames, counterPenaltyEligibleNames: counterWindow.counterPenaltyEligibleNames }), [baseRoleContext, topRecommendationNames, counterWindow.counterPenaltyEligibleNames]);
  const sameClassAlerts = useMemo(() => {
    const picksByClass = new Map<string, string[]>();
    activeTeamPicks.forEach((row) => {
      const className = getBrawlerClass(row.brawler);
      picksByClass.set(className, [...(picksByClass.get(className) ?? []), row.brawler]);
    });
    return Array.from(picksByClass.entries()).map(([className, triggers]) => ({
      className,
      triggers,
      candidateCount: currentRows.filter((row) => !analysisLockedNames.has(row.brawler) && getBrawlerClass(row.brawler) === className).length,
    })).filter((alert) => alert.candidateCount > 0);
  }, [activeTeamPicks, currentRows, analysisLockedNames]);
  const coachAnalysis = useMemo(() => analyzeDraftComposition(myPicks, opponentPicks, selectedMap?.modeId), [myPicks, opponentPicks, selectedMap?.modeId, counterSnapshotVersion]);
  const rankedDraftEntries = useMemo(() => rankDraftEntries(currentRows, analysisLockedNames, "", "Todos", roleContext), [currentRows, analysisLockedNames, roleContext]);
  const orderedDraftEntries = useMemo(() => orderDraftEntries(rankedDraftEntries, rankingOrder), [rankedDraftEntries, rankingOrder]);
  const availableHybridReference = useMemo(
    () => getDraftMaximumHybridScore(currentRows.filter((row) => !analysisLockedNames.has(row.brawler)), experimentalWeights),
    [currentRows, analysisLockedNames, experimentalWeights],
  );
  const mapHybridReference = useMemo(
    () => getDraftMaximumHybridScore(currentRows, experimentalWeights),
    [currentRows, experimentalWeights],
  );
  const visibleRankedEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return orderedDraftEntries.filter((entry) => {
      const matchesQuery = !normalizedQuery || entry.row.brawler.toLowerCase().includes(normalizedQuery);
      const candidateRole = inferDraftRole(entry.row.brawler);
      const matchesRole = roleFilter === "Todas" || candidateRole === roleFilter || candidateRole === "flex";
      return matchesQuery && matchesRole;
    });
  }, [query, orderedDraftEntries, roleFilter]);
  const visibleRows = useMemo(() => visibleRankedEntries.map((entry) => entry.row), [visibleRankedEntries]);
  const draftScoreReference = useMemo(() => rankedDraftEntries.slice(0, 5).map((entry) => ({
    ...entry,
    openingBonusActive: entry.signal.scoreBreakdown.openingLongRangePoints > 0,
  })), [rankedDraftEntries]);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(visibleRankedEntries.length / pageSize));
  const globalTopEntry = rankedDraftEntries[0];
  const pagedRankedEntries = useMemo(() => visibleRankedEntries.slice((rosterPage - 1) * pageSize, rosterPage * pageSize), [visibleRankedEntries, rosterPage]);
  const topRows = useMemo(() => pagedRankedEntries.map((entry) => entry.row), [pagedRankedEntries]);
  const synergyRows = visibleRows;
  const counterRows = visibleRows;
  const synergyRate = getSynergyBonusRate(analysisGlobalPickNumber, draftRuleSettings) * 100;
  const counterRate = getCounterBonusRate(analysisGlobalPickNumber, draftRuleSettings) * 100;
  const synergyReason = activeTeamPicks.length ? `Sinergia contextual: completa a composição atual; vale ${synergyRate}% do Score de Draft no pick global ${analysisGlobalPickNumber}.` : `Sinergia contextual: no pick global ${analysisGlobalPickNumber ?? 1}, vale ${synergyRate}% quando a relação literal for ativada.`;
  const counterReason = enemyPicks.length ? `Counter contextual: +${counterRate}% por matchup direto literal no pick global ${analysisGlobalPickNumber}.` : "Sem pick inimigo, ainda não há bónus Counter ativo; o Score Híbrido mantém-se como base.";
  const liveCounterSuggestions = useMemo(() => getLiveCounterSuggestions(opponentPicks.map((row) => row.brawler), currentRows.filter((row) => !analysisLockedNames.has(row.brawler))), [opponentPicks, currentRows, analysisLockedNames, counterSnapshotVersion]);
  const canAutoPick = activeDraftStep?.team === myTeam && activeDraftStep.kind === "pick";
  const hybridAverage = currentRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / Math.max(1, currentRows.length);
  const resolvedCount = choices.filter(Boolean).length + skipped.filter(Boolean).length;
  const analysisResolvedCount = analysisChoices.filter(Boolean).length + analysisSkipped.filter(Boolean).length;
  const statusLabel = rankedSync.source === "sse" && rankedSync.syncState === "success" ? "LIVE SNAPSHOT · SSE" : rankedSync.syncState === "partial" ? "SNAPSHOT PARCIAL · SSE" : "LOCAL SNAPSHOT";
  const observedLabel = observedStatusQuery.data?.coverage.pairSamples
    ? `${observedStatusQuery.data.coverage.pairSamples} pares observados`
    : "A aguardar amostra";

  useEffect(() => { setRosterPage((page) => Math.min(page, pageCount)); }, [pageCount]);
  // A paginação nunca pode preservar uma página antiga depois de picks, bans ou
  // sinais contextuais mudarem o ranking global final.
  useEffect(() => { setRosterPage(1); }, [rankedDraftEntries, query, roleFilter, rankingOrder]);
  useEffect(() => () => { recognitionRef.current?.abort(); }, []);
  useEffect(() => () => {
    if (analysisRefreshFrameRef.current !== null) cancelAnimationFrame(analysisRefreshFrameRef.current);
  }, []);
  useEffect(() => {
    if (!selectedMap || selectedMap.name === selectedMapName) return;
    setSelectedMapName(selectedMap.name);
    setChoices(Array(draftSequence.length).fill(null));
    setAnalysisChoices(Array(draftSequence.length).fill(null));
    setSkipped(Array(draftSequence.length).fill(false));
    setAnalysisSkipped(Array(draftSequence.length).fill(false));
    setSelectedStepIndex(null);
    setAnalysisSelectedStepIndex(null);
    setQuery("");
  }, [draftSequence.length, selectedMap, selectedMapName]);

  const resetChoices = (nextSequence = draftSequence) => {
    const nextChoices = Array<string | null>(nextSequence.length).fill(null);
    const nextSkipped = Array<boolean>(nextSequence.length).fill(false);
    setRosterPage(1);
    setChoices(nextChoices);
    setSkipped(nextSkipped);
    setSelectedStepIndex(null);
    startTransition(() => {
      setAnalysisChoices(nextChoices);
      setAnalysisSkipped(nextSkipped);
      setAnalysisSelectedStepIndex(null);
    });
  };
  const handlePresetChange = (nextPreset: ScrimPreset) => { const nextSequence = nextPreset === "custom" ? normalizeScrimSequence(customSteps) : buildScrimSequence(nextPreset, initialTeam); setScrimPreset(nextPreset); resetChoices(nextSequence); toast.success(`Scrim: ${scrimPresetLabels[nextPreset]}.`); };
  const handleInitialTeamChange = (nextTeam: TeamId) => {
    if (nextTeam === initialTeam) return;
    const nextCustom = customSteps.map((step) => ({ ...step, team: step.team === initialTeam ? nextTeam : step.team === nextTeam ? initialTeam : step.team }));
    const nextSequence = scrimPreset === "custom" ? normalizeScrimSequence(nextCustom) : buildScrimSequence(scrimPreset, nextTeam);
    const remappedProgress = remapDraftProgress(draftSequence, nextSequence, choices, skipped, selectedStepIndex);

    setRosterPage(1);
    setInitialTeam(nextTeam);
    setCustomSteps(nextCustom);
    setChoices(remappedProgress.choices);
    setSkipped(remappedProgress.skipped);
    setSelectedStepIndex(remappedProgress.selectedStepIndex);
    startTransition(() => {
      setAnalysisChoices(remappedProgress.choices);
      setAnalysisSkipped(remappedProgress.skipped);
      setAnalysisSelectedStepIndex(remappedProgress.selectedStepIndex);
    });
    toast.success(`Lado inicial: equipa ${nextTeam === "blue" ? "Azul" : "Vermelha"}.`, { description: "Bans, picks e passos ignorados foram preservados." });
  };
  const handleCustomStepsChange = (nextSteps: DraftStep[]) => { const nextSequence = normalizeScrimSequence(nextSteps); setCustomSteps(nextSteps); resetChoices(nextSequence); };

  const scheduleContextualAnalysis = useCallback((nextChoices: (string | null)[], nextSkipped: boolean[], nextSelectedStepIndex: number | null) => {
    if (analysisRefreshFrameRef.current !== null) cancelAnimationFrame(analysisRefreshFrameRef.current);
    analysisRefreshFrameRef.current = requestAnimationFrame(() => {
      analysisRefreshFrameRef.current = null;
      startTransition(() => {
        setAnalysisChoices(nextChoices);
        setAnalysisSkipped(nextSkipped);
        setAnalysisSelectedStepIndex(nextSelectedStepIndex);
      });
    });
  }, []);

  const interactiveDraftStateRef = useRef({ choices, skipped, activeStepIndex, lockedNames });
  interactiveDraftStateRef.current = { choices, skipped, activeStepIndex, lockedNames };
  const assignBrawler = useCallback((name: string) => {
    const { choices: currentChoices, skipped: currentSkipped, activeStepIndex: currentActiveStepIndex, lockedNames: currentLockedNames } = interactiveDraftStateRef.current;
    if (currentActiveStepIndex === null) { toast.info("O draft está completo ou os passos restantes foram ignorados."); return; }
    if (currentLockedNames.has(name)) { toast.info(`${name} já está bloqueado neste draft.`); return; }
    const nextChoices = currentChoices.map((choice, index) => index === currentActiveStepIndex ? name : choice);
    setRosterPage(1);
    setChoices(nextChoices);
    setSelectedStepIndex(null);
    scheduleContextualAnalysis(nextChoices, currentSkipped, null);
  }, [scheduleContextualAnalysis]);
  const startVoiceFill = () => {
    if (activeStepIndex === null || !activeDraftStep) {
      toast.info("Seleciona primeiro um slot de Ban ou Pick para usar o microfone.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Reconhecimento de voz indisponível neste navegador.", { description: "Usa Chrome no telemóvel ou computador para falar o nome do brawler." });
      return;
    }
    recognitionRef.current?.abort();
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "pt-PT";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setVoiceState("listening");
    recognition.onresult = (event) => {
      setVoiceState("processing");
      const result = event.results[event.results.length - 1];
      const transcript = result?.[0]?.transcript?.trim() ?? "";
      const resolution = resolveSpokenBrawler(transcript, rosterNames);
      if (resolution.status === "matched") {
        setQuery("");
        assignBrawler(resolution.brawler);
        toast.success(`${resolution.brawler} preenchido por voz.`, { description: `${activeDraftStep.kind === "ban" ? "Ban" : "Pick"} aplicado automaticamente.` });
      } else if (resolution.status === "ambiguous") {
        setQuery(transcript);
        toast.info("Encontrei mais de um brawler. Diga o nome completo.", { description: resolution.candidates.join(" · ") });
      } else {
        setQuery(transcript);
        toast.error("Não reconheci um brawler nesse áudio.", { description: "Tente dizer apenas o nome completo, por exemplo: Chester." });
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        toast.error("Permissão do microfone recusada.", { description: "Autorize o microfone nas definições do navegador e tente novamente." });
      } else if (event.error !== "aborted") {
        toast.error("Não foi possível ouvir o brawler.", { description: "Verifica o microfone e tenta novamente." });
      }
    };
    recognition.onend = () => { recognitionRef.current = null; setVoiceState("idle"); };
    try {
      recognition.start();
    } catch {
      setVoiceState("idle");
      toast.info("O microfone já está a iniciar. Aguarda um instante e tenta novamente.");
    }
  };
  const skipActiveStep = () => {
    if (activeStepIndex === null) { toast.info("Não há passo ativo para ignorar."); return; }
    const nextSkipped = skipped.map((value, index) => index === activeStepIndex ? true : value);
    setRosterPage(1);
    setSkipped(nextSkipped);
    setSelectedStepIndex(null);
    scheduleContextualAnalysis(choices, nextSkipped, null);
    toast.info(`${activeDraftStep?.kind === "ban" ? "Ban" : "Pick"} ignorado — passo livre.`);
  };
  const clearSlot = (index: number) => {
    const nextChoices = choices.map((choice, slotIndex) => slotIndex === index ? null : choice);
    const nextSkipped = skipped.map((value, slotIndex) => slotIndex === index ? false : value);
    setRosterPage(1);
    setChoices(nextChoices);
    setSkipped(nextSkipped);
    setSelectedStepIndex(index);
    scheduleContextualAnalysis(nextChoices, nextSkipped, index);
  };
  const clearSkippedSlot = (index: number) => {
    const nextSkipped = skipped.map((value, slotIndex) => slotIndex === index ? false : value);
    setRosterPage(1);
    setSkipped(nextSkipped);
    setSelectedStepIndex(index);
    scheduleContextualAnalysis(choices, nextSkipped, index);
  };
  const resetDraft = () => { resetChoices(); toast.success("Draft limpo."); };
  const changeMap = (name: string) => { setSelectedMapName(name); resetDraft(); setQuery(""); };
  /**
   * Cada radar ordena pelo sinal que anuncia, e não pelo Score final. Sem isto
   * os dois mostravam a mesma lista — o Score final é dominado pela base
   * híbrida, por isso a ordem era idêntica nos dois painéis.
   */
  const synergyRadarEntries = useMemo(
    () => rankedDraftEntries
      .map((entry) => ({ ...entry, signalValue: entry.signal.scoreBreakdown.synergyPoints }))
      .filter((entry) => entry.signalValue > 0)
      .sort((left, right) => right.signalValue - left.signalValue),
    [rankedDraftEntries],
  );
  const counterRadarEntries = useMemo(
    () => rankedDraftEntries
      .map((entry) => ({ ...entry, signalValue: entry.signal.scoreBreakdown.counterPoints }))
      .filter((entry) => entry.signalValue > 0)
      .sort((left, right) => right.signalValue - left.signalValue),
    [rankedDraftEntries],
  );

  const handleRefresh = startRefresh;
  const simulateBestCounter = () => {
    const best = liveCounterSuggestions[0];
    if (!best) { toast.info("Ainda não existe um counter direto para simular."); return; }
    if (!canAutoPick) { toast.info("A simulação aguarda o teu próximo turno de pick."); return; }
    assignBrawler(best.recommendedBrawler);
    toast.success(`Resposta simulada: ${best.recommendedBrawler}`, { description: `Counter a ${best.enemyBrawler} · ${best.position.toUpperCase()}` });
  };

  return (
    <div className="app-shell draft-shell" style={{ backgroundImage: `linear-gradient(rgba(11,14,20,.94), rgba(11,14,20,.98)), url(${TEXTURE_URL})` }}>
      <DraftSidebar active="draft" />
      <div className="app-main">
        <DraftTopbar
          onReset={resetDraft}
          isRefreshing={isRefreshing}
          refreshProgress={syncProgress}
          onRefresh={handleRefresh}
          observedLabel={observedLabel}
          capturedAt={rankedSync.capturedAt}
          syncState={rankedSync.syncState}
          blockedSources={blockedSources}
        />
        <main className="draft-main">
          {/*
            * Antes havia aqui um hero de 310px com um título de 78px e um
            * parágrafo a explicar a fórmula. Num sítio de apresentação isso faz
            * sentido; na página onde se trabalha, é um imposto pago em cada
            * visita — empurrava o tabuleiro para fora do ecrã, sobretudo no
            * telemóvel. Ficou uma barra com aquilo que muda a cada turno.
            */}
          <section className="draft-contextbar" aria-label="Contexto do draft">
            <div className="draft-contextbar-main">
              <span className="draft-contextbar-kicker">Draft</span>
              <strong className="bh-display">{selectedMap?.name ?? "Sem mapa"}</strong>
              <span className="draft-contextbar-mode">{selectedMap?.mode ?? "Ranked"}</span>
            </div>
            <a className="duel-jump-link" href="#matchup-matrix">Comparar pontos % · Mid e Lanes</a>
            <div className="draft-contextbar-stats">
              <div className="draft-contextbar-stat">
                <span>Turno</span>
                <b className="bh-figure">{activeDraftStep ? activeDraftStep.label : "—"}</b>
              </div>
              <div className="draft-contextbar-stat">
                <span>Referência</span>
                <b className="bh-figure"><CountUp value={mapHybridReference} /></b>
              </div>
              <div className={`draft-contextbar-stat ${hasCustomGlobalWeights ? "is-custom" : ""}`}>
                <span>Vitória/Uso</span>
                <b>{experimentalWeights.winRate}/{experimentalWeights.usageRate}</b>
              </div>
            </div>
          </section>
          <div className="draft-content">
            <section className="draft-arena" aria-label="Simulador Azul versus Vermelha" style={{ backgroundImage: `linear-gradient(105deg, rgba(5,12,23,.96) 0%, rgba(9,17,31,.88) 47%, rgba(26,9,22,.9) 100%), url(${DRAFT_ARENA_BG_URL})` }}>
              <header className="draft-arena-header">
                <div>
                  <div className="section-kicker"><Swords size={13} /> Ranked Draft <span>AZUL VS VERMELHA</span></div>
                  <h2><span>Azul</span><em>vs</em><span>Vermelha</span></h2>
                  <p>O teu próximo movimento começa aqui.</p>
                </div>
                <div className="draft-arena-map-status"><span>{selectedMap?.mode ?? "RANKED"}</span><strong>{selectedMap?.name ?? "Mapa"}</strong><small>{currentRows.length} brawlers · {liveMaps.length} mapas ativos</small></div>
              </header>
              <div className="draft-action-zone">
              <div className="draft-board-column">
                <div className="draft-progress">
                  <div className="progress-copy">
                    <span className="section-kicker">Draft sequence · {scrimPresetLabels[scrimPreset]}</span>
                    <strong>{activeDraftStep ? describeDraftStep(activeDraftStep) : "Draft completo"}</strong>
                    <small>{activeDraftStep ? "Seleciona, ignora, passa o ban ou pesquisa um brawler." : "Todos os slots foram resolvidos."}</small>
                  </div>
                  <div className="progress-steps" aria-label="Progresso do draft">
                    {draftSequence.map((step, index) => <span key={index} className={`progress-step ${choices[index] || skipped[index] ? "is-done" : ""} ${skipped[index] ? "is-skipped" : ""} ${activeStepIndex === index ? "is-current" : ""}`} title={skipped[index] ? `${describeDraftStep(step)} · ignorado` : describeDraftStep(step)}><i /></span>)}
                  </div>
                  <div className="draft-progress-actions">
                    <div className="perspective-toggle-inline">
                      <button type="button" className={`perspective-btn ${myTeam === "blue" ? "is-active" : ""}`} onClick={() => setMyTeam("blue")}>Perspetiva: Azul</button>
                      <button type="button" className={`perspective-btn ${myTeam === "red" ? "is-active" : ""}`} onClick={() => setMyTeam("red")}>Perspetiva: Vermelha</button>
                    </div>
                    <button type="button" className={`draft-voice-button draft-progress-voice ${voiceState === "listening" ? "is-listening" : ""}`} onClick={startVoiceFill} disabled={activeStepIndex === null} aria-label={voiceState === "listening" ? "A ouvir nome do brawler" : "Falar o nome do brawler para o slot ativo"} title="Falar o nome do brawler para preencher o slot ativo"><Mic size={16} /><span>{voiceState === "listening" ? "A ouvir…" : voiceState === "processing" ? "A preencher…" : "Falar brawler"}</span></button>
                    <button type="button" className="draft-skip-button" onClick={skipActiveStep} disabled={activeStepIndex === null}><SkipForward size={14} /> {activeDraftStep?.kind === "ban" ? "Passar ban" : "Pular passo"}</button>
                    <span className="progress-count">{resolvedCount}/{draftSequence.length}</span>
                  </div>
                </div>
                  <div className="draft-board-grid">{([myTeam, myTeam === "blue" ? "red" : "blue"] as TeamId[]).map((team, index) => <Fragment key={team}>{index === 1 && <DraftProbabilityCenter blueRows={bluePicks} redRows={redPicks} activeStepIndex={analysisActiveStepIndex} mapName={selectedMap?.name} modeId={selectedMap?.modeId} />}<TeamBoard team={team} myTeam={myTeam} steps={draftSequence} choices={choices} skipped={skipped} rows={currentRows} mapTeams={mapTeams} activeStep={activeStepIndex} onClear={clearSlot} onClearSkip={clearSkippedSlot} onActivate={setSelectedStepIndex} /></Fragment>)}</div>
              </div>
              </div>
              <div className="draft-arena-controls">
                <section className="draft-arena-map-control">
                  <div className="section-kicker"><Layers3 size={12} /> Mapa Ranked <span>CONTEXTO</span></div>
                  <strong>Seleciona o mapa</strong>
                  <label className="draft-select"><Layers3 size={15} /><select aria-label="Selecionar mapa para o draft" value={selectedMap?.name ?? ""} onChange={(event) => changeMap(event.target.value)}>{liveMaps.map((map) => <option key={map.name} value={map.name}>{map.name} · {map.mode}</option>)}</select><ChevronDown size={14} /></label>
                  <small>{selectedMap?.mode ?? "Ranked"} · o Score e as sugestões acompanham esta rotação.</small>
                </section>
                <details className="arena-more arena-options"><summary>Equipas sugeridas e ordem de pick</summary><div className="arena-options-body">
                <MapTeamBoardPanel mapName={selectedMap?.name} mapTeams={mapTeams} allyNames={myPickNames} />
                <section className="draft-arena-suggestions" aria-label="Sugestões rápidas para o turno ativo">
                  <QuickPickRail activeStep={activeDraftStep} entries={rankedDraftEntries} selectionLockedNames={lockedNames} onSelect={assignBrawler} onSkip={skipActiveStep} />
                </section>
                <section className="draft-arena-first-team">
                  <div className="section-kicker"><Trophy size={12} /> Ordem de Pick <span>ABERTURA</span></div>
                  <strong>Quem escolhe primeiro?</strong>
                  <div className="draft-initial-team-actions" role="group" aria-label="Selecionar equipa que abre o Draft">
                    <button type="button" className={initialTeam === "blue" ? "is-active blue" : "blue"} onClick={() => handleInitialTeamChange("blue")}>Azul <small>abre o Draft</small></button>
                    <button type="button" className={initialTeam === "red" ? "is-active red" : "red"} onClick={() => handleInitialTeamChange("red")}>Vermelha <small>abre o Draft</small></button>
                  </div>
                  <small>A sequência é espelhada: 1 pick, resposta com 2, 2 picks de volta e 1 pick final.</small>
                </section>
                </div></details>
              </div>
              <details className="arena-more"><summary>Referência de pontuação</summary><div className="draft-arena-reference"><DraftScoreReference entries={draftScoreReference} mapName={selectedMap?.name} pickNumber={analysisGlobalPickNumber} /></div></details>
            </section>

            <section className="recommendations-section">

              <div className="recommendations-heading" id="ranked-picks">
                <div><div className="section-kicker">ESCOLHE O PRÓXIMO</div><h2>Sugestões <span className={`turn-team ${suggestionTeam}`}>{suggestionTeam === "blue" ? "Azul" : "Vermelha"}</span></h2><p>{activeDraftStep ? "Toca num brawler para preencher o slot ativo." : "Draft completo. Reabre um slot para testar."}</p></div>
                <button type="button" className="pick-details-toggle" aria-pressed={showPickDetails} onClick={() => setShowPickDetails(value => !value)}>{showPickDetails ? "Menos detalhes" : "Ver detalhes"}</button>
              </div>
              {sameClassAlerts.length > 0 && <aside className="draft-composition-alert" aria-label="Alertas de composição por classe">
                <div className="draft-composition-alert-heading"><AlertTriangle size={16} /><span>ALERTA DE COMPOSIÇÃO · DESBÓNUS ATIVO</span></div>
                <p>Os Picks da equipa {suggestionTeam === "blue" ? "Azul" : "Vermelha"} abaixo já ocupam estas classes. Qualquer candidato desta mesma equipa recebe <strong>−{draftRuleSettings.sameClassPenalty * 100}%</strong> por cada ativador.</p>
                <div className="draft-composition-alert-list">
                  {sameClassAlerts.map((alert) => <div className={`draft-composition-alert-item team-${suggestionTeam}`} key={alert.className}>
                    <strong>{alert.className}</strong>
                    <span><b>−{draftRuleSettings.sameClassPenalty * 100}%</b> Picks {suggestionTeam === "blue" ? "Azuis" : "Vermelhos"}: <em>{alert.triggers.join(", ")}</em></span>
                    <small>{alert.candidateCount} {alert.candidateCount === 1 ? "candidato será afetado" : "candidatos serão afetados"} nesta lista</small>
                  </div>)}
                </div>
              </aside>}
              <label className="ranking-order-control">Ordenar por
                <select value={rankingOrder} onChange={event => setRankingOrder(event.target.value as "base" | "context")}>
                  <option value="base">Vitória {hybridWeights.winRate}% + Uso {hybridWeights.usageRate}%</option>
                  <option value="context">Pontos do Draft · com bónus</option>
                </select>
                <small>{rankingOrder === "base" ? "Ranking base do mapa. Os pontos finais incluem os ajustes do Draft." : "Ranking contextual: counters, sinergias e regras podem mudar a ordem."}</small>
              </label>
              <div className="recommendation-toolbar"><div className="draft-search-voice"><label className="draft-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar brawler..." aria-label="Procurar brawler no draft" />{query && <button aria-label="Limpar pesquisa" onClick={() => setQuery("")}><X size={14} /></button>}</label><button type="button" className={`draft-voice-button ${voiceState === "listening" ? "is-listening" : ""}`} onClick={startVoiceFill} disabled={activeStepIndex === null} aria-label={voiceState === "listening" ? "A ouvir nome do brawler" : "Falar o nome do brawler"} title="Falar nome do brawler"><Mic size={15} /><span>{voiceState === "listening" ? "A ouvir" : voiceState === "processing" ? "A preencher" : "Falar"}</span></button></div><div className="draft-role-filter" role="group" aria-label="Filtrar recomendações por posição">{(["Todas", "side", "mid", "flex"] as DraftRoleFilter[]).map((option) => <button key={option} className={roleFilter === option ? "is-active" : ""} onClick={() => setRoleFilter(option)}>{draftRoleLabels[option]}</button>)}</div></div>
              <div className={`draft-recommendation-list ${showPickDetails ? "with-details" : "is-compact"}`}>{pagedRankedEntries.map((entry) => <div key={entry.row.brawler}><DraftCard row={entry.row} index={entry.rank - 1} draftScore={entry.draftScore} basePoints={entry.basePoints} finalPoints={entry.finalPoints} signal={entry.signal} onSelect={assignBrawler} locked={lockedNames.has(entry.row.brawler)} banned={banNames.has(entry.row.brawler) && analysisDraftStep?.kind === "pick"} suggestionTeam={suggestionTeam} rosterNames={rosterNames} activeCounterWindow={activeCounterWindow} expanded={showPickDetails} /></div>)}{pagedRankedEntries.length === 0 && <div className="draft-empty"><Search size={22} /><strong>Sem recomendações nesse filtro.</strong><span>Limpa a pesquisa ou troca a posição para veres mais opções.</span></div>}</div>
              <div className="roster-pagination" aria-label="Páginas de brawlers"><button onClick={() => setRosterPage((page) => Math.max(1, page - 1))} disabled={rosterPage === 1}><ArrowLeft size={14} /> Anterior</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => <button key={page} className={rosterPage === page ? "is-active" : ""} onClick={() => setRosterPage(page)}>{page}</button>)}<button onClick={() => setRosterPage((page) => Math.min(pageCount, page + 1))} disabled={rosterPage === pageCount}>Ver mais <ArrowDown size={14} /></button><span>A mostrar {topRows.length} de {visibleRows.length} brawlers</span></div>
              <div className="signal-radar-grid">
                <SignalCard
                  title="Aliados recomendados"
                  eyebrow="Sinergia"
                  metric="pontos de sinergia"
                  entries={synergyRadarEntries}
                  reason={synergyReason}
                  emptyLabel="Nenhum candidato tem sinergia publicada com os aliados já escolhidos."
                  onSelect={assignBrawler}
                />
                <SignalCard
                  title="Resposta aos inimigos"
                  eyebrow="Counter"
                  metric="pontos de counter"
                  entries={counterRadarEntries}
                  reason={counterReason}
                  emptyLabel="Sem picks inimigos ainda — não há confronto para responder."
                  onSelect={assignBrawler}
                />
              </div>
              <div className="recommendation-foot"><span><span className="tiny-live" /> {visibleRows.length} opções disponíveis · meta auxiliar média {formatMetric(hybridAverage, "")}</span><span><Star size={13} /> Score Híbrido é a base. As taxas de Counter, Sinergia, Ban, Fit, composição do mapa e desbónus são as definidas no painel Regras % desta sessão. A posição é comum a Azul e Vermelho.</span></div>
            </section>

            <LaneMatchupDesk blueRows={bluePicks} redRows={redPicks} mapName={selectedMap?.name} mapModeId={selectedMap?.modeId} mapTeams={mapTeams} bannedNames={banNames} baseHybridTop25Names={baseHybridTop25Names} baseHybridTop30Names={baseHybridTop30Names} pickNumber={analysisGlobalPickNumber} completedPickCount={analysisCompletedPickCount} topRecommendationNames={topRecommendationNames} counterPenaltyEligibleNames={counterWindow.counterPenaltyEligibleNames} experimentalWeights={experimentalWeights} maxHybridScore={availableHybridReference || mapHybridReference} ruleSettings={draftRuleSettings} />

            <LiveCounterEngine suggestions={liveCounterSuggestions} enemyRows={opponentPicks} canAutoPick={canAutoPick} onSelect={assignBrawler} onSimulate={simulateBestCounter} />

            <FoldPanel title="Configurar sequência" kicker="Estratégia" summary="Formato do draft e equipa que começa.">
            <ScrimSetup preset={scrimPreset} initialTeam={initialTeam} myTeam={myTeam} steps={draftSequence} onPresetChange={handlePresetChange} onInitialTeamChange={handleInitialTeamChange} onMyTeamChange={setMyTeam} onStepsChange={handleCustomStepsChange} />
            </FoldPanel>

            {analysisResolvedCount === draftSequence.length && (() => {
              const bluePicks = draftSequence
                .map((step, idx) => (step.kind === "pick" && step.team === "blue" ? analysisChoices[idx] : null))
                .filter(Boolean)
                .map((name) => currentRows.find((r) => r.brawler === name))
                .filter((r): r is RankedRow => !!r);
              const redPicks = draftSequence
                .map((step, idx) => (step.kind === "pick" && step.team === "red" ? analysisChoices[idx] : null))
                .filter(Boolean)
                .map((name) => currentRows.find((r) => r.brawler === name))
                .filter((r): r is RankedRow => !!r);
              const allyPickRows = myTeam === "red" ? redPicks : bluePicks;
              const allyPickNames = new Set(allyPickRows.map((r) => r.brawler));
              const allPicks = [...bluePicks, ...redPicks];
              if (allPicks.length === 0) return null;
              const finalEstimate = estimateDraftWinProbability(bluePicks, redPicks);
              const coachPlanText = buildGamePlanText(selectedMap?.name, selectedMap?.modeId, myTeam, coachAnalysis, allyPickRows, finalEstimate, myTeam === "blue" ? redPicks : bluePicks);
              const copyCoachPlan = async () => {
                try {
                  await navigator.clipboard.writeText(coachPlanText);
                  toast.success("Plano coach copiado", { description: `${allyPickRows.length} picks aliados e instruções por fases.` });
                } catch {
                  toast.error("Não foi possível copiar o plano", { description: "Verifica as permissões da área de transferência." });
                }
              };
              const downloadCoachPlan = () => {
                const blob = new Blob([coachPlanText], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `brawl-hibrido-coach-plan-${(selectedMap?.name ?? "draft").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
                link.click();
                URL.revokeObjectURL(url);
                toast.success("Plano coach descarregado");
              };
              return (
                <>
                <FinalWinProbability blueRows={bluePicks} redRows={redPicks} myTeam={myTeam} />
                <section className="game-plan-section">
                  <div className="game-plan-heading"><div><div className="section-kicker">Tactical blueprint <span>POST-DRAFT GAME PLAN</span></div><h2>Plano tático de jogo & Builds</h2><p>Missão, posicionamento e builds recomendadas (Gadget, Star Power e Engrenagens) para cada brawler escolhido no mapa {selectedMap?.name}.</p></div><div className="game-plan-actions"><button onClick={copyCoachPlan}><Copy size={14} /> Copiar plano</button><button onClick={downloadCoachPlan}><Download size={14} /> Descarregar</button></div></div>
                  <div className="game-plan-cards">
                    {allPicks.map((pickRow, idx) => {
                      const role = inferDraftRole(pickRow.brawler);
                      const plan = getTacticalPlan(pickRow, selectedMap?.modeId ?? "gem-grab");
                      const build = getBrawlerBuild(pickRow.brawler, selectedMap?.modeId);
                      const isAlly = allyPickNames.has(pickRow.brawler);
                      return (
                        <div key={idx} className={`game-card ${isAlly ? "is-ally" : "is-enemy"}`}>
                          <div className="game-card-head">
                            <span className="game-card-avatar" style={brawlerImageFor(pickRow) ? { backgroundImage: `url(${brawlerImageFor(pickRow)})` } : undefined} />
                            <div>
                              <h4>{pickRow.brawler}</h4>
                              <small>{isAlly ? "Aliado (Minha Equipa)" : "Adversário"} · {role === "flex" ? "FLEX (ADAPTAÇÃO)" : role.toUpperCase()} · Plano tático</small>
                            </div>
                          </div>
                          <div className="game-card-body">
                            <p><strong>Missão:</strong> {plan.mission}</p>
                            <p><strong>Ataque/Defesa:</strong> {plan.action}</p>
                            <p><strong>Posicionamento:</strong> {plan.position}</p>
                            <p><strong>Pressão/Alvos:</strong> {plan.pressure}</p>
                            <div className="game-card-build">
                              <small>⚡ <strong>Build Recomendada:</strong> Gadget: {build.gadget} | Star Power: {build.starPower} | Gears: {build.gears.join(", ")}</small>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                </>
              );
            })()}

            <FoldPanel title="Leitura das fontes" kicker="Intel" summary="De onde vêm os números de cada brawler deste mapa.">
              <section className="draft-intel-grid"><article className="draft-intel-card"><div className="section-kicker">Source lens <span>TOPBRAWL</span></div><Gauge size={18} /><strong>Vitória e uso</strong><p>Win Rate e Use Rate publicados entram na média de fontes. O Score 0–13 não entra na fórmula.</p></article><article className="draft-intel-card"><div className="section-kicker">Source lens <span>BRAWL PLANET</span></div><Star size={18} /><strong>Vitória e popularidade</strong><p>Win Rate e Pick Rate publicados juntam-se aos dados TopBrawl; vitória e uso são normalizados dentro de cada mapa.</p></article><article className="draft-intel-card accent"><div className="section-kicker">Hybrid rule <span>{experimentalWeights ? `${experimentalWeights.winRate} — ${experimentalWeights.usageRate}` : "70 — 30"}</span></div><Zap size={18} /><strong>Contexto primeiro</strong><p>As recomendações ordenam o contexto do mapa e retiram automaticamente bans e picks já usados.</p></article></section>
            </FoldPanel>
          </div>
          {/*
            * A ordem aqui é deliberada: o TABALHO primeiro, a configuração
            * depois. Antes, o painel de regras e os avisos ficavam acima do
            * tabuleiro — o que se usa em cada draft estava debaixo do que se
            * configura uma vez. Quem abre a página quer draftar, não afinar.
            */}

          <RosterWatchPanel roster={rankedSync.snapshot?.roster} />

          <SourceHealthPanel
            sourceStates={(counterStatusQuery.data as { sourceStatus?: Record<string, SourceStateView> } | undefined)?.sourceStatus}
            health={(counterStatusQuery.data as { sourceHealth?: Record<string, { blocked?: boolean; blockedUntil?: number; lastStatus?: number }> } | undefined)?.sourceHealth}
            processHealth={processHealth}
          />

          {hasCustomGlobalWeights && <section className="draft-experimental-banner" aria-label="Pesos globais ativos"><Sparkles size={16} /><div><strong>Pesos globais ativos</strong><span>Este navegador usa Vitória {experimentalWeights.winRate}% / Uso {experimentalWeights.usageRate}% em todo o site. As regras do Draft podem ser configuradas logo abaixo.</span></div><a href="/#ranking-laboratory">Ajustar pesos</a></section>}
          <DraftRoleEditor names={liveRows.map(row => row.brawler)} />
          <DraftRulesPanel preference={draftRulePreference} hasCustomRules={hasCustomRules} onChange={updateDraftRulePreference} onReset={resetDraftRulePreference} reading={brawlScopeReading} onReadingChange={setBrawlScopeReadingPreference} liveCoverage={liveMatchups.coverage as Record<string, { profiles: number; pairs: number }>} liveCapturedAt={liveMatchups.capturedAt} />

          <FoldPanel
            title="Rotação oficial"
            kicker="API"
            tone={eventsQuery.data?.source === "official_api" ? "live" : "warning"}
            summary={eventsQuery.data?.source === "official_api" ? "Ligada à API oficial do Brawl Stars." : "Sem resposta da API oficial — a usar a rotação do projeto."}
          >
            <section className={`official-events-banner ${eventsQuery.data?.source === "official_api" ? "is-live" : "is-fallback"}`}>
            <div className="official-events-header">
              <div className="section-kicker">
                <Radio size={13} className={eventsQuery.data?.source === "official_api" ? "text-emerald-400 animate-pulse" : "text-amber-400"} />
                Official Brawl Stars API <span>{eventsQuery.data?.source === "official_api" ? "LIVE ROTATION" : "FALLBACK ATIVO"}</span>
              </div>
              <small className="official-events-meta">
                Fonte: {eventsQuery.data?.source === "official_api" ? "API Oficial" : "Fallback Local/IP"} · Atualizado: {eventsQuery.data?.fetchedAt ? new Date(eventsQuery.data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—"}
              </small>
            </div>
            {eventsQuery.data?.events && eventsQuery.data.events.length > 0 ? (
              <div className="official-events-scroll">
                {eventsQuery.data.events.map((ev: any, idx: number) => (
                  <button key={idx} type="button" className="official-event-chip" onClick={() => {
                    const match = liveMaps.find(m => m.name.toLowerCase() === ev.event?.map?.name?.toLowerCase());
                    if (match) { setSelectedMapName(match.name); resetDraft(); toast.success(`Mapa alterado para ${match.name} via API oficial.`); }
                    else toast.info(`Evento oficial: ${ev.event?.map?.name} (${ev.event?.mode})`);
                  }}>
                    <strong>{ev.event?.map?.name ?? "Evento Oficial"}</strong>
                    <small>{ev.event?.mode ?? "Modo"} · Fim: {new Date(ev.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="official-events-empty">
                <span>A API oficial devolveu estado vazio (restrinção de token/IP allowlist). O Brawl Híbrido mantém os 26 mapas oficiais da rotação Ranked em funcionamento contínuo.</span>
              </div>
            )}
          </section>
          </FoldPanel>
        </main>
        <footer className="app-footer"><span>BRAWL HÍBRIDO / DRAFT WORKSPACE</span><span>Decisões melhores, um slot de cada vez.</span></footer>
      </div>
      <a className="scroll-top-button draft-back-home" href="/"><ArrowLeft size={17} /></a>
      <MobileNav pathname="/draft" />
    </div>
  );
}
