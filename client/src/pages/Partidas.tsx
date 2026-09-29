import { useMemo, useState } from "react";
import { Database, Search, Swords, Users, UserRound, Handshake } from "lucide-react";
import { BarraDoSite } from "@/components/BarraDoSite";
import { MobileNav } from "@/components/MobileNav";
import { Retrato } from "@/components/Retrato";
import { SeletorDePeriodo } from "@/components/SeletorDePeriodo";
import { trpc } from "@/lib/trpc";
import { allRankedRows } from "@/data/rankedData";
import { additionalBrawlerAssetIds } from "@/data/additionalRankedData";
import { JOGOS_MINIMOS_FIAVEIS, taxaDeUso, taxaDeVitoria } from "@shared/partidasObservadas";
import { RANKS_DO_FILTRO, type IdDoRank } from "@shared/ranksDoRanked";

/**
 * A página «Partidas»: tudo o que o site sabe a partir dos jogos Ranked que
 * recolhe da API oficial — por modo, por mapa e por período.
 *
 * Nada é cortado. Cada brawler, cada confronto 1 contra 1, cada equipa de três
 * e cada par de aliados aparece, com o número de jogos ao lado: abaixo de
 * `JOGOS_MINIMOS_FIAVEIS` a linha fica marcada como amostra pequena, para não
 * se confiar num 100% tirado de dois jogos. As listas longas abrem aos cem de
 * cada vez, só para a página não ficar pesada no telemóvel.
 */

type Separador = "brawlers" | "confrontos" | "equipas" | "sinergias";
type Ordem = "jogos" | "vitoria" | "derrota";

const SEPARADORES: Array<{ id: Separador; label: string; icon: typeof Users }> = [
  { id: "brawlers", label: "Brawlers", icon: UserRound },
  { id: "confrontos", label: "1 contra 1", icon: Swords },
  { id: "equipas", label: "Equipas 3v3", icon: Users },
  { id: "sinergias", label: "Sinergias", icon: Handshake },
];

const DE_CADA_VEZ = 100;

const idsDosBrawlers = new Map<string, number>();
for (const row of allRankedRows) if (row.brawlerId && !idsDosBrawlers.has(row.brawler.toLowerCase())) idsDosBrawlers.set(row.brawler.toLowerCase(), row.brawlerId);

function retratoDe(nome: string) {
  const id = idsDosBrawlers.get(nome.toLowerCase()) ?? additionalBrawlerAssetIds[nome];
  return id ? `https://cdn.brawlify.com/brawlers/borderless/${id}.png` : null;
}

function Cara({ nome }: { nome: string }) {
  return (
    <span className="partidas-cara" title={nome}>
      <Retrato src={retratoDe(nome)} nome={nome} alt="" loading="lazy" />
    </span>
  );
}

function percentagem(valor: number | null) {
  return valor === null ? "—" : `${valor.toFixed(1)}%`;
}

function Vitoria({ jogos, vitorias }: { jogos: number; vitorias: number }) {
  const taxa = taxaDeVitoria({ jogos, vitorias });
  const classe = taxa === null ? "" : taxa >= 55 ? "is-alta" : taxa <= 45 ? "is-baixa" : "";
  return <b className={`partidas-vitoria ${classe}`}>{percentagem(taxa)}</b>;
}

function Jogos({ jogos, vitorias }: { jogos: number; vitorias: number }) {
  return (
    <span className="partidas-jogos">
      {jogos.toLocaleString("pt-PT")} <small>{vitorias}V · {jogos - vitorias}D</small>
      {jogos < JOGOS_MINIMOS_FIAVEIS ? <em className="partidas-amostra">amostra pequena</em> : null}
    </span>
  );
}

function ordenar<T extends { jogos: number; vitorias: number }>(lista: readonly T[], ordem: Ordem) {
  const copia = [...lista];
  if (ordem === "vitoria") copia.sort((a, b) => (taxaDeVitoria(b) ?? 0) - (taxaDeVitoria(a) ?? 0) || b.jogos - a.jogos);
  // Menos vitória primeiro: nas Sinergias são as anti-sinergias, no 1 contra 1 os piores confrontos.
  else if (ordem === "derrota") copia.sort((a, b) => (taxaDeVitoria(a) ?? 0) - (taxaDeVitoria(b) ?? 0) || b.jogos - a.jogos);
  else copia.sort((a, b) => b.jogos - a.jogos || b.vitorias - a.vitorias);
  return copia;
}

function MaisLinhas({ total, mostradas, onMais }: { total: number; mostradas: number; onMais: () => void }) {
  if (mostradas >= total) return null;
  return (
    <button type="button" className="partidas-mais" onClick={onMais}>
      Mostrar mais {Math.min(DE_CADA_VEZ, total - mostradas)} · faltam {(total - mostradas).toLocaleString("pt-PT")}
    </button>
  );
}

export default function Partidas() {
  const [dias, setDias] = useState<number>(30);
  const [mode, setMode] = useState<string>("");
  const [mapId, setMapId] = useState<string>("");
  const [rank, setRank] = useState<IdDoRank | "">("");
  const [separador, setSeparador] = useState<Separador>("brawlers");
  const [ordem, setOrdem] = useState<Ordem>("jogos");
  const [procura, setProcura] = useState("");
  const [soFiaveis, setSoFiaveis] = useState(false);
  const [mostradas, setMostradas] = useState(DE_CADA_VEZ);
  const [escolhido, setEscolhido] = useState<string>("");

  const consulta = trpc.observedMatches.partidas.useQuery(
    { dias, mode: mode || undefined, mapId: mapId || undefined, rank: rank || undefined },
    { staleTime: 120_000, placeholderData: (anterior) => anterior },
  );
  const dados = consulta.data;

  const mapasDoModo = useMemo(() => (dados?.mapas ?? []).filter((mapa) => !mode || mapa.mode === mode), [dados?.mapas, mode]);
  const termo = procura.trim().toLowerCase();
  const passa = (nomes: readonly string[]) => !termo || nomes.some((nome) => nome.toLowerCase().includes(termo));
  const fiavel = (jogos: number) => !soFiaveis || jogos >= JOGOS_MINIMOS_FIAVEIS;

  const brawlers = useMemo(() => ordenar((dados?.brawlers ?? []).filter((linha) => passa([linha.brawler]) && fiavel(linha.jogos)), ordem), [dados?.brawlers, ordem, termo, soFiaveis]);
  const nomesComJogos = useMemo(() => (dados?.brawlers ?? []).map((linha) => linha.brawler).sort((a, b) => a.localeCompare(b)), [dados?.brawlers]);
  const alvo = escolhido && nomesComJogos.includes(escolhido) ? escolhido : dados?.brawlers[0]?.brawler ?? "";
  const confrontos = useMemo(() => ordenar((dados?.confrontos ?? []).filter((linha) => linha.a === alvo && passa([linha.b]) && fiavel(linha.jogos)), ordem), [dados?.confrontos, alvo, ordem, termo, soFiaveis]);
  const equipas = useMemo(() => ordenar((dados?.equipas ?? []).filter((linha) => passa(linha.membros) && fiavel(linha.jogos)), ordem), [dados?.equipas, ordem, termo, soFiaveis]);
  const sinergias = useMemo(() => ordenar((dados?.sinergias ?? []).filter((linha) => passa([linha.a, linha.b]) && fiavel(linha.jogos)), ordem), [dados?.sinergias, ordem, termo, soFiaveis]);

  const mudar = <T,>(definir: (valor: T) => void) => (valor: T) => {
    definir(valor);
    setMostradas(DE_CADA_VEZ);
  };
  const escolherModo = (valor: string) => {
    setMode(valor);
    setMapId("");
    setMostradas(DE_CADA_VEZ);
  };

  const partidas = dados?.partidas ?? 0;
  const nomeDoFiltro = mapId
    ? `${mapasDoModo.find((mapa) => mapa.mapId === mapId)?.nome ?? "Mapa"} · ${mapasDoModo.find((mapa) => mapa.mapId === mapId)?.modoNome ?? ""}`
    : mode
      ? `${dados?.modos.find((modo) => modo.mode === mode)?.nome ?? mode} · todos os mapas`
      : "Todos os modos e mapas";

  return (
    <div className="partidas-pagina">
      <BarraDoSite ativo="partidas" />
      <main className="partidas-main">
        <header className="partidas-cabeca">
          <h1 className="bh-display">Partidas Ranked</h1>
          <p>
            Jogos Ranked reais, lidos da API oficial de 15 em 15 minutos e guardados para sempre. Cada brawler, cada
            confronto, cada equipa e cada par de aliados — sem cortes.
          </p>
          <div className="partidas-resumo">
            <span><Database size={14} aria-hidden="true" /> <b>{partidas.toLocaleString("pt-PT")}</b> partidas</span>
            <span>{nomeDoFiltro}</span>
            {rank ? <span>Rank: {RANKS_DO_FILTRO.find((opcao) => opcao.id === rank)?.nome} · só partidas com rank guardado (desde a v157)</span> : null}
            {dados?.limiteAtingido ? <span className="is-aviso">Mostradas as {partidas.toLocaleString("pt-PT")} mais recentes</span> : null}
          </div>
        </header>

        <section className="partidas-filtros" aria-label="Filtros">
          <SeletorDePeriodo dias={dias} onChange={mudar(setDias)} />
          <div className="partidas-grupo" role="radiogroup" aria-label="Rank">
            <span>Rank</span>
            <button type="button" role="radio" aria-checked={rank === ""} className={rank === "" ? "is-active" : ""} onClick={() => mudar(setRank)("")}>Todos</button>
            {RANKS_DO_FILTRO.map((opcao) => (
              <button key={opcao.id} type="button" role="radio" aria-checked={rank === opcao.id} className={rank === opcao.id ? "is-active" : ""} onClick={() => mudar(setRank)(opcao.id)}>
                {opcao.nome}
              </button>
            ))}
          </div>
          <label className="partidas-seletor">
            <span>Modo</span>
            <select value={mode} onChange={(evento) => escolherModo(evento.target.value)}>
              <option value="">Todos os modos</option>
              {(dados?.modos ?? []).map((modo) => <option key={modo.mode} value={modo.mode}>{modo.nome} ({modo.partidas})</option>)}
            </select>
          </label>
          <label className="partidas-seletor">
            <span>Mapa</span>
            <select value={mapId} onChange={(evento) => mudar(setMapId)(evento.target.value)}>
              <option value="">Todos os mapas</option>
              {mapasDoModo.map((mapa) => <option key={`${mapa.mapId}-${mapa.mode}`} value={mapa.mapId}>{mapa.nome} · {mapa.modoNome} ({mapa.partidas})</option>)}
            </select>
          </label>
        </section>

        <nav className="partidas-separadores" aria-label="O que ver">
          {SEPARADORES.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={separador === id ? "is-active" : ""} aria-pressed={separador === id} onClick={() => mudar(setSeparador)(id)}>
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>

        <div className="partidas-ferramentas">
          <label className="partidas-procura">
            <Search size={15} aria-hidden="true" />
            <input value={procura} onChange={(evento) => mudar(setProcura)(evento.target.value)} placeholder="Procurar brawler…" aria-label="Procurar brawler" />
          </label>
          <div className="partidas-grupo" role="radiogroup" aria-label="Ordenar">
            <span>Ordenar</span>
            <button type="button" role="radio" aria-checked={ordem === "jogos"} className={ordem === "jogos" ? "is-active" : ""} onClick={() => mudar(setOrdem)("jogos")}>Mais jogos</button>
            <button type="button" role="radio" aria-checked={ordem === "vitoria"} className={ordem === "vitoria" ? "is-active" : ""} onClick={() => mudar(setOrdem)("vitoria")}>Mais vitória</button>
            <button type="button" role="radio" aria-checked={ordem === "derrota"} className={ordem === "derrota" ? "is-active" : ""} onClick={() => mudar(setOrdem)("derrota")}>Menos vitória</button>
          </div>
          <label className="partidas-check">
            <input type="checkbox" checked={soFiaveis} onChange={(evento) => mudar(setSoFiaveis)(evento.target.checked)} />
            Só com {JOGOS_MINIMOS_FIAVEIS}+ jogos
          </label>
        </div>

        {consulta.isLoading ? <p className="partidas-vazio">A contar as partidas…</p> : null}
        {consulta.isError ? <p className="partidas-vazio">Não foi possível ler as partidas agora. Tenta daqui a pouco.</p> : null}
        {dados && partidas === 0 ? (
          <p className="partidas-vazio">
            Ainda não há partidas neste filtro. A recolha corre de 15 em 15 minutos e guarda tudo — volta mais tarde, ou escolhe «Tudo» no período.
          </p>
        ) : null}

        {dados && partidas > 0 && separador === "brawlers" ? (
          <section className="partidas-lista" aria-label="Brawlers">
            <div className="partidas-linha is-cabeca"><span>Brawler</span><span>Vitória</span><span>Uso</span><span>Jogos</span></div>
            {brawlers.slice(0, mostradas).map((linha) => (
              <div key={linha.brawler} className={`partidas-linha ${linha.jogos < JOGOS_MINIMOS_FIAVEIS ? "is-pequena" : ""}`}>
                <span className="partidas-nome"><Cara nome={linha.brawler} /> {linha.brawler}</span>
                <Vitoria {...linha} />
                <span className="partidas-uso">{percentagem(taxaDeUso(linha.jogos, partidas))}</span>
                <Jogos {...linha} />
              </div>
            ))}
            <MaisLinhas total={brawlers.length} mostradas={mostradas} onMais={() => setMostradas((n) => n + DE_CADA_VEZ)} />
          </section>
        ) : null}

        {dados && partidas > 0 && separador === "confrontos" ? (
          <section className="partidas-lista" aria-label="1 contra 1">
            <label className="partidas-seletor is-largo">
              <span>Brawler</span>
              <select value={alvo} onChange={(evento) => mudar(setEscolhido)(evento.target.value)}>
                {nomesComJogos.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
              </select>
            </label>
            <p className="partidas-nota">Vitória de <b>{alvo}</b> contra cada adversário que enfrentou, nas partidas deste filtro.</p>
            <div className="partidas-linha is-cabeca"><span>Contra</span><span>Vitória</span><span /><span>Jogos</span></div>
            {confrontos.slice(0, mostradas).map((linha) => (
              <div key={linha.b} className={`partidas-linha ${linha.jogos < JOGOS_MINIMOS_FIAVEIS ? "is-pequena" : ""}`}>
                <span className="partidas-nome"><Cara nome={linha.a} /><small className="partidas-vs">vs</small><Cara nome={linha.b} /> {linha.b}</span>
                <Vitoria {...linha} />
                <span />
                <Jogos {...linha} />
              </div>
            ))}
            <MaisLinhas total={confrontos.length} mostradas={mostradas} onMais={() => setMostradas((n) => n + DE_CADA_VEZ)} />
          </section>
        ) : null}

        {dados && partidas > 0 && separador === "equipas" ? (
          <section className="partidas-lista" aria-label="Equipas 3v3">
            <div className="partidas-linha is-cabeca"><span>Equipa</span><span>Vitória</span><span /><span>Jogos</span></div>
            {equipas.slice(0, mostradas).map((linha) => (
              <div key={linha.membros.join("|")} className={`partidas-linha ${linha.jogos < JOGOS_MINIMOS_FIAVEIS ? "is-pequena" : ""}`}>
                <span className="partidas-nome">{linha.membros.map((nome) => <Cara key={nome} nome={nome} />)} <span className="partidas-trio">{linha.membros.join(" · ")}</span></span>
                <Vitoria {...linha} />
                <span />
                <Jogos {...linha} />
              </div>
            ))}
            <MaisLinhas total={equipas.length} mostradas={mostradas} onMais={() => setMostradas((n) => n + DE_CADA_VEZ)} />
          </section>
        ) : null}

        {dados && partidas > 0 && separador === "sinergias" ? (
          <section className="partidas-lista" aria-label="Sinergias">
            <p className="partidas-nota">
              Dois brawlers na mesma equipa: quantas vezes jogaram juntos e quanto ganharam. Com «Menos vitória» vês as
              <b> anti-sinergias</b> — pares que ganham pouco juntos e é melhor não pôr na mesma equipa.
            </p>
            <div className="partidas-linha is-cabeca"><span>Par</span><span>Vitória</span><span /><span>Jogos</span></div>
            {sinergias.slice(0, mostradas).map((linha) => (
              <div key={`${linha.a}|${linha.b}`} className={`partidas-linha ${linha.jogos < JOGOS_MINIMOS_FIAVEIS ? "is-pequena" : ""}`}>
                <span className="partidas-nome"><Cara nome={linha.a} /><Cara nome={linha.b} /> {linha.a} + {linha.b}</span>
                <Vitoria {...linha} />
                <span />
                <Jogos {...linha} />
              </div>
            ))}
            <MaisLinhas total={sinergias.length} mostradas={mostradas} onMais={() => setMostradas((n) => n + DE_CADA_VEZ)} />
          </section>
        ) : null}
      </main>
      <MobileNav pathname="/partidas" />
    </div>
  );
}
