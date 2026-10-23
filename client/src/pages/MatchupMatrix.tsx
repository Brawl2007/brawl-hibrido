import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Handshake, Search, Shield, Swords, Target, Users } from "lucide-react";
import { BarraDoSite } from "@/components/BarraDoSite";
import { MobileNav } from "@/components/MobileNav";
import { Retrato } from "@/components/Retrato";
import { BotaoApiOficial } from "@/components/BotaoApiOficial";
import { SeletorDePeriodo } from "@/components/SeletorDePeriodo";
import { SeletorDeRank } from "@/components/SeletorDeRank";
import { useApiOficial } from "@/hooks/useApiOficial";
import { useCounterSync } from "@/contexts/CounterSyncContext";
import { useRankedSync } from "@/contexts/RankedSyncContext";
import { trpc } from "@/lib/trpc";
import { CORES_DOS_MODOS, nomeBonito, retratoDe } from "@/lib/visualDasPartidas";
import { allRankedRows } from "@/data/rankedData";
import { buildBrawlerCatalog } from "@shared/brawlerCatalog";
import { brawlScopeModes } from "@shared/brawlScopeModes";
import { formatMatchupPercent } from "@shared/counterMatchupValue";
import { JOGOS_MINIMOS_FIAVEIS, NOMES_DOS_MODOS } from "@shared/partidasObservadas";
import { RANKS_DO_FILTRO } from "@shared/ranksDoRanked";
import { fichaDasFontes } from "@shared/fichaDasFontes";
import type { ConfrontoDaFicha, EquipaDaFicha } from "@shared/fichaDaApi";

/**
 * A Matriz 1v1, desenhada como a ficha de counters do BrawlScope.
 *
 * Com o botão «API oficial» ligado (o mesmo do Draft e dos Mapas), tudo sai
 * das partidas Ranked que o site recolhe: quem countera o brawler, quem ele
 * castiga, com quem joga melhor em dupla e em trio, onde ganha, e a lista de
 * todos os confrontos — por modo, por mapa (ou a soma de todos), por rank e
 * por período. Os números são os medidos: «66% contra ele vs 50% habitual».
 *
 * Desligado, a mesma ficha sai das fontes (BrawlScope, PL Prodigy, Brawl
 * Planet), com os pesos que o Draft usa. As fontes não publicam trios nem
 * contagens de jogos; a página di-lo em vez de inventar.
 */

const MODOS_DA_API = ["gemgrab", "brawlball", "heist", "bounty", "hotzone", "knockout"] as const;
const LISTA_INICIAL = 24;

/** O modo como as fontes o escrevem («gemGrab»), a partir do da API («gemgrab»). */
function modoDasFontes(modo: string) {
  return brawlScopeModes.find((entrada) => entrada.id.toLowerCase() === modo)?.id;
}

function sinal(valor: number | null, casas = 1) {
  if (valor === null) return "—";
  return `${valor > 0 ? "+" : ""}${valor.toFixed(casas)}`;
}

function Cara({ nome, tamanho = "media" }: { nome: string; tamanho?: "pequena" | "media" | "grande" }) {
  return (
    <span className={`matriz-cara is-${tamanho}`} title={nomeBonito(nome)}>
      <Retrato src={retratoDe(nome)} nome={nomeBonito(nome)} alt="" loading="lazy" />
    </span>
  );
}

function rotuloDoCounter(delta: number) {
  return delta >= 10 ? "Counter forte" : delta >= 5 ? "Counter" : "Ligeiro";
}
function rotuloDoCastigo(delta: number) {
  return delta <= -10 ? "Muito castigado" : delta <= -5 ? "Castigado" : "Ligeiro";
}
function rotuloDaEquipa(delta: number) {
  return delta >= 7 ? "Muito forte" : delta >= 3 ? "Boa" : "Ligeira";
}

/** Uma linha de confronto da API: taxa do adversário contra ele vs a habitual. */
function LinhaDeConfronto({ linha, posicao, tipo }: { linha: ConfrontoDaFicha; posicao: number; tipo: "counter" | "castiga" }) {
  const delta = linha.delta ?? 0;
  return (
    <li className={`matriz-linha is-${tipo}`}>
      <span className="matriz-posicao">{posicao}</span>
      <Cara nome={linha.adversario} />
      <span className="matriz-linha-corpo">
        <span className="matriz-linha-topo">
          <strong>{nomeBonito(linha.adversario)}</strong>
          <em className="matriz-etiqueta">{tipo === "counter" ? rotuloDoCounter(delta) : rotuloDoCastigo(delta)}</em>
          <b className="matriz-delta">{sinal(linha.delta)}</b>
        </span>
        <span className="matriz-barra" aria-hidden="true">
          <span className="matriz-barra-habitual" style={{ left: `${linha.habitual ?? 50}%` }} />
          <span className="matriz-barra-taxa" style={{ width: `${Math.max(2, Math.min(100, linha.taxa))}%` }} />
        </span>
        <small>
          {linha.taxa.toFixed(1)}% vs {(linha.habitual ?? 0).toFixed(1)}% habitual · {linha.jogos.toLocaleString("pt-PT")} batalhas
          {linha.jogos < JOGOS_MINIMOS_FIAVEIS ? <em className="matriz-amostra"> · amostra pequena</em> : null}
        </small>
      </span>
    </li>
  );
}

function LinhaDeEquipa({ linha, posicao, base }: { linha: EquipaDaFicha; posicao: number; base: number | null }) {
  const delta = linha.delta ?? 0;
  return (
    <li className="matriz-linha is-equipa">
      <span className="matriz-posicao">{posicao}</span>
      <span className="matriz-caras">{linha.aliados.map((nome) => <Cara key={nome} nome={nome} />)}</span>
      <span className="matriz-linha-corpo">
        <span className="matriz-linha-topo">
          <strong>{linha.aliados.map(nomeBonito).join(" + ")}</strong>
          <em className="matriz-etiqueta">{rotuloDaEquipa(delta)}</em>
          <b className="matriz-delta">{sinal(linha.delta)}</b>
        </span>
        <span className="matriz-barra" aria-hidden="true">
          <span className="matriz-barra-habitual" style={{ left: `${base ?? 50}%` }} />
          <span className="matriz-barra-taxa" style={{ width: `${Math.max(2, Math.min(100, linha.taxa))}%` }} />
        </span>
        <small>
          {linha.taxa.toFixed(1)}% vs {(base ?? 0).toFixed(1)}% habitual · {linha.jogos.toLocaleString("pt-PT")} batalhas
          {linha.jogos < JOGOS_MINIMOS_FIAVEIS ? <em className="matriz-amostra"> · amostra pequena</em> : null}
        </small>
      </span>
    </li>
  );
}

/**
 * Uma linha das fontes: o valor que o Draft usa, com o que cada fonte deu.
 * Nos confrontos o valor já vem do lado do adversário (`fichaDasFontes`), como
 * na API e no BrawlScope: positivo = counter, negativo = é castigado.
 */
function LinhaDasFontes({ nome, valor, texto, posicao, tipo }: { nome: string; valor: number | null; texto: string; posicao: number; tipo: "counter" | "castiga" | "equipa" }) {
  return (
    <li className={`matriz-linha is-${tipo}`}>
      <span className="matriz-posicao">{posicao}</span>
      <Cara nome={nome} />
      <span className="matriz-linha-corpo">
        <span className="matriz-linha-topo">
          <strong>{nomeBonito(nome)}</strong>
          <b className="matriz-delta">{valor === null ? "—" : formatMatchupPercent(valor)}</b>
        </span>
        <small>{texto}</small>
      </span>
    </li>
  );
}

export default function MatchupMatrix() {
  useCounterSync();
  const rankedSync = useRankedSync();
  const api = useApiOficial();
  const catalogo = useMemo(() => buildBrawlerCatalog(allRankedRows).map((item) => item.brawler).sort((a, b) => a.localeCompare(b, "pt-PT")), []);

  const [brawler, setBrawler] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("b") || localStorage.getItem("matriz-brawler") || "Sprout";
    } catch {
      return "Sprout";
    }
  });
  const [modo, setModo] = useState<string>("");
  const [mapId, setMapId] = useState<string>("");
  const [procuraDoBrawler, setProcuraDoBrawler] = useState("");
  const procuraRef = useRef<HTMLInputElement>(null);
  const faixaRef = useRef<HTMLDivElement>(null);
  const [procura, setProcura] = useState("");
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("matriz-brawler", brawler);
    } catch {
      // Sem armazenamento: só nesta visita.
    }
  }, [brawler]);

  const consulta = trpc.observedMatches.ficha.useQuery(
    { brawler, dias: api.dias, mode: modo || undefined, mapId: mapId || undefined, rank: api.rank || undefined },
    { enabled: api.ligada, staleTime: 120_000, placeholderData: (anterior) => anterior },
  );
  const dados = api.ligada ? consulta.data : undefined;
  const ficha = dados?.ficha;

  // Fontes: os mesmos confrontos do Draft, com os pesos; e as duplas do BrawlScope.
  const fontes = useMemo(
    () => (api.ligada ? null : fichaDasFontes(brawler, catalogo, modo ? modoDasFontes(modo) : undefined)),
    [api.ligada, brawler, catalogo, modo],
  );
  // Vitória e uso médios nas fontes, em todos os mapas do modo (ou de todos os modos).
  const mediaDasFontes = useMemo(() => {
    if (api.ligada) return null;
    const modoDasLinhas = modo ? brawlScopeModes.find((entrada) => entrada.id.toLowerCase() === modo)?.modeId : undefined;
    const linhas = (rankedSync.snapshot?.rows ?? allRankedRows).filter((linha) =>
      linha.brawler.toLowerCase() === brawler.toLowerCase() && (!modoDasLinhas || linha.modeId === modoDasLinhas));
    const media = (valores: Array<number | null | undefined>) => {
      const bons = valores.filter((valor): valor is number => typeof valor === "number" && Number.isFinite(valor));
      return bons.length ? bons.reduce((soma, valor) => soma + valor, 0) / bons.length : null;
    };
    return { vitoria: media(linhas.map((linha) => linha.winRate)), uso: media(linhas.map((linha) => linha.usage)), mapas: linhas.length };
  }, [api.ligada, rankedSync.snapshot?.rows, brawler, modo]);

  /**
   * Todos os brawlers, sempre à vista numa faixa com os retratos. Com a API
   * ligada vêm primeiro os mais jogados no filtro; sem ela, por ordem alfabética.
   */
  const nomesParaEscolher = useMemo(() => {
    const jogos = new Map((dados?.brawlers ?? []).map((linha) => [nomeBonito(linha.brawler).toLowerCase(), linha.jogos]));
    const todos = Array.from(new Set([...catalogo, ...(dados?.brawlers ?? []).map((linha) => nomeBonito(linha.brawler))]))
      .sort((a, b) => (jogos.get(b.toLowerCase()) ?? 0) - (jogos.get(a.toLowerCase()) ?? 0) || a.localeCompare(b, "pt-PT"));
    const termo = procuraDoBrawler.trim().toLowerCase();
    return termo ? todos.filter((nome) => nome.toLowerCase().includes(termo)) : todos;
  }, [catalogo, dados?.brawlers, procuraDoBrawler]);
  const jogosDe = useMemo(() => new Map((dados?.brawlers ?? []).map((linha) => [nomeBonito(linha.brawler).toLowerCase(), linha.jogos])), [dados?.brawlers]);
  // O escolhido fica no meio da faixa, sem mexer no resto da página.
  useEffect(() => {
    const faixa = faixaRef.current;
    const ativo = faixa?.querySelector<HTMLElement>(".is-active");
    if (faixa && ativo) faixa.scrollTo({ left: ativo.offsetLeft - faixa.clientWidth / 2 + ativo.clientWidth / 2, behavior: "smooth" });
  }, [brawler, nomesParaEscolher]);
  const irParaAProcura = () => {
    procuraRef.current?.focus();
    procuraRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const mapasDoModo = useMemo(() => (dados?.mapas ?? []).filter((mapa) => !modo || mapa.mode === modo), [dados?.mapas, modo]);
  const escolherModo = (novo: string) => {
    setModo(novo);
    setMapId("");
  };
  const escolherMapa = (novo: string) => {
    setMapId(novo);
    const mapa = dados?.mapas.find((entrada) => entrada.mapId === novo);
    if (mapa) setModo(mapa.mode);
  };

  const termo = procura.trim().toLowerCase();
  const todosDaApi = useMemo(
    () => (ficha?.confrontos ?? []).filter((linha) => !termo || linha.adversario.toLowerCase().includes(termo)),
    [ficha?.confrontos, termo],
  );
  const todosDasFontes = useMemo(
    () => (fontes?.confrontos ?? []).filter((linha) => !termo || linha.adversario.toLowerCase().includes(termo)),
    [fontes?.confrontos, termo],
  );
  const totalDaLista = api.ligada ? todosDaApi.length : todosDasFontes.length;
  const mostrar = verTodos || termo ? totalDaLista : LISTA_INICIAL;

  const nome = nomeBonito(ficha?.brawler ?? brawler);
  const modoAtivo = modo ? NOMES_DOS_MODOS[modo] ?? modo : "todos os modos";
  const mapaAtivo = mapId ? dados?.mapas.find((mapa) => mapa.mapId === mapId)?.nome : null;
  const rankAtivo = api.rank ? RANKS_DO_FILTRO.find((opcao) => opcao.id === api.rank)?.nome : "todos os ranks";

  return (
    <>
      <BarraDoSite ativo="matriz" />
      <main className="matriz-pagina">
        <header className="matriz-cabeca">
          <div>
            <h1 className="bh-display">Matriz 1v1</h1>
            <p>Quem countera cada brawler, quem ele castiga e com quem joga melhor — em dupla e em trio.</p>
          </div>
          <div className="matriz-fonte">
            <BotaoApiOficial ligada={api.ligada} onAlternar={api.alternar} />
            <span className="mesa-fonte-api-nota">
              {api.ligada
                ? "Partidas Ranked da API da Supercell (o mesmo botão do Draft e dos Mapas)."
                : "Fontes: BrawlScope, PL Prodigy e Brawl Planet, com os pesos do Draft."}
            </span>
          </div>
        </header>

        <section className="matriz-filtros" aria-label="Filtros">
          <div className="matriz-modos" role="radiogroup" aria-label="Modo">
            <button type="button" role="radio" aria-checked={!modo} className={!modo ? "is-active" : ""} onClick={() => escolherModo("")}>Todos</button>
            {MODOS_DA_API.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={modo === id} className={modo === id ? "is-active" : ""} style={{ ["--cor-do-modo" as string]: CORES_DOS_MODOS[id] }} onClick={() => escolherModo(id)}>
                <i aria-hidden="true" /> {NOMES_DOS_MODOS[id]}
              </button>
            ))}
          </div>
          {api.ligada ? (
            <div className="matriz-filtros-api">
              <SeletorDeRank rank={api.rank} onChange={api.setRank} />
              <SeletorDePeriodo dias={api.dias} onChange={api.setDias} />
              <label className="matriz-mapa">
                <span>Mapa</span>
                <select value={mapId} onChange={(evento) => escolherMapa(evento.target.value)} aria-label="Mapa">
                  <option value="">Todos os mapas (soma)</option>
                  {mapasDoModo.map((mapa) => (
                    <option key={mapa.mapId} value={mapa.mapId}>{mapa.nome} · {mapa.modoNome} · {mapa.partidas} partidas</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </section>

        <section className="matriz-escolher" aria-label="Escolher brawler">
          <div className="matriz-escolher-topo">
            <h2 className="matriz-titulo">Escolhe o brawler <small>{nomesParaEscolher.length}</small></h2>
            <label className="matriz-procura">
              <Search size={15} aria-hidden="true" />
              <input ref={procuraRef} value={procuraDoBrawler} onChange={(evento) => setProcuraDoBrawler(evento.target.value)} placeholder="Procurar brawler…" aria-label="Procurar brawler" />
            </label>
          </div>
          <div className="matriz-faixa" ref={faixaRef} role="listbox" aria-label="Brawlers">
            {nomesParaEscolher.map((opcao) => {
              const escolhido = opcao.toLowerCase() === brawler.toLowerCase();
              const jogos = jogosDe.get(opcao.toLowerCase());
              return (
                <button key={opcao} type="button" role="option" aria-selected={escolhido} className={escolhido ? "is-active" : ""} onClick={() => { setBrawler(opcao); setVerTodos(false); }} title={jogos ? `${opcao} · ${jogos} jogos` : opcao}>
                  <Cara nome={opcao} tamanho="pequena" />
                  <span>{opcao}</span>
                </button>
              );
            })}
            {!nomesParaEscolher.length ? <p className="matriz-vazio">Nenhum brawler com «{procuraDoBrawler}».</p> : null}
          </div>
        </section>

        <section className="matriz-cartao" aria-label={`Ficha de ${nome}`}>
          <div className="matriz-cartao-topo">
            <button type="button" className="matriz-retrato-grande" onClick={irParaAProcura} title="Escolher outro brawler">
              <Cara nome={ficha?.brawler ?? brawler} tamanho="grande" />
            </button>
            <div className="matriz-identidade">
              <h2 className="bh-display">{nome}</h2>
              <button type="button" className="matriz-trocar" onClick={irParaAProcura}>
                <Search size={13} aria-hidden="true" /> Trocar brawler
              </button>
              <p>
                {api.ligada
                  ? ficha?.encontrado
                    ? <>Lido contra {ficha.confrontos.filter((linha) => linha.jogos >= JOGOS_MINIMOS_FIAVEIS).length} brawlers com amostra de {JOGOS_MINIMOS_FIAVEIS}+ jogos · {modoAtivo}{mapaAtivo ? ` · ${mapaAtivo}` : " · todos os mapas"} · {rankAtivo}</>
                    : consulta.isLoading ? "A ler as partidas…" : <>Ainda sem partidas de {nome} neste filtro ({modoAtivo}{mapaAtivo ? ` · ${mapaAtivo}` : ""} · {rankAtivo}).</>
                  : <>Média de {mediaDasFontes?.mapas ?? 0} mapas das fontes · {modoAtivo}</>}
              </p>
            </div>
            <div className="matriz-numeros">
              <div>
                <span>Vitória</span>
                <strong className="is-vitoria">{api.ligada ? (ficha?.taxa === null || ficha?.taxa === undefined ? "—" : `${ficha.taxa.toFixed(1)}%`) : mediaDasFontes?.vitoria === null || mediaDasFontes?.vitoria === undefined ? "—" : `${mediaDasFontes.vitoria.toFixed(1)}%`}</strong>
                <small>{api.ligada && ficha?.taxa !== null && ficha?.taxa !== undefined ? `${sinal(ficha.taxa - 50)} vs 50%` : "média das fontes"}</small>
              </div>
              <div>
                <span>Uso</span>
                <strong className="is-uso">{api.ligada ? (ficha?.uso === null || ficha?.uso === undefined ? "—" : `${ficha.uso.toFixed(1)}%`) : mediaDasFontes?.uso === null || mediaDasFontes?.uso === undefined ? "—" : `${mediaDasFontes.uso.toFixed(1)}%`}</strong>
                <small>{api.ligada ? "das partidas" : "média das fontes"}</small>
              </div>
              <div>
                <span>Jogos</span>
                <strong>{api.ligada ? (ficha?.jogos ?? 0).toLocaleString("pt-PT") : "—"}</strong>
                <small>{api.ligada ? `de ${(ficha?.partidas ?? 0).toLocaleString("pt-PT")} partidas` : "as fontes não publicam"}</small>
              </div>
            </div>
          </div>

          <div className="matriz-resumo">
            <div>
              <h3>Countera-o</h3>
              <div className="matriz-caras">
                {(api.ligada ? (ficha?.counters ?? []).map((linha) => linha.adversario) : (fontes?.counters ?? []).map((linha) => linha.adversario)).slice(0, 3).map((nomeDoCounter) => <Cara key={nomeDoCounter} nome={nomeDoCounter} />)}
              </div>
            </div>
            <div>
              <h3>Castiga</h3>
              <div className="matriz-caras">
                {(api.ligada ? (ficha?.castiga ?? []).map((linha) => linha.adversario) : (fontes?.castiga ?? []).map((linha) => linha.adversario)).slice(0, 3).map((nomeDoCastigado) => <Cara key={nomeDoCastigado} nome={nomeDoCastigado} />)}
              </div>
            </div>
            <div>
              <h3>Joga bem com</h3>
              <div className="matriz-caras">
                {(api.ligada ? (ficha?.melhoresDuplas ?? []).map((linha) => linha.aliados[0]) : (fontes?.duplas ?? []).map((linha) => linha.aliado)).slice(0, 3).map((aliado) => <Cara key={aliado} nome={aliado} />)}
              </div>
            </div>
          </div>
        </section>

        {api.ligada && ficha?.porModo.length ? (
          <section className="matriz-seccao" aria-label={`Onde ${nome} ganha`}>
            <h2 className="matriz-titulo">Onde {nome} ganha</h2>
            <div className="matriz-modos-cartoes">
              {ficha.porModo.map((entrada) => (
                <button
                  key={entrada.mode}
                  type="button"
                  className={`matriz-modo-cartao ${modo === entrada.mode ? "is-active" : ""} ${entrada.taxa >= 52 ? "is-bom" : entrada.taxa <= 48 ? "is-mau" : ""}`}
                  style={{ ["--cor-do-modo" as string]: CORES_DOS_MODOS[entrada.mode] ?? "var(--bh-gold)" }}
                  onClick={() => escolherModo(entrada.mode)}
                >
                  <span className="matriz-modo-nome"><i aria-hidden="true" /> {entrada.nome}</span>
                  <strong>{entrada.taxa.toFixed(1)}%</strong>
                  <span className="matriz-barra" aria-hidden="true">
                    <span className="matriz-barra-habitual" style={{ left: "50%" }} />
                    <span className="matriz-barra-taxa" style={{ width: `${Math.max(2, Math.min(100, entrada.taxa))}%` }} />
                  </span>
                  <small>{entrada.jogos.toLocaleString("pt-PT")} jogos · {entrada.parteDosJogos.toFixed(0)}% dos jogos dele</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="matriz-colunas">
          <div className="matriz-coluna">
            <h2 className="matriz-titulo"><Shield size={15} aria-hidden="true" /> Counters de {nome}</h2>
            <p className="matriz-explica">{api.ligada ? "Vantagem ajustada por força no mapa, amostra, elo e idade dos jogos." : "Levam vantagem sobre ele nas fontes."}</p>
            <ol className="matriz-lista">
              {api.ligada
                ? (ficha?.counters ?? []).map((linha, i) => <LinhaDeConfronto key={linha.adversario} linha={linha} posicao={i + 1} tipo="counter" />)
                : (fontes?.counters ?? []).map((linha, i) => <LinhaDasFontes key={linha.adversario} nome={linha.adversario} valor={linha.valor} texto={linha.texto} posicao={i + 1} tipo="counter" />)}
            </ol>
            {api.ligada && ficha && !ficha.counters.length ? <p className="matriz-vazio">Ainda sem counters com {10}+ jogos neste filtro.</p> : null}
          </div>
          <div className="matriz-coluna">
            <h2 className="matriz-titulo"><Swords size={15} aria-hidden="true" /> {nome} castiga</h2>
            <p className="matriz-explica">{api.ligada ? "Desvantagem residual após descontar a força individual dos brawlers." : "Ele leva vantagem sobre eles nas fontes."}</p>
            <ol className="matriz-lista">
              {api.ligada
                ? (ficha?.castiga ?? []).map((linha, i) => <LinhaDeConfronto key={linha.adversario} linha={linha} posicao={i + 1} tipo="castiga" />)
                : (fontes?.castiga ?? []).map((linha, i) => <LinhaDasFontes key={linha.adversario} nome={linha.adversario} valor={linha.valor} texto={linha.texto} posicao={i + 1} tipo="castiga" />)}
            </ol>
            {api.ligada && ficha && !ficha.castiga.length ? <p className="matriz-vazio">Ainda sem brawlers castigados com {10}+ jogos neste filtro.</p> : null}
          </div>
          <div className="matriz-coluna">
            <h2 className="matriz-titulo"><Handshake size={15} aria-hidden="true" /> Duplas com {nome}</h2>
            <p className="matriz-explica">{api.ligada ? "Na mesma equipa, ganham mais do que ele costuma ganhar." : "O «Pair with» do BrawlScope."}</p>
            <ol className="matriz-lista">
              {api.ligada
                ? (ficha?.melhoresDuplas ?? []).map((linha, i) => <LinhaDeEquipa key={linha.aliados.join("+")} linha={linha} posicao={i + 1} base={ficha?.taxa ?? null} />)
                : (fontes?.duplas ?? []).map((linha, i) => <LinhaDasFontes key={linha.aliado} nome={linha.aliado} valor={linha.delta} texto="BrawlScope · Pair with" posicao={i + 1} tipo="equipa" />)}
            </ol>
            {api.ligada && ficha && !ficha.melhoresDuplas.length ? <p className="matriz-vazio">Ainda sem duplas com {10}+ jogos neste filtro.</p> : null}
            {!api.ligada && fontes && !fontes.duplas.length ? <p className="matriz-vazio">O BrawlScope ainda não tem o «Pair with» de {nome} neste modo.</p> : null}
          </div>
        </section>

        <section className="matriz-seccao" aria-label={`Trios com ${nome}`}>
          <h2 className="matriz-titulo"><Users size={15} aria-hidden="true" /> Trios com {nome}</h2>
          {api.ligada ? (
            <>
              <p className="matriz-explica">As equipas de três com maior sinergia ajustada, descontando a força individual e as duplas.</p>
              <ol className="matriz-lista matriz-lista-larga">
                {(ficha?.melhoresTrios ?? []).map((linha, i) => <LinhaDeEquipa key={linha.aliados.join("+")} linha={linha} posicao={i + 1} base={ficha?.taxa ?? null} />)}
              </ol>
              {ficha && !ficha.melhoresTrios.length ? <p className="matriz-vazio">Ainda sem trios com {10}+ jogos neste filtro — aparecem à medida que a recolha junta partidas.</p> : null}
            </>
          ) : (
            <p className="matriz-vazio">As fontes não publicam trios. Liga «API oficial» para ver os trios medidos nas partidas Ranked.</p>
          )}
        </section>

        <section className="matriz-seccao" aria-label="Todos os confrontos">
          <div className="matriz-todos-cabeca">
            <h2 className="matriz-titulo"><Target size={15} aria-hidden="true" /> Todos os confrontos <small>{totalDaLista}</small></h2>
            <label className="matriz-procura">
              <Search size={15} aria-hidden="true" />
              <input value={procura} onChange={(evento) => setProcura(evento.target.value)} placeholder="Procurar adversário" aria-label="Procurar adversário" />
            </label>
          </div>
          <p className="matriz-explica">
            {api.ligada
              ? `Cada adversário que ${nome} enfrentou, o counter mais forte primeiro. Os mesmos números das listas de cima, todos.`
              : `Cada adversário, pelo valor que o Draft usa (BrawlScope com as confirmações do PL Prodigy e do Brawl Planet).`}
          </p>
          <ol className="matriz-lista matriz-lista-larga">
            {api.ligada
              ? todosDaApi.slice(0, mostrar).map((linha, i) => <LinhaDeConfronto key={linha.adversario} linha={linha} posicao={i + 1} tipo={(linha.delta ?? 0) >= 0 ? "counter" : "castiga"} />)
              : todosDasFontes.slice(0, mostrar).map((linha, i) => <LinhaDasFontes key={linha.adversario} nome={linha.adversario} valor={linha.valor} texto={linha.texto} posicao={i + 1} tipo={linha.valor >= 0 ? "counter" : "castiga"} />)}
          </ol>
          {!verTodos && !termo && totalDaLista > LISTA_INICIAL ? (
            <button type="button" className="ver-todos" onClick={() => setVerTodos(true)}>Ver todos ({totalDaLista})</button>
          ) : null}
        </section>

        <footer className="matriz-metodo">
          <Database size={15} aria-hidden="true" />
          <p>
            <strong>Como ler:</strong> as barras mostram a vitória medida contra {nome} e a habitual. O destaque mostra o efeito puro ajustado por força individual, qualidade, idade e volume da amostra. Nas duplas e trios também se desconta a força dos membros; uma vitória alta com poucos jogos não basta para indicar sinergia.
            A ordem desconta as amostras pequenas; o número mostrado é o medido.
          </p>
        </footer>
      </main>
      <MobileNav pathname="/matchups" />
    </>
  );
}
