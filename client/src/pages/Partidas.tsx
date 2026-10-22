import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Database, Handshake, Search, Swords, UserRound, Users } from "lucide-react";
import { BarraDoSite } from "@/components/BarraDoSite";
import { MobileNav } from "@/components/MobileNav";
import { Retrato } from "@/components/Retrato";
import { SeletorDePeriodo } from "@/components/SeletorDePeriodo";
import { trpc } from "@/lib/trpc";
import { mapImageFor } from "@/lib/imagemDoMapa";
import { CORES_DOS_MODOS, retratoDe } from "@/lib/visualDasPartidas";
import { JOGOS_MINIMOS_FIAVEIS, taxaDeUso, taxaDeVitoria } from "@shared/partidasObservadas";
import { SeletorDeRank } from "@/components/SeletorDeRank";
import { RANKS_DO_FILTRO } from "@shared/ranksDoRanked";
import { useApiOficial } from "@/hooks/useApiOficial";
import { EstadoDaRecolha } from "@/components/EstadoDaRecolha";

/**
 * A página «Partidas»: tudo o que o site sabe a partir dos jogos Ranked que
 * recolhe da API oficial — por modo, por mapa, por rank e por período.
 *
 * O desenho segue o do TopBrawl, que é o que quem joga já conhece: ao lado,
 * os mapas com a imagem, agrupados por modo; ao centro a tabela do mapa
 * escolhido, com os retratos, e o cabeçalho a dizer em quantas partidas se
 * baseia e quando foi atualizado. As colunas ordenam-se a carregar nelas.
 *
 * Nada é cortado. Cada brawler, cada confronto 1 contra 1, cada equipa de três
 * e cada par de aliados aparece, com o número de jogos ao lado: abaixo de
 * `JOGOS_MINIMOS_FIAVEIS` a linha fica marcada como amostra pequena. As listas
 * longas abrem aos cem de cada vez, só para a página não pesar no telemóvel.
 */

type Separador = "brawlers" | "confrontos" | "equipas" | "sinergias";
type Coluna = "vitoria" | "uso" | "jogos";

const SEPARADORES: Array<{ id: Separador; label: string; icon: typeof Users }> = [
  { id: "brawlers", label: "Brawlers", icon: UserRound },
  { id: "confrontos", label: "1 contra 1", icon: Swords },
  { id: "equipas", label: "Equipas 3v3", icon: Users },
  { id: "sinergias", label: "Sinergias", icon: Handshake },
];

const DE_CADA_VEZ = 100;

function Cara({ nome, grande = false }: { nome: string; grande?: boolean }) {
  return (
    <span className={`partidas-cara ${grande ? "is-grande" : ""}`} title={nome}>
      <Retrato src={retratoDe(nome)} nome={nome} alt="" loading="lazy" />
    </span>
  );
}

function percentagem(valor: number | null) {
  return valor === null ? "—" : valor.toFixed(2);
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

function ordenar<T extends { jogos: number; vitorias: number }>(lista: readonly T[], coluna: Coluna, descendente: boolean) {
  const valor = (linha: T) => coluna === "vitoria" ? taxaDeVitoria(linha) ?? 0 : linha.jogos;
  return [...lista].sort((a, b) => (descendente ? valor(b) - valor(a) : valor(a) - valor(b)) || b.jogos - a.jogos);
}

function MaisLinhas({ total, mostradas, onMais }: { total: number; mostradas: number; onMais: () => void }) {
  if (mostradas >= total) return null;
  return (
    <button type="button" className="partidas-mais" onClick={onMais}>
      Mostrar mais {Math.min(DE_CADA_VEZ, total - mostradas)} · faltam {(total - mostradas).toLocaleString("pt-PT")}
    </button>
  );
}

function Cabecalho({ rotulo, coluna, ativa, descendente, onOrdenar }: { rotulo: string; coluna: Coluna; ativa: Coluna; descendente: boolean; onOrdenar: (coluna: Coluna) => void }) {
  const escolhida = ativa === coluna;
  return (
    <button type="button" className={`partidas-ordem ${escolhida ? "is-active" : ""}`} onClick={() => onOrdenar(coluna)} aria-pressed={escolhida} title="Carrega para ordenar; outra vez para inverter">
      {rotulo}
      {escolhida ? (descendente ? <ArrowDown size={13} aria-hidden="true" /> : <ArrowUp size={13} aria-hidden="true" />) : null}
    </button>
  );
}

export default function Partidas() {
  // O período e o rank são os do site todo (`useApiOficial`): os mesmos do Draft, dos Mapas e da Matriz.
  const { dias, setDias, rank, setRank } = useApiOficial();
  const [mode, setMode] = useState<string>("");
  const [mapId, setMapId] = useState<string>("");
  const [separador, setSeparador] = useState<Separador>("brawlers");
  const [coluna, setColuna] = useState<Coluna>("vitoria");
  const [descendente, setDescendente] = useState(true);
  const [procura, setProcura] = useState("");
  const [soFiaveis, setSoFiaveis] = useState(false);
  const [mostradas, setMostradas] = useState(DE_CADA_VEZ);
  const [escolhido, setEscolhido] = useState<string>("");

  const consulta = trpc.observedMatches.partidas.useQuery(
    { dias, mode: mode || undefined, mapId: mapId || undefined, rank: rank || undefined },
    { staleTime: 120_000, refetchInterval: 180_000, refetchIntervalInBackground: false },
  );
  const dados = consulta.isError ? undefined : consulta.data;
  const recolha = trpc.observedMatches.status.useQuery(undefined, {
    staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false,
  });

  const termo = procura.trim().toLowerCase();
  const passa = (nomes: readonly string[]) => !termo || nomes.some((nome) => nome.toLowerCase().includes(termo));
  const fiavel = (jogos: number) => !soFiaveis || jogos >= JOGOS_MINIMOS_FIAVEIS;
  const partidas = dados?.partidas ?? 0;
  // O uso é proporcional aos jogos, por isso ordenar por uso é ordenar por jogos.
  const colunaReal: Coluna = coluna === "uso" ? "jogos" : coluna;

  const brawlers = useMemo(() => ordenar((dados?.brawlers ?? []).filter((linha) => passa([linha.brawler]) && fiavel(linha.jogos)), colunaReal, descendente), [dados?.brawlers, colunaReal, descendente, termo, soFiaveis]);
  const nomesComJogos = useMemo(() => (dados?.brawlers ?? []).map((linha) => linha.brawler).sort((a, b) => a.localeCompare(b)), [dados?.brawlers]);
  const alvo = escolhido && nomesComJogos.includes(escolhido) ? escolhido : dados?.brawlers[0]?.brawler ?? "";
  const confrontos = useMemo(() => ordenar((dados?.confrontos ?? []).filter((linha) => linha.a === alvo && passa([linha.b]) && fiavel(linha.jogos)), colunaReal, descendente), [dados?.confrontos, alvo, colunaReal, descendente, termo, soFiaveis]);
  const equipas = useMemo(() => ordenar((dados?.equipas ?? []).filter((linha) => passa(linha.membros) && fiavel(linha.jogos)), colunaReal, descendente), [dados?.equipas, colunaReal, descendente, termo, soFiaveis]);
  const sinergias = useMemo(() => ordenar((dados?.sinergias ?? []).filter((linha) => passa([linha.a, linha.b]) && fiavel(linha.jogos)), colunaReal, descendente), [dados?.sinergias, colunaReal, descendente, termo, soFiaveis]);

  // Os mapas, agrupados por modo, para a grelha de imagens.
  const grupos = useMemo(() => {
    type Mapa = NonNullable<typeof dados>["mapas"][number];
    const porModo = new Map<string, { mode: string; nome: string; mapas: Mapa[] }>();
    for (const modo of dados?.modos ?? []) porModo.set(modo.mode, { mode: modo.mode, nome: modo.nome, mapas: [] });
    for (const mapa of dados?.mapas ?? []) porModo.get(mapa.mode)?.mapas.push(mapa);
    return Array.from(porModo.values()).filter((grupo) => !mode || grupo.mode === mode);
  }, [dados?.modos, dados?.mapas, mode]);

  const mudar = <T,>(definir: (valor: T) => void) => (valor: T) => {
    definir(valor);
    setMostradas(DE_CADA_VEZ);
  };
  const ordenarPor = (nova: Coluna) => {
    if (nova === coluna) setDescendente((atual) => !atual);
    else {
      setColuna(nova);
      setDescendente(true);
    }
    setMostradas(DE_CADA_VEZ);
  };
  const escolherModo = (novoModo: string) => {
    setMode(novoModo);
    setMapId("");
    setMostradas(DE_CADA_VEZ);
  };
  const escolherMapa = (novoMapa: string, novoModo: string) => {
    setMapId(novoMapa);
    if (novoModo) setMode(novoModo);
    setMostradas(DE_CADA_VEZ);
  };

  const mapaEscolhido = dados?.mapas.find((mapa) => mapa.mapId === mapId);
  const nomeDoModo = mapaEscolhido?.modoNome ?? dados?.modos.find((modo) => modo.mode === mode)?.nome;
  const titulo = mapaEscolhido
    ? <>Melhores brawlers para <em style={{ color: CORES_DOS_MODOS[mapaEscolhido.mode] }}>{mapaEscolhido.modoNome}</em> em <em className="is-mapa">{mapaEscolhido.nome}</em></>
    : nomeDoModo
      ? <>Melhores brawlers em <em style={{ color: CORES_DOS_MODOS[mode] }}>{nomeDoModo}</em> · todos os mapas</>
      : <>Melhores brawlers · todos os modos e mapas</>;
  const atualizado = dados?.geradoEm ? new Date(dados.geradoEm).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const cabecalhos = { ativa: coluna, descendente, onOrdenar: ordenarPor };

  return (
    <div className="partidas-pagina">
      <BarraDoSite ativo="partidas" />
      <main className="partidas-main">
        <header className="partidas-cabeca">
          <h1 className="bh-display">Partidas Ranked</h1>
          <p>
            Jogos Ranked reais da API oficial. Recolha programada a cada 15 minutos; o estado abaixo confirma as voltas. Cada brawler, cada
            confronto, cada equipa e cada par de aliados — sem cortes.
          </p>
        </header>

        <EstadoDaRecolha cadencia={recolha.data?.cadencia} />
        {recolha.isError ? <p role="alert">Não foi possível consultar o estado da recolha. Os totais guardados estão indisponíveis.</p> : null}

        <section className="partidas-filtros" aria-label="Filtros">
          <SeletorDePeriodo dias={dias} onChange={mudar(setDias)} />
          <SeletorDeRank rank={rank} onChange={mudar(setRank)} />
        </section>

        <div className="partidas-corpo">
          <aside className="partidas-mapas" aria-label="Mapas">
            <div className="partidas-modos" role="radiogroup" aria-label="Modo">
              <button type="button" role="radio" aria-checked={!mode} className={!mode ? "is-active" : ""} onClick={() => escolherModo("")}>
                Todos os modos
              </button>
              {(dados?.modos ?? []).map((modo) => (
                <button key={modo.mode} type="button" role="radio" aria-checked={mode === modo.mode} className={mode === modo.mode ? "is-active" : ""} style={{ ["--cor-do-modo" as string]: CORES_DOS_MODOS[modo.mode] ?? "var(--bh-gold)" }} onClick={() => escolherModo(modo.mode)}>
                  {modo.nome} <small>{modo.partidas}</small>
                </button>
              ))}
            </div>
            <button type="button" className={`partidas-mapa-todos ${!mapId ? "is-active" : ""}`} onClick={() => escolherMapa("", mode)}>
              Todos os mapas{nomeDoModo && !mapaEscolhido ? ` de ${nomeDoModo}` : ""}
            </button>
            <div className="partidas-grupos-de-mapas">
            {grupos.map((grupo) => (
              <div key={grupo.mode} className="partidas-grupo-de-mapas" style={{ ["--cor-do-modo" as string]: CORES_DOS_MODOS[grupo.mode] ?? "var(--bh-gold)" }}>
                <h3>{grupo.nome}</h3>
                <div className="partidas-grelha">
                  {grupo.mapas.map((mapa) => (
                    <button
                      key={`${mapa.mapId}-${mapa.mode}`}
                      type="button"
                      className={`partidas-mapa ${mapId === mapa.mapId ? "is-active" : ""}`}
                      aria-pressed={mapId === mapa.mapId}
                      onClick={() => escolherMapa(mapa.mapId, mapa.mode)}
                    >
                      <strong>{mapa.nome}</strong>
                      <span className="partidas-mapa-imagem">
                        <img src={mapImageFor({ name: mapa.nome, id: mapa.mapId }) ?? undefined} alt="" loading="lazy" decoding="async" onError={(evento) => { evento.currentTarget.style.visibility = "hidden"; }} />
                      </span>
                      <small>{mapa.partidas.toLocaleString("pt-PT")} partidas</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            </div>
          </aside>

          <section className="partidas-painel" aria-label="Estatísticas">
            <div className="partidas-painel-cabeca">
              <h2>{titulo}</h2>
              <p>
                <Database size={13} aria-hidden="true" /> Estatísticas com base em <b>{dados ? partidas.toLocaleString("pt-PT") : "—"}</b> partidas{dados ? ` dos últimos ${dados.dias} dias` : ""}
                {rank ? <> · {RANKS_DO_FILTRO.find((opcao) => opcao.id === rank)?.nome}</> : null}
                {atualizado ? <>. Atualizado a {atualizado}.</> : "."}
                {dados?.limiteAtingido ? <span className="is-aviso"> Mostradas as mais recentes.</span> : null}
              </p>
            </div>

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
              <label className="partidas-check">
                <input type="checkbox" checked={soFiaveis} onChange={(evento) => mudar(setSoFiaveis)(evento.target.checked)} />
                Só com {JOGOS_MINIMOS_FIAVEIS}+ jogos
              </label>
            </div>

            {consulta.isLoading ? <p className="partidas-vazio">A contar as partidas…</p> : null}
            {consulta.isError ? (
              <div className="partidas-vazio" role="alert">
                <p>Não foi possível ler as partidas. Isto não significa que existam zero partidas.</p>
                <button type="button" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>Tentar novamente</button>
              </div>
            ) : null}
            {dados && partidas === 0 ? (
              <div className="partidas-vazio">
                <p>{recolha.data && recolha.data.coverage.battles > 0
                  ? `Há ${recolha.data.coverage.battles.toLocaleString("pt-PT")} partidas guardadas no total, mas nenhuma corresponde a este filtro.`
                  : "Ainda não há partidas neste filtro. Consulta o estado da recolha acima."}</p>
                <button type="button" onClick={() => { setDias(0); setRank(""); setMode(""); setMapId(""); setMostradas(DE_CADA_VEZ); }}>Ver todos os dados guardados</button>
              </div>
            ) : null}

            {dados && partidas > 0 && separador === "brawlers" ? (
              <div className="partidas-lista" aria-label="Brawlers">
                <div className="partidas-linha is-cabeca">
                  <span>Brawler</span>
                  <Cabecalho rotulo="Vitória %" coluna="vitoria" {...cabecalhos} />
                  <Cabecalho rotulo="Uso %" coluna="uso" {...cabecalhos} />
                  <Cabecalho rotulo="Jogos" coluna="jogos" {...cabecalhos} />
                </div>
                {brawlers.slice(0, mostradas).map((linha) => (
                  <div key={linha.brawler} className={`partidas-linha ${linha.jogos < JOGOS_MINIMOS_FIAVEIS ? "is-pequena" : ""}`}>
                    <span className="partidas-nome"><Cara nome={linha.brawler} grande /> {linha.brawler}</span>
                    <Vitoria {...linha} />
                    <span className="partidas-uso">{percentagem(taxaDeUso(linha.jogos, partidas))}</span>
                    <Jogos {...linha} />
                  </div>
                ))}
                <MaisLinhas total={brawlers.length} mostradas={mostradas} onMais={() => setMostradas((n) => n + DE_CADA_VEZ)} />
              </div>
            ) : null}

            {dados && partidas > 0 && separador === "confrontos" ? (
              <div className="partidas-lista" aria-label="1 contra 1">
                <label className="partidas-seletor is-largo">
                  <span>Brawler</span>
                  <select value={alvo} onChange={(evento) => mudar(setEscolhido)(evento.target.value)}>
                    {nomesComJogos.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
                  </select>
                </label>
                <p className="partidas-nota">Vitória de <b>{alvo}</b> contra cada adversário que enfrentou, nas partidas deste filtro.</p>
                <div className="partidas-linha is-cabeca">
                  <span>Contra</span>
                  <Cabecalho rotulo="Vitória %" coluna="vitoria" {...cabecalhos} />
                  <span />
                  <Cabecalho rotulo="Jogos" coluna="jogos" {...cabecalhos} />
                </div>
                {confrontos.slice(0, mostradas).map((linha) => (
                  <div key={linha.b} className={`partidas-linha ${linha.jogos < JOGOS_MINIMOS_FIAVEIS ? "is-pequena" : ""}`}>
                    <span className="partidas-nome"><Cara nome={linha.a} /><small className="partidas-vs">vs</small><Cara nome={linha.b} grande /> {linha.b}</span>
                    <Vitoria {...linha} />
                    <span />
                    <Jogos {...linha} />
                  </div>
                ))}
                <MaisLinhas total={confrontos.length} mostradas={mostradas} onMais={() => setMostradas((n) => n + DE_CADA_VEZ)} />
              </div>
            ) : null}

            {dados && partidas > 0 && separador === "equipas" ? (
              <div className="partidas-lista" aria-label="Equipas 3v3">
                <div className="partidas-linha is-cabeca">
                  <span>Equipa</span>
                  <Cabecalho rotulo="Vitória %" coluna="vitoria" {...cabecalhos} />
                  <span />
                  <Cabecalho rotulo="Jogos" coluna="jogos" {...cabecalhos} />
                </div>
                {equipas.slice(0, mostradas).map((linha) => (
                  <div key={linha.membros.join("|")} className={`partidas-linha ${linha.jogos < JOGOS_MINIMOS_FIAVEIS ? "is-pequena" : ""}`}>
                    <span className="partidas-nome">{linha.membros.map((nome) => <Cara key={nome} nome={nome} grande />)} <span className="partidas-trio">{linha.membros.join(" · ")}</span></span>
                    <Vitoria {...linha} />
                    <span />
                    <Jogos {...linha} />
                  </div>
                ))}
                <MaisLinhas total={equipas.length} mostradas={mostradas} onMais={() => setMostradas((n) => n + DE_CADA_VEZ)} />
              </div>
            ) : null}

            {dados && partidas > 0 && separador === "sinergias" ? (
              <div className="partidas-lista" aria-label="Sinergias">
                <p className="partidas-nota">
                  Dois brawlers na mesma equipa: quantas vezes jogaram juntos e quanto ganharam. Carrega em <b>Vitória %</b> até a seta
                  apontar para cima para veres primeiro as <b>anti-sinergias</b> — pares que ganham pouco juntos.
                </p>
                <div className="partidas-linha is-cabeca">
                  <span>Par</span>
                  <Cabecalho rotulo="Vitória %" coluna="vitoria" {...cabecalhos} />
                  <span />
                  <Cabecalho rotulo="Jogos" coluna="jogos" {...cabecalhos} />
                </div>
                {sinergias.slice(0, mostradas).map((linha) => (
                  <div key={`${linha.a}|${linha.b}`} className={`partidas-linha ${linha.jogos < JOGOS_MINIMOS_FIAVEIS ? "is-pequena" : ""}`}>
                    <span className="partidas-nome"><Cara nome={linha.a} grande /><Cara nome={linha.b} grande /> {linha.a} + {linha.b}</span>
                    <Vitoria {...linha} />
                    <span />
                    <Jogos {...linha} />
                  </div>
                ))}
                <MaisLinhas total={sinergias.length} mostradas={mostradas} onMais={() => setMostradas((n) => n + DE_CADA_VEZ)} />
              </div>
            ) : null}
          </section>
        </div>
      </main>
      <MobileNav pathname="/partidas" />
    </div>
  );
}

