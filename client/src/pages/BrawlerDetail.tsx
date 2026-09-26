import { BarraDoSite } from "@/components/BarraDoSite";
import { MobileNav } from "@/components/MobileNav";
import { LOGO } from "@/lib/imagens";
import { useDraftRolesVersion } from "@/contexts/DraftRolesContext";
import { DraftRoleEditor } from "@/components/DraftRoleEditor";
import { getMatchupValue, getPublishedMatchupValue, describeMatchupValue, formatMatchupPercent, getBrawlScopeCoverage } from "@shared/counterMatchupValue";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronRight, Crosshair, ExternalLink, Radio, Shield, Sparkles, Swords, Target, Trophy, Zap } from "lucide-react";
import { allRankedRows, normalizeRankedRows, preRankedBrawlerCatalogRows } from "@/data/rankedData";
import { additionalBrawlerAssetIds } from "@/data/additionalRankedData";
import { useCounterSync } from "@/contexts/CounterSyncContext";
import { useBrawlScopeLiveMatchups } from "@/lib/brawlScopeMatchups";
import { useRankedSync } from "@/contexts/RankedSyncContext";
import { useHybridWeights } from "@/lib/hybridWeights";
import { useSourceBalance } from "@/lib/sourceBalance";
import { buildBrawlerCatalog, normalizeBrawlerCatalogName, type BrawlerCatalogItem } from "@shared/brawlerCatalog";
import { brawlPlanetRelationData, type BrawlPlanetRelation } from "@shared/brawlPlanetRelationData";
import { getBrawlScopeSynergyTeammates, getCounterSourceProfiles, type CounterSourceName, type CounterSourceProfile, type SourcedCounterRelation } from "@shared/counterSourceRelations";
import { BRAWLSCOPE_SYNERGY_LIMIT } from "@shared/brawlScopeSynergyData";
import { draftRoleLabels } from "@shared/draft";
import { brawlScopeModes } from "@shared/brawlScopeModes";
import { trpc } from "@/lib/trpc";

const LOGO_URL = LOGO;
const BRAWL_PLANET_URL = "https://www.brawlplanet.com/brawlers";
const PL_PRODIGY_URL = "https://powerleagueprodigy.com";
const BRAWLSCOPE_URL = "https://brawlscope.com/counters";
const TOP_BRAWL_URL = "https://topbrawl.com/brawlers";

type CounterDirection = "targets" | "counteredBy";
type AggregatedCounterRelation = SourcedCounterRelation & { sources: CounterSourceName[]; globalSources: CounterSourceName[] };

const counterSourcePriority: CounterSourceName[] = ["BrawlScope", "PL Prodigy", "Brawl Planet"];

function imageFor(item: BrawlerCatalogItem | undefined) {
  if (!item) return null;
  const id = item.brawlerId ?? additionalBrawlerAssetIds[item.brawler];
  return id ? `https://cdn.brawlify.com/brawlers/borderless/${id}.png` : null;
}

function normalize(value: string) {
  return normalizeBrawlerCatalogName(value);
}

function relationKey(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, "");
}

function aggregateCounterRelations(profiles: CounterSourceProfile[], direction: CounterDirection, owner?: string, modeId?: string): AggregatedCounterRelation[] {
  const grouped = new Map<string, AggregatedCounterRelation>();
  const byPriority = [...profiles].sort((left, right) => counterSourcePriority.indexOf(left.source) - counterSourcePriority.indexOf(right.source));

  for (const profile of byPriority) {
    for (const relation of (owner ? [...profile.targets, ...profile.counteredBy] : profile[direction])) {
      if (owner) {
        const value = getMatchupValue(owner, relation.brawler, modeId);
        const effectiveDirection = value.base !== null && value.total !== 0 ? (value.total > 0 ? "targets" : "counteredBy") : profile[direction].includes(relation) ? direction : null;
        if (effectiveDirection !== direction) continue;
      }
      const key = relationKey(relation.brawler);
      const current = grouped.get(key);
      if (current) {
        if (!current.sources.includes(profile.source)) current.sources.push(profile.source);
        if (!profile.modeId && profile.source !== "BrawlScope" && !current.globalSources.includes(profile.source)) current.globalSources.push(profile.source);
        continue;
      }
      grouped.set(key, { ...relation, source: profile.source, sourceUrl: profile.sourceUrl, sources: [profile.source], globalSources: !profile.modeId && profile.source !== "BrawlScope" ? [profile.source] : [] });
    }
  }

  return Array.from(grouped.values());
}

function brawlPlanetProfileFor(name: string) {
  return Object.values(brawlPlanetRelationData).find((entry) => relationKey(entry.brawler) === relationKey(name));
}

function metric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

function score(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
}

function roleClass(role: BrawlerCatalogItem["role"]) {
  return role === "mid" ? "is-mid" : role === "side" ? "is-side" : "is-flex";
}


function TeammateCard({ relation, target }: { relation: BrawlPlanetRelation; target: BrawlerCatalogItem | undefined }) {
  const image = imageFor(target);
  const name = relation.brawler;
  const href = `/brawlers/${encodeURIComponent(target?.brawler ?? name)}`;
  return <Link href={href} className="brawler-relation-card is-positive">
    <div className="relation-avatar">{image ? <img src={image} alt={name} loading="lazy" /> : <span>{name.slice(0, 2).toUpperCase()}</span>}</div>
    <div className="relation-copy"><strong>{name}</strong><span>{`${relation.delta > 0 ? "+" : ""}${relation.delta.toFixed(1)} sinergia`}</span><small>Brawl Planet · Best Teammates</small></div>
    <ChevronRight size={16} className="relation-arrow" />
  </Link>;
}

function BestTeammates({ item, catalog }: { item: BrawlerCatalogItem; catalog: BrawlerCatalogItem[] }) {
  const profile = brawlPlanetProfileFor(item.brawler);
  const relations = profile?.bestTeammates ?? [];
  return <section className="brawler-relation-section teammates">
    <div className="relation-section-head"><div><span className="section-kicker">SINERGIAS · BEST TEAMMATES</span><h2>Best Teammates</h2><p>Sinergias: parceiros com desempenho conjunto acima do esperado na ficha pública do Brawl Planet.</p></div><strong>{relations.length}</strong></div>
    {relations.length ? <div className="brawler-relation-grid">{relations.map((relation) => <TeammateCard key={relation.brawler} relation={relation} target={catalog.find((entry) => relationKey(entry.brawler) === relationKey(relation.brawler))} />)}</div> : <p className="relation-empty-state">Sem sinergia pública disponível na ficha do Brawl Planet.</p>}
  </section>;
}

function WorstTeammates({ item, catalog }: { item: BrawlerCatalogItem; catalog: BrawlerCatalogItem[] }) {
  const profile = brawlPlanetProfileFor(item.brawler);
  const relations = profile?.worstTeammates ?? [];
  return <section className="brawler-relation-section teammates worst-teammates">
    <div className="relation-section-head"><div><span className="section-kicker">SINERGIA NEGATIVA · WORST TEAMMATES</span><h2>Worst Teammates</h2><p>Aliados cujo desempenho conjunto aparece abaixo do esperado na ficha pública do Brawl Planet. Cada relação ativa aplica -5% no Draft.</p></div><strong>{relations.length}</strong></div>
    {relations.length ? <div className="brawler-relation-grid">{relations.map((relation) => {
      const target = catalog.find((entry) => relationKey(entry.brawler) === relationKey(relation.brawler));
      const image = imageFor(target);
      const name = relation.brawler;
      return <Link href={`/brawlers/${encodeURIComponent(target?.brawler ?? name)}`} className="brawler-relation-card is-negative" key={name}>
        <div className="relation-avatar">{image ? <img src={image} alt={name} loading="lazy" /> : <span>{name.slice(0, 2).toUpperCase()}</span>}</div>
        <div className="relation-copy"><strong>{name}</strong><span>{`${relation.delta > 0 ? "+" : ""}${relation.delta.toFixed(1)} sinergia`}</span><small>Brawl Planet · Worst Teammates</small></div>
        <ChevronRight size={16} className="relation-arrow" />
      </Link>;
    })}</div> : <p className="relation-empty-state">Sem sinergia negativa pública disponível na ficha do Brawl Planet.</p>}
  </section>;
}

function BrawlScopeSynergy({ item, catalog, modeId }: { item: BrawlerCatalogItem; catalog: BrawlerCatalogItem[]; modeId?: string }) {
  const relations = getBrawlScopeSynergyTeammates(item.brawler, modeId);
  const viewLabel = modeId ? brawlScopeModes.find(mode => mode.modeId === modeId || mode.id === modeId)?.label ?? modeId : "Geral";
  return <section id="perfil-sinergias" className="brawler-relation-section sourced-list teammates brawlscope-synergy">
    <div className="relation-section-head"><div><span className="section-kicker">BRAWLSCOPE · PAIR WITH</span><h2>Sinergias · {viewLabel}</h2><p>Top {BRAWLSCOPE_SYNERGY_LIMIT} de aliados na última importação publicada do BrawlScope. Esta mesma lista alimenta o Draft na leitura correspondente.</p></div><strong>{relations.length}</strong></div>
    {relations.length ? <div className="sourced-counter-grid">{relations.map((relation, index) => {
      const target = catalog.find((entry) => relationKey(entry.brawler) === relationKey(relation.brawler));
      const image = imageFor(target);
      const name = relation.brawler;
      return <Link href={`/brawlers/${encodeURIComponent(target?.brawler ?? name)}`} className="sourced-counter-card is-advantage" key={`pair-${name}`}>
        <div className="relation-avatar">{image ? <img src={image} alt={name} loading="lazy" /> : <span>{name.slice(0, 2).toUpperCase()}</span>}</div>
        <div className="sourced-counter-copy"><div><strong>{name}</strong><span className="counter-source-badge">BrawlScope · {viewLabel}</span></div><small>{typeof relation.delta === "number" ? `${relation.delta > 0 ? "+" : ""}${relation.delta.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}% de sinergia` : `#${index + 1} na lista publicada`}</small><small>BrawlScope · Pair with{typeof relation.delta === "number" ? ` · #${index + 1}` : ""}</small></div>
        <ChevronRight size={16} className="relation-arrow" />
      </Link>;
    })}</div> : <p className="relation-empty-state">Ainda não há uma lista &quot;Pair with&quot; importada e publicada para {item.brawler}{modeId ? " neste modo" : ""}. Nenhum aliado é inferido a partir de outra fonte.</p>}
  </section>;
}

function SourceCounterCard({ relation, target, direction, owner, modeId }: { owner: string; modeId?: string; relation: AggregatedCounterRelation; target: BrawlerCatalogItem | undefined; direction: CounterDirection }) {
  // Número igual ao da ficha pública: positivo = o adversário leva vantagem.
  const value = getPublishedMatchupValue(owner, relation.brawler, modeId);
  const image = imageFor(target);
  const name = relation.brawler;
  const href = `/brawlers/${encodeURIComponent(target?.brawler ?? name)}`;
  return <Link href={href} className={`sourced-counter-card ${direction === "targets" ? "is-advantage" : "is-risk"}`}>
    <div className="relation-avatar">{image ? <img src={image} alt={name} loading="lazy" /> : <span>{name.slice(0, 2).toUpperCase()}</span>}</div>
    <div className="sourced-counter-copy"><div><strong>{name}</strong><span className="counter-source-badge">{relation.sources.map(source => `${source}${relation.globalSources.includes(source) ? " · Global da fonte" : ""}`).join(" + ")}</span></div><small>{value.base === null ? "—" : formatMatchupPercent(value.total)} · {describeMatchupValue(value)}</small>{relation.reason ? <p>{relation.reason}</p> : <small>Relação listada literalmente no guia público da fonte.</small>}</div>
    <ChevronRight size={16} className="relation-arrow" />
  </Link>;
}

/**
 * Uma lista vazia tem duas leituras muito diferentes. Se a fonte não publica a
 * tabela deste brawler, faltam dados. Se publica os confrontos todos e nenhum é
 * desfavorável, a leitura é outra: ele não tem counters — é o que acontece com
 * os brawlers dominantes do momento. A mensagem diz qual dos dois casos é.
 */
function EmptyCounterState({ item, direction }: { item: BrawlerCatalogItem; direction: CounterDirection }) {
  const coverage = getBrawlScopeCoverage(item.brawler);
  if (!coverage.published) {
    return <p className="relation-empty-state">Sem relação pública de counter disponível nas fontes auditadas.</p>;
  }

  const reference = direction === "counteredBy" ? coverage.hardest : coverage.easiest;
  const headline = direction === "counteredBy"
    ? `${item.brawler} não tem counters.`
    : `${item.brawler} não tem confrontos favoráveis publicados.`;
  const detail = direction === "counteredBy"
    ? `O BrawlScope publica ${coverage.total} confrontos para ${item.brawler} e em nenhum deles o adversário leva vantagem — é a leitura de um brawler dominante na fonte, não uma lista em falta.`
    : `O BrawlScope publica ${coverage.total} confrontos para ${item.brawler} e nenhum lhe dá vantagem.`;
  const closing = reference
    ? ` O confronto mais equilibrado da lista é ${reference.brawler}, com ${formatMatchupPercent(-reference.value)} na ficha.`
    : "";

  return <p className="relation-empty-state is-dominant"><strong>{headline}</strong> {detail}{closing}</p>;
}

function CounterSourceGrid({ item, catalog, direction, modeId }: { item: BrawlerCatalogItem; catalog: BrawlerCatalogItem[]; direction: CounterDirection; modeId?: string }) {
  const profiles = getCounterSourceProfiles(item.brawler, modeId);
  const relations = aggregateCounterRelations(profiles, direction, item.brawler, modeId);
  const total = relations.length;
  const title = direction === "targets" ? "Matchups strong against" : "Struggles against";
  const kicker = direction === "targets" ? "COUNTERA · STRONG AGAINST" : "COUNTERADO POR · STRUGGLES AGAINST";
  const subtitle = direction === "targets" ? "Todos os brawlers que esta escolha countera. Se várias fontes publicam o mesmo par, ele aparece uma vez com as fontes agrupadas." : "Todos os brawlers que counteram esta escolha. Se várias fontes publicam o mesmo par, ele aparece uma vez com as fontes agrupadas.";
  return <section className={`brawler-relation-section sourced-list ${direction === "targets" ? "counters" : "counteredBy"}`}>
    <div className="relation-section-head"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2><p>{subtitle}</p></div><strong>{total}</strong></div>
    {relations.length ? <div className="sourced-counter-grid">{relations.map((relation) => <SourceCounterCard owner={item.brawler} modeId={modeId} key={`${direction}-${relation.brawler}`} relation={relation} target={catalog.find((entry) => relationKey(entry.brawler) === relationKey(relation.brawler))} direction={direction} />)}</div> : <EmptyCounterState item={item} direction={direction} />}
  </section>;
}

function BrawlScopeMatchupMatrix({ item, catalog, modeId, vistasComFicha }: { item: BrawlerCatalogItem; catalog: BrawlerCatalogItem[]; modeId?: string; vistasComFicha: string[] }) {
  const rows = catalog
    .filter((entry) => normalize(entry.brawler) !== normalize(item.brawler))
    .map((entry) => {
      const value = getPublishedMatchupValue(item.brawler, entry.brawler, modeId);
      return { entry, delta: value.total, value };
    })
    // Ordem de leitura: primeiro os confrontos que o titular domina, que na
    // orientação publicada são os mais negativos.
    .sort((left, right) => left.delta - right.delta || left.entry.brawler.localeCompare(right.entry.brawler));
  return <section className="brawler-relation-section sourced-list brawl-scope-matrix">
    <div className="relation-section-head"><div><span className="section-kicker">BRAWLSCOPE · LEITURA DE COUNTER</span><h2>Matchup contra todos os brawlers</h2><p>Os valores estão como o BrawlScope os publica na ficha: <b>negativo</b> significa que {item.brawler} pune o adversário e <b>positivo</b> significa que o adversário leva vantagem. Delta da fonte + 2% por cada fonte que confirma a mesma direção. No Draft o mesmo confronto aparece na perspetiva do teu pick, por isso com o sinal trocado. Todas as linhas são preservadas; sem delta publicado, não há percentagem calculada.</p></div><strong>{rows.length}</strong></div>
    {/*
      De onde vieram estes números.
      "Os valores não estão a atualizar" não se consegue investigar sem isto: o
      ecrã mostrava a mesma coisa quer estivesse a ler uma ficha colada quer o
      catálogo do repositório, e não havia como distinguir "a colagem não
      chegou aqui" de "a colagem chegou e os números são mesmo estes".
    */}
    <p className="matrix-origin">{(() => {
      const daFicha = rows.filter(({ value }) => value.live).length;
      if (daFicha) return `Origem: ficha colada — ${daFicha} de ${rows.length} confrontos${modeId ? " neste modo" : ""}.`;
      /**
       * "Nenhuma ficha colada" sozinho manda a pessoa procurar um defeito que
       * não existe.
       *
       * Aconteceu com o Griff: colado em Nocaute, e o perfil aberto em Geral. A
       * leitura caía no catálogo — correctamente — e a linha dizia apenas que
       * nenhuma ficha estava a ser usada. A conclusão óbvia, e errada, era que a
       * colagem se tinha perdido. Faltava a segunda metade da frase: ela existe,
       * está noutro modo, e basta escolhê-lo aqui em cima.
       */
      const base = `Origem: catálogo do repositório. Nenhuma ficha colada está a ser usada nesta leitura${modeId ? " para este modo" : ""}.`;
      if (!vistasComFicha.length) return `${base} Ainda não colaste a ficha deste brawler.`;
      return `${base} Mas há ficha colada dele em: ${vistasComFicha.join(", ")} — escolhe esse modo no seletor acima.`;
    })()}</p>
    <div className="sourced-counter-grid">{rows.map(({ entry, delta, value }) => {
      const image = imageFor(entry);
      // O tom segue o significado, não o sinal: negativo publicado é vantagem do titular.
      const tone = delta < 0 ? "is-advantage" : delta > 0 ? "is-risk" : "is-neutral";
      return <Link key={entry.brawler} href={`/brawlers/${encodeURIComponent(entry.brawler)}`} className={`sourced-counter-card ${tone}`}>
        <div className="relation-avatar">{image ? <img src={image} alt={entry.brawler} loading="lazy" /> : <span>{entry.brawler.slice(0, 2).toUpperCase()}</span>}</div>
        <div className="sourced-counter-copy"><div><strong>{entry.brawler}</strong><span className="counter-delta">{value.base === null ? "—" : formatMatchupPercent(delta)}</span></div><small>{describeMatchupValue(value)}</small></div>
        <ChevronRight size={16} className="relation-arrow" />
      </Link>;
    })}</div>
  </section>;
}

export default function BrawlerDetail() {
  const roleVersion = useDraftRolesVersion();
  const { version: counterSnapshotVersion, snapshot: counterSnapshot } = useCounterSync();
  const [, params] = useRoute("/brawlers/:name");
  const [, navigate] = useLocation();
  const rankedSync = useRankedSync();
  const { weights: hybridWeights, winRateWeight, starPlayerWeight } = useHybridWeights();
  const { topBrawlWeight } = useSourceBalance();
  const [selectedModeId, setSelectedModeId] = useState("global");
  // Counters, sinergias e a lista contra todos eram três páginas empilhadas: agora são abas.
  const [aba, setAba] = useState<"counters" | "sinergias" | "todos">("counters");
  /**
   * As matrizes completas de confrontos — as mesmas que o Draft usa.
   *
   * Faltavam aqui. Só o Draft as carregava, e como elas vivem num módulo
   * partilhado, o perfil só mostrava os valores colados a quem tivesse passado
   * pelo Draft primeiro, na mesma visita. Quem abrisse o perfil de um brawler
   * diretamente — ou recarregasse a página — via o catálogo antigo e concluía,
   * com razão, que a colagem não tinha servido para nada.
   */
  /**
   * Onde é que existe ficha colada deste brawler.
   *
   * O perfil só carrega a matriz da vista que está a ver, por isso não pode
   * saber sozinho que a ficha existe noutra. Esta consulta é pequena — só
   * nomes — e é o que permite dizer "está em Nocaute" em vez de deixar a
   * pessoa a pensar que a colagem se perdeu.
   */
  const colagens = trpc.counterSync.colagemFeita.useQuery(undefined, { staleTime: 30_000 });

  const matrizesVivas = useBrawlScopeLiveMatchups(
    selectedModeId === "global" ? [] : [selectedModeId],
    counterSnapshotVersion,
  );
  const catalogRows = useMemo(() => [
    ...normalizeRankedRows(rankedSync.snapshot?.rows ?? allRankedRows, winRateWeight, topBrawlWeight, starPlayerWeight),
    ...(rankedSync.snapshot?.officialBrawlers ?? []).map((brawler) => ({
      map: "Ainda não disponível",
      mode: "Ranked",
      modeId: "ranked",
      brawler: brawler.name,
      score: 0,
      tier: "B" as const,
      brawlerId: brawler.id,
      dataStatus: "partial" as const,
      rankedStatus: "unavailable" as const,
    })),
    ...preRankedBrawlerCatalogRows,
  ], [winRateWeight, starPlayerWeight, topBrawlWeight, rankedSync.snapshot?.officialBrawlers, rankedSync.snapshot?.rows]);
  const catalog = useMemo(
    () => buildBrawlerCatalog(catalogRows, counterSnapshot),
    // `matrizesVivas.version` entra aqui para o perfil se refazer no momento em
    // que uma matriz nova chega, e não só quando a snapshot mudar de versão.
    [catalogRows, counterSnapshot, counterSnapshotVersion, matrizesVivas.version, roleVersion],
  );
  const requestedName = decodeURIComponent(params?.name ?? "");
  const item = catalog.find((entry) => normalize(entry.brawler) === normalize(requestedName));
  useEffect(() => {
    setSelectedModeId("global");
  }, [item?.brawler, item?.bestRow.modeId]);
  if (!item) return <div className="app-shell draft-shell brawlers-shell"><main className="brawler-detail-main"><Link href="/brawlers" className="back-link"><ArrowLeft size={16} /> Voltar ao catálogo</Link><h1>Brawler não encontrado</h1></main></div>;

  const image = imageFor(item);
  const planetProfile = brawlPlanetProfileFor(item.brawler);
  const counterModeId = selectedModeId === "global" ? undefined : selectedModeId;

  const rotuloDaVista = (vista: string) =>
    vista === "overall" ? "Geral" : brawlScopeModes.find((modo) => modo.id === vista)?.label ?? vista;

  const vistasComFicha = Object.entries(colagens.data?.feitas ?? {})
    .filter(([, nomes]) => Array.isArray(nomes) && nomes.some((nome) => normalize(nome) === normalize(item.brawler)))
    .map(([vista]) => rotuloDaVista(vista));
  const counterProfiles = getCounterSourceProfiles(item.brawler, counterModeId);
  const prodigyProfile = counterProfiles.find((profile) => profile.source === "PL Prodigy");
  const totalTargets = aggregateCounterRelations(counterProfiles, "targets", item.brawler, counterModeId).length;
  const totalCounteredBy = aggregateCounterRelations(counterProfiles, "counteredBy", item.brawler, counterModeId).length;

  return <div className="app-shell draft-shell brawlers-shell brawler-detail-shell com-barra-no-topo" style={{ backgroundColor: "#0b0e14" }}>
    <div className="app-main">
      <BarraDoSite ativo="brawlers"><a className="refresh-button" href={prodigyProfile?.sourceUrl ?? PL_PRODIGY_URL} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ver PL Prodigy</a></BarraDoSite>
      <main className="brawler-detail-main">
        <div className="brawler-detail-nav"><Link href="/brawlers" className="back-link"><ArrowLeft size={15} /> Voltar a Brawlers & Counters</Link><span className="detail-source-tag"><span className="tiny-live" /> {rankedSync.source === "sse" ? `Ranked SSE · ${rankedSync.version ?? "snapshot"}` : "BrawlScope + PL Prodigy + Brawl Planet"}</span></div>
        <DraftRoleEditor names={[item.brawler]} /><section className="brawler-profile-hero"><div className="profile-hero-image">{image ? <img src={image} alt={item.brawler} /> : <span>{item.brawler.slice(0, 2).toUpperCase()}</span>}</div><div className="profile-hero-copy"><h1>{item.brawler}</h1><div className="profile-hero-tags">{item.isRankedAvailable ? <span className={`brawler-role-pill ${roleClass(item.role)}`}>{draftRoleLabels[item.role]}</span> : <span className="brawler-role-pill is-flex">Fora do Ranked</span>}<span className="profile-tier">{item.isRankedAvailable ? `Tier ${item.bestRow.tier ?? "—"}` : "Aguardando Ranked"}</span><span className="profile-map">{item.isRankedAvailable ? `Melhor registo: ${item.bestRow.map} · ${item.bestRow.mode}` : "Ainda sem métricas por mapa na rotação"}</span></div><p>{item.isRankedAvailable ? "Contra quem ganha, com quem perde e com quem joga bem, como cada fonte publica." : "Sem métricas Ranked publicadas. O perfil não substitui dados de Trophy ou Showdown por dados de Ranked."}</p></div><div className="profile-hero-score"><span>Score Híbrido</span><strong>{item.isRankedAvailable ? score(item.bestRow.score) : "—"}</strong><small>{item.isRankedAvailable ? `Win Rate ${metric(item.winRate)}` : "Win Rate Ranked —"}</small></div></section>
        <section className="profile-metrics"><div><span>Uso</span><strong>{item.isRankedAvailable ? metric(item.usageRate) : "—"}</strong></div><div><span>Vitória</span><strong>{item.isRankedAvailable ? metric(item.winRate) : "—"}</strong></div><div><span>Ganha a</span><strong>{totalTargets}</strong></div><div><span>Perde com</span><strong>{totalCounteredBy}</strong></div></section>
        {/* O modo e as fontes numa linha; antes eram dois cartões de texto. */}
        <section className="ficha-contexto" aria-label="Modo dos counters e sinergias BrawlScope">
          <label className="brawler-opponent-select"><span>Modo</span><select value={selectedModeId} onChange={(event) => setSelectedModeId(event.target.value)}><option value="global">Geral</option>{brawlScopeModes.map((mode) => <option key={mode.modeId} value={mode.modeId}>{mode.label}</option>)}</select><ChevronRight size={14} /></label>
          <div className="source-link-stack" title="Countera e Counterado por juntam as listas do BrawlScope, PL Prodigy e Brawl Planet. Best e Worst Teammates são do Brawl Planet."><a href={BRAWLSCOPE_URL} target="_blank" rel="noreferrer">BrawlScope <ExternalLink size={13} /></a><a href={prodigyProfile?.sourceUrl ?? PL_PRODIGY_URL} target="_blank" rel="noreferrer">PL Prodigy <ExternalLink size={13} /></a><a href={planetProfile?.sourceUrl ?? BRAWL_PLANET_URL} target="_blank" rel="noreferrer">Brawl Planet <ExternalLink size={13} /></a><a href={TOP_BRAWL_URL} target="_blank" rel="noreferrer">TopBrawl <ExternalLink size={13} /></a></div>
        </section>
        <div className="inicio-abas" role="tablist" aria-label="O que ver">
          {([["counters", "Counters"], ["sinergias", "Sinergias"], ["todos", "Contra todos"]] as const).map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? "is-active" : ""} onClick={() => setAba(id)}>{rotulo}</button>
          ))}
        </div>
        {aba === "counters" && <div className="brawler-relation-columns"><CounterSourceGrid item={item} catalog={catalog} direction="targets" modeId={counterModeId} /><CounterSourceGrid item={item} catalog={catalog} direction="counteredBy" modeId={counterModeId} /></div>}
        {aba === "sinergias" && <>
          <BrawlScopeSynergy item={item} catalog={catalog} modeId={counterModeId} />
          <div className="brawler-relation-columns synergies-full"><BestTeammates item={item} catalog={catalog} /><WorstTeammates item={item} catalog={catalog} /></div>
        </>}
        {aba === "todos" && <BrawlScopeMatchupMatrix item={item} catalog={catalog} modeId={counterModeId} vistasComFicha={vistasComFicha} />}
        <section className="profile-build-panel"><div className="build-panel-icon"><Zap size={18} /></div><div><span className="section-kicker">BUILD DE REFERÊNCIA</span><h2>{item.isRankedAvailable ? `Preparação para ${item.bestRow.mode}` : "Ainda sem build Ranked"}</h2><p>{item.isRankedAvailable ? <>Gadget: <strong>{item.build?.gadget}</strong> · Star Power: <strong>{item.build?.starPower}</strong> · Engrenagens: <strong>{item.build?.gears.join(", ")}</strong></> : "O site não cria build, taxa de vitória, uso ou matchups de Ranked antes das fontes publicarem estes dados."}</p></div>{item.isRankedAvailable ? <button type="button" onClick={() => navigate(`/draft?brawler=${encodeURIComponent(item.brawler)}`)}><Swords size={15} /> Usar no Draft</button> : <span className="profile-map">Aguardando elegibilidade Ranked</span>}</section>
      </main>
    </div>
    <MobileNav pathname="/brawlers" />
  </div>;
}
