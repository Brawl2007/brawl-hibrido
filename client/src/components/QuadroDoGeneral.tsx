/**
 * O quadro do general: o fim do draft como um plano de batalha.
 *
 * O mapa em 3D (paredes, mato, água lidos da imagem do mapa), com os seis
 * brawlers. Quem usa o site move-os, desenha setas de avanço, recuo e rotação,
 * e põe símbolos (abertura, passagem a controlar, emboscada, perigo, alvo).
 * Ao passar o cursor por um brawler aparecem as ordens dele.
 *
 * O dono pode pedir o plano à IA (Gemini, chave gratuita): ela analisa a
 * imagem e a grelha do mapa, prevê o adversário, e preenche o quadro —
 * posições, setas, símbolos e ordens. Depois pode-se mexer em tudo à mão.
 *
 * O plano fica guardado neste navegador, por mapa e por equipas.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useEhDono } from "@/lib/ehDono";
import { useRankedSync } from "@/contexts/RankedSyncContext";
import { ELOS_BRAWL_PLANET } from "@shared/elosBrawlPlanet";
import { atribuirDuelosPorCounter, calculateLaneMatchup, inferDraftRole } from "@shared/draft";
import type { RankedRow } from "@/data/rankedData";
import {
  CAPACIDADES,
  MAXIMO_DE_MARCADORES,
  MAXIMO_DE_SETAS,
  NOME_DO_MODO,
  TIPOS_DE_MARCADOR,
  TIPOS_DE_SETA,
  chaveDaFicha,
  chaveDoQuadro,
  lerPlanoGuardado,
  planoVazio,
  type PlanoDoGeneral,
  type PontoNoMapa,
  type TipoDeMarcador,
  type TipoDeSeta,
} from "@shared/quadroDoGeneral";
import { TIPOS_DE_CASA, pontoLivre, type TerrenoDoMapa, type TipoDeCasa } from "@shared/terrenoDoMapa";
import type { AlvoDoCursor, ComandoDeCamara, Ferramenta, FichaNo3D, Vista } from "./Quadro3D";
import { COR_DA_SETA, COR_DO_MARCADOR } from "./coresDoQuadro";

const Quadro3D = lazy(() => import("./Quadro3D"));

type Linha = RankedRow;

type Props = {
  mapa?: { name: string; modeId?: string };
  mapaId: string | null;
  nosNome: string;
  nossos: Linha[];
  deles: Linha[];
  retratoDe: (linha: Linha) => string | null;
};

const NOME_DA_FUNCAO = { mid: "mid", side: "lane", flex: "flex" } as const;
const NOME_DO_TIPO_DE_CASA: Record<TipoDeCasa, string> = { chao: "Chão", parede: "Parede", mato: "Mato", agua: "Água", objetivo: "Objetivo" };
const VISTAS: Array<{ id: Vista; nome: string }> = [
  { id: "nossa", nome: "Da nossa base" },
  { id: "deles", nome: "Da base deles" },
  { id: "cima", nome: "De cima" },
  { id: "lado", nome: "De lado" },
  { id: "rasante", nome: "Rasante" },
];
const COMANDOS: Array<{ id: ComandoDeCamara; simbolo: string; nome: string }> = [
  { id: "rodar-esquerda", simbolo: "⟲", nome: "Rodar para a esquerda" },
  { id: "rodar-direita", simbolo: "⟳", nome: "Rodar para a direita" },
  { id: "subir", simbolo: "▲", nome: "Ver mais de cima" },
  { id: "descer", simbolo: "▼", nome: "Ver mais de baixo" },
  { id: "aproximar", simbolo: "+", nome: "Aproximar" },
  { id: "afastar", simbolo: "−", nome: "Afastar" },
];
const FERRAMENTAS: Array<{ id: Ferramenta; nome: string; ajuda: string }> = [
  { id: "mover", nome: "Mover", ajuda: "Arrasta brawlers e símbolos. No chão: botão esquerdo roda, botão direito arrasta o mapa, a roda aproxima onde está o cursor. No telemóvel: um dedo roda, dois dedos aproximam." },
  { id: "seta", nome: "Seta", ajuda: "Arrasta no chão para desenhar a seta. O botão direito continua a arrastar o mapa; os botões no canto rodam a câmara." },
  { id: "simbolo", nome: "Símbolo", ajuda: "Clica no chão para pôr o símbolo escolhido." },
  { id: "apagar", nome: "Apagar", ajuda: "Clica numa seta ou num símbolo para o apagar." },
];

function textoDaBuild(build: PlanoDoGeneral["ordens"][number]["build"]) {
  if (!build) return "";
  return [build.gadget && `Gadget: ${build.gadget}`, build.poderEstelar && `Poder estelar: ${build.poderEstelar}`, build.engrenagens.length ? `Engrenagens: ${build.engrenagens.join(", ")}` : ""].filter(Boolean).join(" · ");
}

const numeroOuNulo = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? Math.max(0, Math.min(100, valor)) : null);

function lerGuardado(chave: string) {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function QuadroDoGeneral({ mapa, mapaId, nosNome, nossos, deles, retratoDe }: Props) {
  const ehDono = useEhDono();
  const { capturedAt, elo } = useRankedSync();
  const nomesNossos = useMemo(() => nossos.map((linha) => linha.brawler), [nossos]);
  const nomesDeles = useMemo(() => deles.map((linha) => linha.brawler), [deles]);
  const chave = chaveDoQuadro(mapa?.name, nomesNossos, nomesDeles);
  const [plano, setPlano] = useState<PlanoDoGeneral>(() => lerPlanoGuardado(lerGuardado(chave), nomesNossos, nomesDeles));
  const [chaveCarregada, setChaveCarregada] = useState(chave);
  // Outro draft (outro mapa ou outras equipas): outro plano.
  if (chaveCarregada !== chave) {
    setChaveCarregada(chave);
    setPlano(lerPlanoGuardado(lerGuardado(chave), nomesNossos, nomesDeles));
  }
  useEffect(() => {
    try {
      window.localStorage.setItem(chave, JSON.stringify(plano));
    } catch {
      // Sem armazenamento, o plano vale só nesta visita.
    }
  }, [chave, plano]);

  const [ferramenta, setFerramenta] = useState<Ferramenta>("mover");
  const [tipoDeSeta, setTipoDeSeta] = useState<TipoDeSeta>("avanco");
  const [tipoDeMarcador, setTipoDeMarcador] = useState<TipoDeMarcador>("ataque");
  const [donoDoSimbolo, setDonoDoSimbolo] = useState<string>("");
  const [vista, setVista] = useState<{ id: Vista; pedido: number }>({ id: "nossa", pedido: 0 });
  const [comando, setComando] = useState<{ acao: ComandoDeCamara; n: number } | null>(null);
  const [cursor, setCursor] = useState<AlvoDoCursor>(null);
  const [erro3D, setErro3D] = useState<string | null>(null);
  const [novaChave, setNovaChave] = useState("");

  const utils = trpc.useUtils();
  const terrenoQuery = trpc.general.terreno.useQuery({ mapaId: mapaId ?? "" }, { enabled: Boolean(mapaId), staleTime: 10 * 60_000, retry: 1 });
  const terreno = (terrenoQuery.data ?? null) as TerrenoDoMapa | null;
  const estadoQuery = trpc.general.estado.useQuery(undefined, { enabled: ehDono, retry: false, staleTime: 30_000 });
  const guardarChave = trpc.general.guardarChave.useMutation({
    onSuccess: (resultado) => {
      const teste = resultado.test as { ok: boolean; reason: string };
      if (teste.ok) toast.success("Chave da Gemini guardada.", { description: teste.reason });
      else toast.error(resultado.saved ? "Chave guardada, mas a Google recusou." : "Chave apagada.", { description: teste.reason });
      setNovaChave("");
      void estadoQuery.refetch();
    },
    onError: (e) => toast.error(e.message || "Não foi possível guardar a chave."),
  });
  const pedirPlano = trpc.general.pedirPlano.useMutation({
    onSuccess: (resultado) => {
      const novo = resultado.plano as PlanoDoGeneral;
      setPlano((atual) => ({
        ...novo,
        // Os adversários ficam onde tu os puseste; a IA só dá ordens à tua equipa.
        posicoes: { ...atual.posicoes, ...Object.fromEntries(Object.entries(novo.posicoes).filter(([k]) => k.startsWith("a:"))) },
      }));
      if (resultado.terreno && mapaId) utils.general.terreno.setData({ mapaId }, resultado.terreno as never);
      toast.success("O general deu as ordens.", {
        description: `${resultado.modelo}${resultado.comImagem ? " · viu o mapa" : ""}${resultado.comPesquisa ? " · pesquisou a informação atual" : " · sem pesquisa atual"}. Passa o cursor pelos brawlers.`,
      });
    },
    onError: (e) => toast.error("A IA não conseguiu fazer o plano.", { description: e.message }),
  });
  const rotularTerreno = trpc.general.rotularTerreno.useMutation({
    onSuccess: (resultado) => {
      if (mapaId) utils.general.terreno.setData({ mapaId }, resultado as never);
      toast.success("A IA leu o terreno do mapa.");
    },
    onError: (e) => toast.error("Não consegui ler o terreno com a IA.", { description: e.message }),
  });
  const corrigirTerreno = trpc.general.corrigirTerreno.useMutation({
    onSuccess: (resultado) => { if (mapaId) utils.general.terreno.setData({ mapaId }, resultado as never); },
    onError: (e) => toast.error(e.message || "Não foi possível corrigir."),
  });
  const estado = estadoQuery.data as { configured: boolean; origin: string; hint: string | null } | undefined;

  const fichas = useMemo<FichaNo3D[]>(() => [
    ...nossos.map((linha) => ({ chave: chaveDaFicha("nos", linha.brawler), nome: linha.brawler, lado: "nos" as const, retrato: retratoDe(linha), ponto: plano.posicoes[chaveDaFicha("nos", linha.brawler)] ?? { x: 0.5, y: 0.84 } })),
    ...deles.map((linha) => ({ chave: chaveDaFicha("eles", linha.brawler), nome: linha.brawler, lado: "eles" as const, retrato: retratoDe(linha), ponto: plano.posicoes[chaveDaFicha("eles", linha.brawler)] ?? { x: 0.5, y: 0.16 } })),
  ], [nossos, deles, plano.posicoes, retratoDe]);

  const duelos = useMemo(() => atribuirDuelosPorCounter(nossos, deles, "ally").map((duelo) => ({
    nosso: duelo.ally.brawler,
    deles: duelo.enemy.brawler,
    vantagem: Math.max(0, Math.min(100, calculateLaneMatchup(duelo.ally, duelo.enemy).score)),
  })), [nossos, deles]);

  const moverFicha = (chaveDaFichaMovida: string, ponto: PontoNoMapa) =>
    setPlano((atual) => ({ ...atual, posicoes: { ...atual.posicoes, [chaveDaFichaMovida]: pontoLivre(terreno, ponto) } }));
  const acrescentarSeta = (seta: Omit<PlanoDoGeneral["setas"][number], "id">) =>
    setPlano((atual) => (atual.setas.length >= MAXIMO_DE_SETAS * 2
      ? (toast.error("Já há setas demais neste plano."), atual)
      : { ...atual, setas: [...atual.setas, { ...seta, id: `m-${Date.now().toString(36)}` }] }));
  const acrescentarMarcador = (tipo: TipoDeMarcador, ponto: PontoNoMapa) =>
    setPlano((atual) => (atual.marcadores.length >= MAXIMO_DE_MARCADORES * 3
      ? (toast.error("Já há símbolos demais neste plano."), atual)
      : {
        ...atual,
        marcadores: [...atual.marcadores, {
          id: `m-${Date.now().toString(36)}`,
          tipo,
          ponto,
          nota: TIPOS_DE_MARCADOR.find((item) => item.id === tipo)?.nome ?? "",
          ...(donoDoSimbolo && nomesNossos.includes(donoDoSimbolo) ? { brawler: donoDoSimbolo } : {}),
        }],
      }));
  const apagar = (tipo: "seta" | "marcador", id: string) =>
    setPlano((atual) => (tipo === "seta" ? { ...atual, setas: atual.setas.filter((s) => s.id !== id) } : { ...atual, marcadores: atual.marcadores.filter((m) => m.id !== id) }));

  const pedir = () => {
    if (!mapa?.name) {
      toast.error("Escolhe o mapa primeiro.");
      return;
    }
    pedirPlano.mutate({
      mapa: mapa.name,
      modoId: mapa.modeId ?? "",
      mapaId,
      nossos: nossos.map((linha) => ({ brawler: linha.brawler, funcao: NOME_DA_FUNCAO[inferDraftRole(linha.brawler)] })),
      deles: deles.map((linha) => ({ brawler: linha.brawler, funcao: NOME_DA_FUNCAO[inferDraftRole(linha.brawler)] })),
      duelos,
      nosNome,
      // Os números de agora, no elo escolhido: a IA planeia com o jogo de hoje.
      numeros: [
        ...nossos.map((linha) => ({ brawler: linha.brawler, lado: "nos" as const, vitoria: numeroOuNulo(linha.winRate), uso: numeroOuNulo(linha.usage) })),
        ...deles.map((linha) => ({ brawler: linha.brawler, lado: "eles" as const, vitoria: numeroOuNulo(linha.winRate), uso: numeroOuNulo(linha.usage) })),
      ],
      dadosDe: capturedAt ?? null,
      elo: ELOS_BRAWL_PLANET.find((item) => item.id === elo)?.nome ?? null,
    });
  };

  // O que aparece ao passar o cursor.
  const dica = (() => {
    if (!cursor) return null;
    if (cursor.tipo === "marcador") {
      const marcador = plano.marcadores.find((m) => m.id === cursor.id);
      if (!marcador) return null;
      const nome = TIPOS_DE_MARCADOR.find((t) => t.id === marcador.tipo)?.nome ?? "Símbolo";
      return { titulo: marcador.brawler ? `${marcador.brawler} · ${nome}` : nome, cor: COR_DO_MARCADOR[marcador.tipo], linhas: [marcador.nota] };
    }
    const ficha = fichas.find((f) => f.chave === cursor.id);
    if (!ficha) return null;
    if (ficha.lado === "eles") {
      const duelo = duelos.find((d) => d.deles === ficha.nome);
      return {
        titulo: `${ficha.nome} · adversário`,
        cor: "#ff4d6d",
        linhas: [
          duelo ? `Duelo: ${duelo.nosso} contra ${ficha.nome}, ${Math.round(duelo.vantagem)}% para ti.` : "Sem duelo atribuído.",
          ...plano.previsao.filter((linha) => linha.toLowerCase().includes(ficha.nome.toLowerCase())),
        ],
      };
    }
    const ordem = plano.ordens.find((o) => o.brawler === ficha.nome);
    return {
      titulo: `${ficha.nome}${ordem?.funcao ? ` · ${ordem.funcao}` : ""}`,
      cor: "#37c8ff",
      linhas: ordem
        ? [
          ordem.objetivo,
          ordem.quandoAvancar ? `Quando avançar: ${ordem.quandoAvancar}` : "",
          ...ordem.cuidados.map((c) => `Cuidado: ${c}`),
          textoDaBuild(ordem.build),
          ordem.capacidades?.length ? `Pode: ${ordem.capacidades.map((c) => CAPACIDADES.find((item) => item.id === c)?.nome.toLowerCase()).join(", ")}` : "",
          ...plano.marcadores.filter((m) => m.brawler === ficha.nome).map((m) => `${TIPOS_DE_MARCADOR.find((t) => t.id === m.tipo)?.simbolo} ${m.nota}`),
        ].filter(Boolean)
        : [ehDono ? "Ainda sem ordens. Pede o plano ao general." : "Ainda sem ordens para este brawler."],
    };
  })();

  const ajuda = FERRAMENTAS.find((item) => item.id === ferramenta)?.ajuda;
  const temPlanoDaIA = plano.origem === "ia" && plano.ordens.length > 0;

  return (
    <section className="quadro-general" aria-label="Quadro do general: plano tático no mapa em 3D">
      <header className="quadro-general-cabecalho">
        <div>
          <div className="section-kicker">Quadro do general <span>PLANO DE BATALHA 3D</span></div>
          <h2>Plano de batalha{mapa?.name ? ` · ${mapa.name}` : ""}</h2>
          <p>
            Paredes, mato e água lidos do próprio mapa{mapa?.modeId ? ` (${NOME_DO_MODO[mapa.modeId] ?? mapa.modeId})` : ""}. Roda a câmara,
            move os brawlers, desenha setas e símbolos. Passa o cursor por um brawler para ver as ordens.
          </p>
        </div>
        {ehDono && (
          <div className="quadro-general-ia">
            {estado?.configured ? (
              <>
                <button type="button" className="quadro-general-pedir" onClick={pedir} disabled={pedirPlano.isPending}>
                  {pedirPlano.isPending ? "O general está a analisar o mapa…" : temPlanoDaIA ? "Pedir novo plano à IA" : "Pedir o plano ao general (IA)"}
                </button>
                <small>Gemini · chave {estado.hint}{pedirPlano.isPending ? " · pode demorar até um minuto" : ""}</small>
              </>
            ) : (
              <form className="quadro-general-chave" onSubmit={(e) => { e.preventDefault(); guardarChave.mutate({ key: novaChave }); }}>
                <label htmlFor="chave-gemini">Chave gratuita da Gemini</label>
                <div>
                  <input id="chave-gemini" type="password" autoComplete="off" value={novaChave} onChange={(e) => setNovaChave(e.target.value)} placeholder="AIza…" />
                  <button type="submit" disabled={guardarChave.isPending || novaChave.trim().length < 20}>Guardar</button>
                </div>
                <small>Cria-a em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>. Fica guardada no servidor e nunca volta ao navegador.</small>
              </form>
            )}
          </div>
        )}
      </header>

      <div className="quadro-general-barra" role="toolbar" aria-label="Ferramentas do quadro">
        <div className="quadro-general-grupo" role="radiogroup" aria-label="Ferramenta">
          {FERRAMENTAS.map((item) => (
            <button key={item.id} type="button" role="radio" aria-checked={ferramenta === item.id} className={ferramenta === item.id ? "is-active" : ""} onClick={() => setFerramenta(item.id)}>{item.nome}</button>
          ))}
        </div>
        {ferramenta === "seta" && (
          <div className="quadro-general-grupo" role="radiogroup" aria-label="Tipo de seta">
            {TIPOS_DE_SETA.map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={tipoDeSeta === item.id} className={tipoDeSeta === item.id ? "is-active" : ""} onClick={() => setTipoDeSeta(item.id)}>
                <i style={{ background: COR_DA_SETA[item.id] }} aria-hidden="true" />{item.nome}
              </button>
            ))}
          </div>
        )}
        {ferramenta === "simbolo" && (
          <div className="quadro-general-grupo" role="radiogroup" aria-label="Símbolo">
            {TIPOS_DE_MARCADOR.map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={tipoDeMarcador === item.id} className={tipoDeMarcador === item.id ? "is-active" : ""} onClick={() => setTipoDeMarcador(item.id)} title={item.nome}>
                <b style={{ color: COR_DO_MARCADOR[item.id] }} aria-hidden="true">{item.simbolo}</b>{item.curto}
              </button>
            ))}
            <label className="quadro-general-dono">
              <span>Para</span>
              <select value={donoDoSimbolo} onChange={(e) => setDonoDoSimbolo(e.target.value)}>
                <option value="">toda a equipa</option>
                {nomesNossos.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="quadro-general-grupo quadro-general-vistas" aria-label="Vista">
          {VISTAS.map((item) => (
            <button key={item.id} type="button" onClick={() => setVista((atual) => ({ id: item.id, pedido: atual.pedido + 1 }))}>{item.nome}</button>
          ))}
        </div>
        <button type="button" className="quadro-general-repor" onClick={() => setPlano(planoVazio(nomesNossos, nomesDeles))}>Repor tudo</button>
      </div>
      {ajuda && <p className="quadro-general-ajuda">{ajuda}</p>}

      <div className="quadro-general-corpo">
        <div className="quadro-general-palco-wrap">
          {erro3D ? (
            <p className="quadro-general-sem3d">{erro3D}</p>
          ) : (
            <Suspense fallback={<div className="quadro3d-palco quadro3d-a-carregar">A preparar o mapa em 3D…</div>}>
              <Quadro3D
                imagem={mapaId ? `/api/imagens/mapa/${mapaId}.png` : null}
                terreno={terreno}
                fichas={fichas}
                setas={plano.setas}
                marcadores={plano.marcadores}
                ferramenta={ferramenta}
                tipoDeSeta={tipoDeSeta}
                tipoDeMarcador={tipoDeMarcador}
                vista={vista.id}
                pedidoDeVista={vista.pedido}
                comando={comando}
                onMoverFicha={moverFicha}
                onMoverMarcador={(id, ponto) => setPlano((atual) => ({ ...atual, marcadores: atual.marcadores.map((m) => (m.id === id ? { ...m, ponto } : m)) }))}
                onNovaSeta={acrescentarSeta}
                onNovoMarcador={acrescentarMarcador}
                onApagar={apagar}
                onCursor={setCursor}
                onErro={setErro3D}
              />
            </Suspense>
          )}
          {!erro3D && (
            <div className="quadro-general-camara" role="group" aria-label="Câmara">
              {COMANDOS.map((item) => (
                <button key={item.id} type="button" title={item.nome} aria-label={item.nome} onClick={() => setComando((atual) => ({ acao: item.id, n: (atual?.n ?? 0) + 1 }))}>{item.simbolo}</button>
              ))}
            </div>
          )}
          {dica && cursor && (
            <div className="quadro-general-dica" role="tooltip" style={{ left: cursor.x, top: cursor.y, borderColor: dica.cor }}>
              <strong style={{ color: dica.cor }}>{dica.titulo}</strong>
              {dica.linhas.map((linha, i) => <p key={i}>{linha}</p>)}
            </div>
          )}
          {!terreno && mapaId && !terrenoQuery.isLoading && (
            <p className="quadro-general-aviso">Não consegui ler as paredes deste mapa: fica só a imagem, plana.</p>
          )}
        </div>

        <aside className="quadro-general-ordens" aria-label="Ordens do general">
          {plano.resumo || plano.condicaoDeVitoria ? (
            <div className="quadro-general-resumo">
              {plano.resumo && <p>{plano.resumo}</p>}
              {plano.condicaoDeVitoria && <p><b>Para ganhar:</b> {plano.condicaoDeVitoria}</p>}
            </div>
          ) : (
            <p className="quadro-general-vazio">
              {ehDono
                ? estado?.configured ? "Pede o plano ao general: ele analisa o mapa, prevê o adversário e preenche o quadro." : "Cola a chave gratuita da Gemini para o general poder analisar o mapa."
                : "Monta o teu plano: move os brawlers, desenha setas e põe símbolos. Fica guardado neste navegador."}
            </p>
          )}
          {plano.previsao.length > 0 && (
            <div className="quadro-general-previsao">
              <span>PREVISÃO DO ADVERSÁRIO</span>
              <ul>{plano.previsao.map((linha, i) => <li key={i}>{linha}</li>)}</ul>
            </div>
          )}
          {plano.ordens.length > 0 && (
            <ol className="quadro-general-lista">
              {plano.ordens.map((ordem) => {
                const simbolos = plano.marcadores.filter((m) => m.brawler === ordem.brawler);
                const build = textoDaBuild(ordem.build);
                return (
                  <li key={ordem.brawler}>
                    <header><strong>{ordem.brawler}</strong>{ordem.funcao && <em>{ordem.funcao}</em>}</header>
                    <p>{ordem.objetivo}</p>
                    {ordem.quandoAvancar && <p className="quadro-general-avancar"><b>Quando avançar</b> {ordem.quandoAvancar}</p>}
                    {ordem.cuidados.length > 0 && <ul className="quadro-general-cuidados">{ordem.cuidados.map((c, i) => <li key={i}>{c}</li>)}</ul>}
                    {simbolos.length > 0 && (
                      <ul className="quadro-general-simbolos-do-brawler">
                        {simbolos.map((m) => <li key={m.id}><b style={{ color: COR_DO_MARCADOR[m.tipo] }} aria-hidden="true">{TIPOS_DE_MARCADOR.find((t) => t.id === m.tipo)?.simbolo}</b>{m.nota}</li>)}
                      </ul>
                    )}
                    {(build || ordem.capacidades?.length) ? (
                      <footer>
                        {build && <span className="quadro-general-build">{build}</span>}
                        {ordem.capacidades?.map((c) => <span key={c} className="quadro-general-capacidade">{CAPACIDADES.find((item) => item.id === c)?.nome}</span>)}
                      </footer>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
          {plano.fases.length > 0 && (
            <div className="quadro-general-fases">
              {plano.fases.map((fase, i) => <p key={i}><b>{fase.nome}:</b> {fase.instrucao}</p>)}
            </div>
          )}
          {plano.marcadores.length > 0 && (
            <div className="quadro-general-simbolos">
              <span>SÍMBOLOS NO MAPA</span>
              <ul>
                {plano.marcadores.map((marcador) => (
                  <li key={marcador.id}>
                    <b style={{ color: COR_DO_MARCADOR[marcador.tipo] }} title={marcador.brawler ? `${marcador.brawler}` : "Equipa"} aria-hidden="true">{TIPOS_DE_MARCADOR.find((t) => t.id === marcador.tipo)?.simbolo}</b>
                    <input
                      aria-label="Nota do símbolo"
                      value={marcador.nota}
                      maxLength={240}
                      onChange={(e) => setPlano((atual) => ({ ...atual, marcadores: atual.marcadores.map((m) => (m.id === marcador.id ? { ...m, nota: e.target.value } : m)) }))}
                    />
                    <button type="button" aria-label="Apagar símbolo" onClick={() => apagar("marcador", marcador.id)}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plano.fontes && plano.fontes.length > 0 && (
            <details className="quadro-general-fontes">
              <summary>Informação atual consultada ({plano.fontes.length} fontes){plano.geradoEm ? ` · ${new Date(plano.geradoEm).toLocaleDateString("pt-PT")}` : ""}</summary>
              <ul>{plano.fontes.map((fonte) => <li key={fonte.url}><a href={fonte.url} target="_blank" rel="noopener noreferrer">{fonte.titulo}</a></li>)}</ul>
            </details>
          )}
          {terreno && (
            <details className="quadro-general-terreno">
              <summary>Terreno lido {terreno.rotulado === "ia" ? "(confirmado pela IA)" : "(regra aproximada)"}</summary>
              <p>Cada cor do mapa é um tipo de terreno. {ehDono ? "Se algum estiver errado, corrige aqui ou pede à IA para olhar." : ""}</p>
              <ul>
                {terreno.grupos.filter((grupo) => grupo.casas > 0).map((grupo) => (
                  <li key={grupo.id}>
                    <i style={{ background: `rgb(${grupo.cor.join(",")})` }} aria-hidden="true" />
                    <span>{grupo.casas} casas</span>
                    {ehDono ? (
                      <select
                        aria-label={`Tipo das casas desta cor (${grupo.casas})`}
                        value={grupo.tipo}
                        disabled={corrigirTerreno.isPending}
                        onChange={(e) => mapaId && corrigirTerreno.mutate({ mapaId, rotulos: [{ id: grupo.id, tipo: e.target.value as TipoDeCasa }] })}
                      >
                        {TIPOS_DE_CASA.map((tipo) => <option key={tipo} value={tipo}>{NOME_DO_TIPO_DE_CASA[tipo]}</option>)}
                      </select>
                    ) : (
                      <b>{NOME_DO_TIPO_DE_CASA[grupo.tipo]}</b>
                    )}
                  </li>
                ))}
              </ul>
              {ehDono && estado?.configured && mapaId && (
                <button type="button" onClick={() => rotularTerreno.mutate({ mapaId })} disabled={rotularTerreno.isPending}>
                  {rotularTerreno.isPending ? "A IA está a olhar para o mapa…" : "Pedir à IA para ler o terreno"}
                </button>
              )}
            </details>
          )}
        </aside>
      </div>
    </section>
  );
}
