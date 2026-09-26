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
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useEhDono } from "@/lib/ehDono";
import { useRankedSync } from "@/contexts/RankedSyncContext";
import { ELOS_BRAWL_PLANET } from "@shared/elosBrawlPlanet";
import { atribuirDuelosPorCounter, calculateLaneMatchup, inferDraftRole, posicionarNoMapa } from "@shared/draft";
import type { RankedRow } from "@/data/rankedData";
import {
  CAPACIDADES,
  MOMENTOS,
  MAXIMO_DE_MARCADORES,
  MAXIMO_DE_SETAS,
  NOME_DO_MODO,
  TIPOS_DE_MARCADOR,
  TIPOS_DE_SETA,
  camadasDoMomento,
  chaveDaFicha,
  chaveDoQuadro,
  comCamadas,
  lerPlanoGuardado,
  planoVazio,
  posicoesIniciais,
  terrenoDoMomento,
  type CamadasDoMomento,
  type MomentoDoPlano,
  type PlanoDoGeneral,
  type PontoNoMapa,
  type TipoDeMarcador,
  type TipoDeSeta,
} from "@shared/quadroDoGeneral";
import { TIPOS_DE_CASA, pontoLivre, type TerrenoDoMapa, type TipoDeCasa } from "@shared/terrenoDoMapa";
import type { AlvoDoCursor, AmeacaNo3D, ComandoDeCamara, DueloNo3D, Ferramenta, FichaNo3D, Vista } from "./Quadro3D";
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
const NOME_DO_TIPO_DE_CASA: Record<TipoDeCasa, string> = { chao: "Chão", parede: "Parede", mato: "Mato", agua: "Água", objetivo: "Objetivo", destrutivel: "Jarro / barril" };
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
  { id: "mover", nome: "Mover", ajuda: "Arrasta os brawlers. Botão esquerdo roda, o direito arrasta o mapa, a roda aproxima. No telemóvel: um dedo roda, dois aproximam." },
  { id: "seta", nome: "Seta", ajuda: "Arrasta no chão para desenhar a seta." },
  { id: "simbolo", nome: "Símbolo", ajuda: "Clica no chão para pôr o símbolo." },
  { id: "apagar", nome: "Apagar", ajuda: "Clica numa seta ou num símbolo para apagar." },
  { id: "casa", nome: "Corrigir terreno", ajuda: "Só tu vês isto. Escolhe o tipo e clica nas casas mal lidas. \"Como na imagem\" desfaz." },
];
/** Quanto tempo cada momento fica no ecrã ao "ver a partida". */
const DURACAO_DO_MOMENTO_MS = 3200;

/** Um retrato pequeno, com a cor da equipa. */
function Retrato({ url, nome, lado }: { url: string | null; nome: string; lado: "nos" | "eles" }) {
  return (
    <span className={`qg-retrato qg-retrato--${lado}`} title={nome}>
      {url ? <img src={url} alt={nome} loading="lazy" decoding="async" /> : nome.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Um gadget, poder estelar ou engrenagem: o desenho, e o nome ao passar o cursor. */
function ItemDaBuild({ nome, imagem, tipo }: { nome: string; imagem?: string | null; tipo: string }) {
  return (
    <span className={`qg-item qg-item--${tipo === "Gadget" ? "gadget" : tipo === "Poder estelar" ? "poder" : "engrenagem"}`} title={`${tipo}: ${nome}`}>
      {imagem ? <img src={imagem} alt="" loading="lazy" decoding="async" /> : <i aria-hidden="true">{tipo === "Engrenagem" ? "⚙" : tipo === "Gadget" ? "◆" : "★"}</i>}
      <small>{nome}</small>
    </span>
  );
}

function textoDaBuild(build: PlanoDoGeneral["ordens"][number]["build"]) {
  if (!build) return "";
  return [build.gadget && `Gadget: ${build.gadget}`, build.poderEstelar && `Poder estelar: ${build.poderEstelar}`, build.engrenagens.length ? `Engrenagens: ${build.engrenagens.join(", ")}` : ""].filter(Boolean).join(" · ");
}

const numeroOuNulo = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? Math.max(0, Math.min(100, valor)) : null);

/**
 * Que IA faz o plano: a principal ("gemini", ou uma reserva como "groq"), se as
 * outras entram quando ela falha, e o modelo de cada uma. "reserva" quer dizer
 * "a primeira reserva que houver" (vem da escolha antiga).
 */
type EscolhaDaIA = {
  principal: string;
  soEssa: boolean;
  modelos: Record<string, string | null>;
  /** Sem pesquisa na web e com menos espera por modelo: o plano chega antes da partida começar. */
  rapido: boolean;
  /** Pedir o plano sozinho quando o draft fecha, sem esperar pelo clique. */
  automatico: boolean;
};
const CHAVE_DA_ESCOLHA = "brawl-hibrido:ia-do-general:v2";
const CHAVE_DA_ESCOLHA_ANTIGA = "brawl-hibrido:ia-do-general:v1";
const ID_DE_IA = /^[a-z]{3,20}$/;
function lerEscolhaDaIA(): EscolhaDaIA {
  try {
    const guardada = JSON.parse(window.localStorage.getItem(CHAVE_DA_ESCOLHA) ?? "null") as Partial<EscolhaDaIA> | null;
    if (guardada && typeof guardada.principal === "string" && ID_DE_IA.test(guardada.principal)) {
      const modelos: Record<string, string | null> = {};
      for (const [id, modelo] of Object.entries(guardada.modelos ?? {})) {
        if (ID_DE_IA.test(id) && typeof modelo === "string" && modelo) modelos[id] = modelo.slice(0, 160);
      }
      return { principal: guardada.principal, soEssa: guardada.soEssa === true, modelos, rapido: guardada.rapido !== false, automatico: guardada.automatico !== false };
    }
    // A escolha de antes (Gemini ou "a reserva", com ou sem a outra).
    const antiga = JSON.parse(window.localStorage.getItem(CHAVE_DA_ESCOLHA_ANTIGA) ?? "null") as { ordem?: string; modeloGemini?: unknown } | null;
    if (antiga && typeof antiga.ordem === "string") {
      return {
        principal: antiga.ordem.includes("gemini") ? "gemini" : "reserva",
        soEssa: antiga.ordem.startsWith("so-"),
        modelos: typeof antiga.modeloGemini === "string" && antiga.modeloGemini ? { gemini: antiga.modeloGemini.slice(0, 80) } : {},
        rapido: true,
        automatico: true,
      };
    }
  } catch {
    // Estragada ou sem armazenamento: fica a de origem.
  }
  return { principal: "gemini", soEssa: false, modelos: {}, rapido: true, automatico: true };
}

type Fornecedor = { id: string; nome: string; ondeCriar: string; exemplo: string; reconheceSozinha: boolean };
type EstadoDaIA = {
  configured: boolean;
  origin: string;
  hint: string | null;
  reservas?: Array<{ id: string; nome: string; origin: string; hint: string }>;
  fornecedores?: Fornecedor[];
};
type ModelosDasIAs = { gemini: string[] | null; reservas: Record<string, { fornecedor: string; modelos: string[]; erro: string | null }> };

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
  const [notasNoMapa, setNotasNoMapa] = useState(true);
  const [passosFantasma, setPassosFantasma] = useState(true);
  const [verAmeacas, setVerAmeacas] = useState(true);
  const semTrilhos = useMemo(() => [], []);
  const semAmeacas = useMemo<AmeacaNo3D[]>(() => [], []);
  const [momento, setMomento] = useState<MomentoDoPlano>("inicio");
  const [aReproduzir, setAReproduzir] = useState(false);
  const [perspetiva, setPerspetiva] = useState<{ chave: string; n: number } | null>(null);
  const [tipoDaCorrecao, setTipoDaCorrecao] = useState<TipoDeCasa | "imagem">("destrutivel");
  // "Ver a partida": início → meio → fim, sozinho.
  useEffect(() => {
    if (!aReproduzir) return;
    const temporizador = window.setInterval(() => {
      setMomento((atual) => {
        const seguinte = MOMENTOS[MOMENTOS.findIndex((m) => m.id === atual) + 1]?.id;
        if (!seguinte) setAReproduzir(false);
        return seguinte ?? atual;
      });
    }, DURACAO_DO_MOMENTO_MS);
    return () => window.clearInterval(temporizador);
  }, [aReproduzir]);

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
      // Adversários: onde a IA os previu; se ela não disse nada de um, fica onde tu o puseste.
      const partida = posicoesIniciais(nomesNossos, nomesDeles);
      setPlano((atual) => ({
        ...novo,
        posicoes: Object.fromEntries(Object.entries(novo.posicoes).map(([k, ponto]) => {
          const igualAoDePartida = k.startsWith("e:") && partida[k] && partida[k].x === ponto.x && partida[k].y === ponto.y;
          return [k, igualAoDePartida && atual.posicoes[k] ? atual.posicoes[k] : ponto];
        })),
      }));
      setMomento("inicio");
      setAReproduzir(false);
      if (resultado.terreno && mapaId) utils.general.terreno.setData({ mapaId }, resultado.terreno as never);
      toast.success(`O general deu as ordens em ${resultado.segundos} s.`, {
        description: `${resultado.modelo}${resultado.comImagem ? " · viu o mapa" : ""}${resultado.comPesquisa ? " · pesquisou a informação atual" : ""}. Passa o cursor pelos brawlers.`,
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
  const corrigirCasas = trpc.general.corrigirCasas.useMutation({
    onSuccess: (resultado) => { if (mapaId) utils.general.terreno.setData({ mapaId }, resultado as never); },
    onError: (e) => toast.error(e.message || "Não foi possível corrigir a casa."),
  });
  const corrigirTerreno = trpc.general.corrigirTerreno.useMutation({
    onSuccess: (resultado) => { if (mapaId) utils.general.terreno.setData({ mapaId }, resultado as never); },
    onError: (e) => toast.error(e.message || "Não foi possível corrigir."),
  });
  const estado = estadoQuery.data as EstadoDaIA | undefined;
  const reservas = estado?.reservas ?? [];
  const fornecedores = estado?.fornecedores ?? [];
  const [novaChaveDeReserva, setNovaChaveDeReserva] = useState("");
  const [fornecedorDaNovaChave, setFornecedorDaNovaChave] = useState("auto");
  const guardarChaveDeReserva = trpc.general.guardarChaveDeReserva.useMutation({
    onSuccess: (resultado, pedido) => {
      const teste = resultado.test as { ok: boolean; reason: string };
      if (!pedido.key) toast.success("Chave apagada.");
      else if (teste.ok) toast.success("IA de reserva guardada.", { description: teste.reason });
      else toast.error(resultado.saved ? "Chave guardada, mas foi recusada." : "Chave não guardada.", { description: teste.reason });
      if (resultado.saved) setNovaChaveDeReserva("");
      void estadoQuery.refetch();
      void utils.general.modelos.invalidate();
    },
    onError: (e) => toast.error(e.message || "Não foi possível guardar a chave."),
  });
  const temAlgumaIA = Boolean(estado?.configured || reservas.length);

  // Que IA faz o plano (e com que modelo): escolha do dono, guardada neste navegador.
  const [escolhaDaIA, setEscolhaDaIA] = useState<EscolhaDaIA>(() => lerEscolhaDaIA());
  useEffect(() => {
    try {
      window.localStorage.setItem(CHAVE_DA_ESCOLHA, JSON.stringify(escolhaDaIA));
    } catch {
      // Sem armazenamento, vale só nesta visita.
    }
  }, [escolhaDaIA]);
  // As IAs com chave, pela ordem em que se tentam quando a principal falha.
  const iasComChave = [
    ...(estado?.configured ? [{ id: "gemini", nome: "Gemini" }] : []),
    ...reservas.map((r) => ({ id: r.id, nome: r.nome })),
  ];
  // "A reserva" (da escolha antiga) passa a ser a primeira reserva com chave.
  const principalAgora = escolhaDaIA.principal === "reserva" ? reservas[0]?.id ?? "gemini" : escolhaDaIA.principal;
  const nomeDaPrincipal = iasComChave.find((ia) => ia.id === principalAgora)?.nome ?? iasComChave[0]?.nome ?? "—";
  const [verModelos, setVerModelos] = useState(false);
  const modelosQuery = trpc.general.modelos.useQuery(undefined, { enabled: ehDono && verModelos, staleTime: 10 * 60_000, retry: false });
  const modelos = modelosQuery.data as ModelosDasIAs | undefined;
  const mudarModelo = (id: string, modelo: string) =>
    setEscolhaDaIA((atual) => ({ ...atual, modelos: { ...atual.modelos, [id]: modelo || null } }));

  // O momento da partida que está no ecrã: as suas posições, setas, símbolos e paredes partidas.
  const camadas = camadasDoMomento(plano, momento);
  const terrenoAqui = useMemo(() => terrenoDoMomento(terreno, camadas.paredesPartidas), [terreno, camadas.paredesPartidas]);
  const mudarCamadas = (mudar: (atuais: CamadasDoMomento) => CamadasDoMomento) =>
    setPlano((atual) => comCamadas(atual, momento, mudar(camadasDoMomento(atual, momento))));
  const textoDoMomento = plano.momentos?.find((m) => m.momento === momento);

  const fichas = useMemo<FichaNo3D[]>(() => [
    ...nossos.map((linha) => ({
      chave: chaveDaFicha("nos", linha.brawler),
      nome: linha.brawler,
      lado: "nos" as const,
      retrato: retratoDe(linha),
      ponto: camadas.posicoes[chaveDaFicha("nos", linha.brawler)] ?? { x: 0.5, y: 0.84 },
      funcao: plano.ordens.find((ordem) => ordem.brawler === linha.brawler)?.funcao || undefined,
    })),
    ...deles.map((linha) => ({ chave: chaveDaFicha("eles", linha.brawler), nome: linha.brawler, lado: "eles" as const, retrato: retratoDe(linha), ponto: camadas.posicoes[chaveDaFicha("eles", linha.brawler)] ?? { x: 0.5, y: 0.16 } })),
  ], [nossos, deles, camadas.posicoes, plano.ordens, retratoDe]);
  const ameacas3D = useMemo<AmeacaNo3D[]>(() => (plano.ameacas ?? []).map((a) => ({
    id: a.id,
    perigoso: chaveDaFicha(a.ladoDoPerigoso, a.perigoso),
    alvo: a.alvo,
    texto: a.texto,
    excecao: a.excecao,
  })), [plano.ameacas]);

  // Os mesmos duelos 1v1 da matriz: quem joga contra quem, e em que lane.
  const duelos = useMemo(() => posicionarNoMapa(atribuirDuelosPorCounter(nossos, deles, "ally"), (duelo) => inferDraftRole(duelo.ally.brawler)).map(({ position, item: duelo }) => ({
    posicao: position,
    nosso: duelo.ally.brawler,
    deles: duelo.enemy.brawler,
    linhaNossa: duelo.ally,
    linhaDeles: duelo.enemy,
    vantagem: Math.max(0, Math.min(100, calculateLaneMatchup(duelo.ally, duelo.enemy).score)),
  })), [nossos, deles]);
  const duelos3D = useMemo<DueloNo3D[]>(() => duelos.map((d) => ({ nosso: chaveDaFicha("nos", d.nosso), deles: chaveDaFicha("eles", d.deles), vantagem: d.vantagem })), [duelos]);

  const moverFicha = (chaveDaFichaMovida: string, ponto: PontoNoMapa) =>
    mudarCamadas((atuais) => ({ ...atuais, posicoes: { ...atuais.posicoes, [chaveDaFichaMovida]: pontoLivre(terrenoAqui, ponto) } }));
  const acrescentarSeta = (seta: Omit<PlanoDoGeneral["setas"][number], "id">) =>
    mudarCamadas((atuais) => (atuais.setas.length >= MAXIMO_DE_SETAS * 2
      ? (toast.error("Já há setas demais neste momento."), atuais)
      : { ...atuais, setas: [...atuais.setas, { ...seta, id: `m-${Date.now().toString(36)}` }] }));
  const acrescentarMarcador = (tipo: TipoDeMarcador, ponto: PontoNoMapa) =>
    mudarCamadas((atuais) => (atuais.marcadores.length >= MAXIMO_DE_MARCADORES * 3
      ? (toast.error("Já há símbolos demais neste momento."), atuais)
      : {
        ...atuais,
        marcadores: [...atuais.marcadores, {
          id: `m-${Date.now().toString(36)}`,
          tipo,
          ponto,
          nota: TIPOS_DE_MARCADOR.find((item) => item.id === tipo)?.nome ?? "",
          ...(donoDoSimbolo && nomesNossos.includes(donoDoSimbolo) ? { brawler: donoDoSimbolo } : {}),
        }],
      }));
  const apagar = (tipo: "seta" | "marcador", id: string) =>
    mudarCamadas((atuais) => (tipo === "seta" ? { ...atuais, setas: atuais.setas.filter((s) => s.id !== id) } : { ...atuais, marcadores: atuais.marcadores.filter((m) => m.id !== id) }));
  const corrigirCasa = (coluna: number, linha: number) => {
    if (!mapaId || corrigirCasas.isPending) return;
    corrigirCasas.mutate({ mapaId, casas: [{ coluna, linha, tipo: tipoDaCorrecao === "imagem" ? null : tipoDaCorrecao }] });
  };

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
      duelos: duelos.map(({ nosso, deles: delesNome, vantagem }) => ({ nosso, deles: delesNome, vantagem })),
      nosNome,
      // Os números de agora, no elo escolhido: a IA planeia com o jogo de hoje.
      numeros: [
        ...nossos.map((linha) => ({ brawler: linha.brawler, lado: "nos" as const, vitoria: numeroOuNulo(linha.winRate), uso: numeroOuNulo(linha.usage) })),
        ...deles.map((linha) => ({ brawler: linha.brawler, lado: "eles" as const, vitoria: numeroOuNulo(linha.winRate), uso: numeroOuNulo(linha.usage) })),
      ],
      dadosDe: capturedAt ?? null,
      elo: ELOS_BRAWL_PLANET.find((item) => item.id === elo)?.nome ?? null,
      ia: {
        principal: (iasComChave.some((ia) => ia.id === principalAgora) ? principalAgora : iasComChave[0]?.id ?? "gemini") as never,
        soEssa: escolhaDaIA.soEssa,
        rapido: escolhaDaIA.rapido,
        modelos: Object.fromEntries(Object.entries(escolhaDaIA.modelos).filter(([id, m]) => m && iasComChave.some((ia) => ia.id === id))),
      },
    });
  };

  // O que aparece ao passar o cursor.
  const dica = (() => {
    if (!cursor) return null;
    if (cursor.tipo === "marcador") {
      const marcador = camadas.marcadores.find((m) => m.id === cursor.id);
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
          ...(plano.ameacas ?? []).filter((a) => a.perigoso === ficha.nome).map((a) => `⚠ Perigoso para ${a.alvo}: ${a.texto}${a.excecao ? ` (exceto: ${a.excecao})` : ""}`),
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
          ordem.usarGadget ? `Gadget: ${ordem.usarGadget}` : "",
          ...ordem.cuidados.map((c) => `Cuidado: ${c}`),
          textoDaBuild(ordem.build),
          ordem.capacidades?.length ? `Pode: ${ordem.capacidades.map((c) => CAPACIDADES.find((item) => item.id === c)?.nome.toLowerCase()).join(", ")}` : "",
          ...(plano.ameacas ?? []).filter((a) => a.alvo === ficha.nome).map((a) => `⚠ ${a.perigoso}: ${a.texto}${a.excecao ? ` (exceto: ${a.excecao})` : ""}`),
          ...camadas.marcadores.filter((m) => m.brawler === ficha.nome).map((m) => `${TIPOS_DE_MARCADOR.find((t) => t.id === m.tipo)?.simbolo} ${m.nota}`),
        ].filter(Boolean)
        : [ehDono ? "Ainda sem ordens. Pede o plano ao general." : "Ainda sem ordens para este brawler."],
    };
  })();

  const ajuda = FERRAMENTAS.find((item) => item.id === ferramenta)?.ajuda;
  const temPlanoDaIA = plano.origem === "ia" && plano.ordens.length > 0;

  // Quando o draft fecha, o plano pede-se sozinho — uma vez por draft, e só se
  // ainda não houver plano da IA para estas equipas. Cada segundo conta: a
  // partida começa ~15 s depois.
  const jaPediuSozinho = useRef<string | null>(null);
  useEffect(() => {
    if (!ehDono || !escolhaDaIA.automatico || !estado || !temAlgumaIA || !mapa?.name) return;
    if (temPlanoDaIA || pedirPlano.isPending || jaPediuSozinho.current === chave) return;
    jaPediuSozinho.current = chave;
    pedir();
    // `pedir` muda a cada render; o que decide são as condições acima.
  }, [ehDono, escolhaDaIA.automatico, estado, temAlgumaIA, mapa?.name, temPlanoDaIA, pedirPlano.isPending, chave]);

  // Os segundos a contar enquanto a IA pensa: esperar sem saber quanto falta é pior.
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!pedirPlano.isPending) return;
    const inicio = Date.now();
    setSegundos(0);
    const relogio = window.setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 250);
    return () => window.clearInterval(relogio);
  }, [pedirPlano.isPending]);

  return (
    <section className="quadro-general" aria-label="Quadro do general: plano tático no mapa em 3D">
      <header className="quadro-general-cabecalho">
        <div>
          <h2>{mapa?.name ?? "O mapa"}{mapa?.modeId ? <small> · {NOME_DO_MODO[mapa.modeId] ?? mapa.modeId}</small> : null}</h2>
          <p>As lanes e os duelos 1v1 no mapa. Passa o cursor por um brawler para ver o que ele faz.</p>
        </div>
        {ehDono && (
          <div className="quadro-general-ia">
            {temAlgumaIA && (
              <>
                <button type="button" className="quadro-general-pedir" onClick={pedir} disabled={pedirPlano.isPending}>
                  {pedirPlano.isPending ? `O general está a pensar… ${segundos} s` : temPlanoDaIA ? "Pedir novo plano à IA" : "Pedir o plano ao general (IA)"}
                </button>
                <small>
                  {estado?.configured ? `Gemini · chave ${estado.hint}` : "Sem Gemini"}
                  {reservas.length ? ` · reservas: ${reservas.map((r) => `${r.nome} ${r.hint}`).join(", ")}` : ""}
                  {pedirPlano.isPending && !escolhaDaIA.rapido ? " · com pesquisa na web demora mais" : ""}
                </small>
              </>
            )}
            {temAlgumaIA && (
              <details className="quadro-general-reserva" onToggle={(e) => setVerModelos(e.currentTarget.open)}>
                <summary>
                  Que IA faz o plano: {nomeDaPrincipal}{escolhaDaIA.soEssa ? " (só essa)" : iasComChave.length > 1 ? "; se falhar, as outras" : ""}
                  {Object.values(escolhaDaIA.modelos).some(Boolean) ? " · modelo escolhido" : ""}
                </summary>
                <div className="quadro-general-escolha">
                  <label>
                    <span>IA principal</span>
                    <select value={iasComChave.some((ia) => ia.id === principalAgora) ? principalAgora : iasComChave[0]?.id ?? ""} onChange={(e) => setEscolhaDaIA((atual) => ({ ...atual, principal: e.target.value }))}>
                      {iasComChave.map((ia) => <option key={ia.id} value={ia.id}>{ia.nome}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Se ela falhar</span>
                    <select value={escolhaDaIA.soEssa ? "so" : "outras"} onChange={(e) => setEscolhaDaIA((atual) => ({ ...atual, soEssa: e.target.value === "so" }))}>
                      <option value="outras">Tentar as outras IAs com chave</option>
                      <option value="so">Parar (usar só esta)</option>
                    </select>
                  </label>
                  {iasComChave.map((ia) => {
                    const lista = ia.id === "gemini" ? modelos?.gemini ?? [] : modelos?.reservas?.[ia.id]?.modelos ?? [];
                    const erro = ia.id === "gemini" ? null : modelos?.reservas?.[ia.id]?.erro;
                    return (
                      <label key={ia.id}>
                        <span>Modelo · {ia.nome}{erro ? " — a chave falhou" : ""}</span>
                        <select value={escolhaDaIA.modelos[ia.id] ?? ""} onChange={(e) => mudarModelo(ia.id, e.target.value)} disabled={!lista.length} title={erro ?? undefined}>
                          <option value="">{ia.id === "gemini" ? "O melhor (flash; nunca o lite)" : "O melhor que houver"}</option>
                          {lista.map((m) => <option key={m} value={m}>{m}{ia.id === "gemini" && /lite/.test(m) ? " (lite — mais fraco)" : ""}</option>)}
                        </select>
                      </label>
                    );
                  })}
                  <label className="quadro-general-marcar">
                    <input type="checkbox" checked={escolhaDaIA.rapido} onChange={(e) => setEscolhaDaIA((atual) => ({ ...atual, rapido: e.target.checked }))} />
                    <span>Rápido: sem pesquisa na web (chega antes da partida começar)</span>
                  </label>
                  <label className="quadro-general-marcar">
                    <input type="checkbox" checked={escolhaDaIA.automatico} onChange={(e) => setEscolhaDaIA((atual) => ({ ...atual, automatico: e.target.checked }))} />
                    <span>Pedir o plano sozinho quando o draft fecha</span>
                  </label>
                  <small>{modelosQuery.isLoading ? "A ler os modelos das tuas chaves…" : "Se o modelo escolhido estiver no limite, tenta o seguinte da lista. A Groq é a mais rápida."}</small>
                </div>
              </details>
            )}
            <details className="quadro-general-reserva">
              <summary>{reservas.length ? `IAs de reserva: ${reservas.map((r) => r.nome).join(", ")}` : "IAs de reserva (quando a Google chegar ao limite)"}</summary>
              {reservas.length > 0 && (
                <ul className="quadro-general-reservas">
                  {reservas.map((r) => (
                    <li key={r.id}>
                      <span>{r.nome} <code>{r.hint}</code>{r.origin === "ambiente" ? " (do ambiente)" : ""}</span>
                      {r.origin === "site" && (
                        <button type="button" disabled={guardarChaveDeReserva.isPending} onClick={() => guardarChaveDeReserva.mutate({ fornecedor: r.id as never, key: "" })}>Apagar</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form className="quadro-general-chave" onSubmit={(e) => { e.preventDefault(); if (novaChaveDeReserva.trim()) guardarChaveDeReserva.mutate({ fornecedor: fornecedorDaNovaChave as never, key: novaChaveDeReserva }); }}>
                <label htmlFor="chave-reserva">Juntar a chave gratuita de outra IA</label>
                <div>
                  <select aria-label="De que IA é a chave" value={fornecedorDaNovaChave} onChange={(e) => setFornecedorDaNovaChave(e.target.value)}>
                    <option value="auto">Reconhecer pela chave</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                  <input id="chave-reserva" type="password" autoComplete="off" value={novaChaveDeReserva} onChange={(e) => setNovaChaveDeReserva(e.target.value)}
                    placeholder={fornecedores.find((f) => f.id === fornecedorDaNovaChave)?.exemplo ?? "gsk_…, sk-or-…, github_pat_…, hf_…, csk-…"} />
                  <button type="submit" disabled={guardarChaveDeReserva.isPending || novaChaveDeReserva.trim().length < 20}>Guardar</button>
                </div>
                <small>
                  Cria-a em{" "}
                  {fornecedores.map((f, i) => (
                    <span key={f.id}>
                      {i ? (i === fornecedores.length - 1 ? " ou " : ", ") : ""}
                      <a href={`https://${f.ondeCriar}`} target="_blank" rel="noopener noreferrer">{f.nome}</a>
                    </span>
                  ))}
                  . A Mistral e a Requesty não se reconhecem pela chave: escolhe-as na lista. Fica no servidor e nunca volta ao navegador.
                </small>
              </form>
            </details>
            {estado?.configured ? null : (
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
          {FERRAMENTAS.filter((item) => item.id !== "casa" || (ehDono && terreno)).map((item) => (
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
        {ferramenta === "casa" && (
          <div className="quadro-general-grupo" role="radiogroup" aria-label="Tipo de casa">
            {[...TIPOS_DE_CASA, "imagem" as const].map((tipo) => (
              <button key={tipo} type="button" role="radio" aria-checked={tipoDaCorrecao === tipo} className={tipoDaCorrecao === tipo ? "is-active" : ""} onClick={() => setTipoDaCorrecao(tipo)}>
                {tipo === "imagem" ? "Como na imagem" : NOME_DO_TIPO_DE_CASA[tipo]}
              </button>
            ))}
          </div>
        )}
        <div className="quadro-general-grupo quadro-general-vistas" aria-label="Vista">
          {VISTAS.map((item) => (
            <button key={item.id} type="button" onClick={() => { setPerspetiva(null); setVista((atual) => ({ id: item.id, pedido: atual.pedido + 1 })); }}>{item.nome}</button>
          ))}
          <label className="quadro-general-dono">
            <span>Ver como</span>
            <select
              aria-label="Ver o mapa da posição de um brawler"
              value=""
              onChange={(e) => { if (e.target.value) setPerspetiva((atual) => ({ chave: e.target.value, n: (atual?.n ?? 0) + 1 })); }}
            >
              <option value="">…</option>
              {fichas.map((ficha) => <option key={ficha.chave} value={ficha.chave}>{ficha.nome}{ficha.lado === "eles" ? " (adversário)" : ""}</option>)}
            </select>
          </label>
        </div>
        <label className="quadro-general-interruptor">
          <input type="checkbox" checked={notasNoMapa} onChange={(e) => setNotasNoMapa(e.target.checked)} />
          Notas no mapa
        </label>
        <label className="quadro-general-interruptor quadro-general-interruptor--seguinte">
          <input type="checkbox" checked={passosFantasma} onChange={(e) => setPassosFantasma(e.target.checked)} />
          Passos fantasma
        </label>
        {ameacas3D.length > 0 && (
          <label className="quadro-general-interruptor quadro-general-interruptor--seguinte">
            <input type="checkbox" checked={verAmeacas} onChange={(e) => setVerAmeacas(e.target.checked)} />
            Ameaças
          </label>
        )}
        <button type="button" className="quadro-general-repor" onClick={() => { setPlano(planoVazio(nomesNossos, nomesDeles)); setMomento("inicio"); }}>Repor tudo</button>
      </div>
      {ajuda && <p className="quadro-general-ajuda">{ajuda}</p>}

      <div className="qg-momentos" role="tablist" aria-label="Momento da partida">
        {MOMENTOS.map((item) => {
          const texto = plano.momentos?.find((m) => m.momento === item.id);
          const partidas = item.id === "inicio" ? 0 : camadasDoMomento(plano, item.id).paredesPartidas.length;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={momento === item.id}
              className={`qg-momento${momento === item.id ? " is-active" : ""}`}
              onClick={() => { setAReproduzir(false); setMomento(item.id); }}
            >
              <b>{item.nome}</b>
              {texto?.quando && <small>{texto.quando}</small>}
              {partidas > 0 && <small className="qg-momento-partidas">✹ {partidas} paredes caídas</small>}
            </button>
          );
        })}
        <button
          type="button"
          className="qg-reproduzir"
          onClick={() => { if (aReproduzir) setAReproduzir(false); else { setMomento("inicio"); setAReproduzir(true); } }}
        >
          {aReproduzir ? "❚❚ Parar" : "▶ Ver a partida"}
        </button>
        {textoDoMomento && (textoDoMomento.resumo || textoDoMomento.seGanhar || textoDoMomento.sePerder) && (
          <div className="qg-momento-texto" aria-live="polite">
            {textoDoMomento.resumo && <strong>{textoDoMomento.resumo}</strong>}
            {textoDoMomento.seGanhar && <span className="qg-chip qg-chip--verde">▲ A ganhar: {textoDoMomento.seGanhar}</span>}
            {textoDoMomento.sePerder && <span className="qg-chip qg-chip--vermelho">▼ A perder: {textoDoMomento.sePerder}</span>}
          </div>
        )}
      </div>

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
                setas={camadas.setas}
                marcadores={camadas.marcadores}
                duelos={duelos3D}
                trilhos={passosFantasma && momento === "inicio" ? plano.trilhos : semTrilhos}
                notasNoMapa={notasNoMapa}
                paredesPartidas={camadas.paredesPartidas}
                ameacas={verAmeacas ? ameacas3D : semAmeacas}
                perspetiva={perspetiva}
                onCasa={corrigirCasa}
                ferramenta={ferramenta}
                tipoDeSeta={tipoDeSeta}
                tipoDeMarcador={tipoDeMarcador}
                vista={vista.id}
                pedidoDeVista={vista.pedido}
                comando={comando}
                onMoverFicha={moverFicha}
                onMoverMarcador={(id, ponto) => mudarCamadas((atuais) => ({ ...atuais, marcadores: atuais.marcadores.map((m) => (m.id === id ? { ...m, ponto } : m)) }))}
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
            <div className="qg-resumo">
              {plano.resumo && <strong>{plano.resumo}</strong>}
              {plano.condicaoDeVitoria && <span className="qg-chip qg-chip--ouro">🏆 {plano.condicaoDeVitoria}</span>}
            </div>
          ) : (
            <p className="quadro-general-vazio">
              {ehDono
                ? estado?.configured ? "Pede o plano ao general: ele analisa o mapa, prevê o adversário e preenche o quadro." : "Cola a chave gratuita da Gemini para o general poder analisar o mapa."
                : "Monta o teu plano: move os brawlers, desenha setas e põe símbolos. Fica guardado neste navegador."}
            </p>
          )}

          {duelos.length > 0 && (
            <div className="qg-duelos" aria-label="Duelos 1v1 por lane">
              <span className="qg-titulo">DUELOS 1V1</span>
              {duelos.map((d) => {
                const estado = d.vantagem >= 55 ? "ganha" : d.vantagem <= 45 ? "perde" : "igual";
                return (
                  <div key={d.nosso} className={`qg-duelo qg-duelo--${estado}`}>
                    <small>{d.posicao === "mid" ? "MID" : d.posicao === "left" ? "LANE ESQ." : "LANE DIR."}</small>
                    <Retrato url={retratoDe(d.linhaNossa)} nome={d.nosso} lado="nos" />
                    <b>{Math.round(d.vantagem)}%</b>
                    <Retrato url={retratoDe(d.linhaDeles)} nome={d.deles} lado="eles" />
                  </div>
                );
              })}
            </div>
          )}

          {plano.ordens.length > 0 && (
            <ol className="qg-ordens">
              {plano.ordens.map((ordem) => {
                const linha = nossos.find((l) => l.brawler === ordem.brawler);
                const b = ordem.build;
                return (
                  <li key={ordem.brawler}>
                    <header>
                      <Retrato url={linha ? retratoDe(linha) : null} nome={ordem.brawler} lado="nos" />
                      <div>
                        <strong>{ordem.brawler}</strong>
                        {ordem.funcao && <em>{ordem.funcao}</em>}
                      </div>
                    </header>
                    {ordem.objetivo && <p className="qg-objetivo">🎯 {ordem.objetivo}</p>}
                    <div className="qg-chips">
                      {ordem.quandoAvancar && <span className="qg-chip qg-chip--verde">▲ {ordem.quandoAvancar}</span>}
                      {ordem.cuidados.slice(0, 1).map((c, i) => <span key={i} className="qg-chip qg-chip--vermelho">⚠ {c}</span>)}
                      {ordem.usarGadget && <span className="qg-chip qg-chip--gadget">◆ Gadget: {ordem.usarGadget}</span>}
                      {(plano.ameacas ?? []).filter((a) => a.alvo === ordem.brawler).map((a) => (
                        <span key={a.id} className="qg-chip qg-chip--ameaca">☠ {a.perigoso}: {a.texto}{a.excecao ? ` · exceto: ${a.excecao}` : ""}</span>
                      ))}
                      {ordem.capacidades?.map((c) => <span key={c} className="qg-chip qg-chip--azul">{CAPACIDADES.find((item) => item.id === c)?.nome}</span>)}
                    </div>
                    {b && (b.gadget || b.poderEstelar || b.engrenagens.length > 0) && (
                      <div className="qg-build" aria-label={`Build de ${ordem.brawler}: ${textoDaBuild(b)}`}>
                        {b.gadget && <ItemDaBuild nome={b.gadget} imagem={b.imagens?.gadget} tipo="Gadget" />}
                        {b.poderEstelar && <ItemDaBuild nome={b.poderEstelar} imagem={b.imagens?.poderEstelar} tipo="Poder estelar" />}
                        {b.engrenagens.map((e, i) => <ItemDaBuild key={e} nome={e} imagem={b.imagens?.engrenagens?.[i]} tipo="Engrenagem" />)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {plano.previsao.length > 0 && (
            <div className="qg-previsao">
              <span className="qg-titulo">ADVERSÁRIO VAI…</span>
              <ul>{plano.previsao.map((linha, i) => <li key={i}>{linha}</li>)}</ul>
            </div>
          )}

          {(plano.ameacas ?? []).some((a) => a.ladoDoPerigoso === "nos") && (
            <div className="qg-previsao qg-previsao--nossa">
              <span className="qg-titulo">NÓS SOMOS PERIGOSOS PARA…</span>
              <ul>{(plano.ameacas ?? []).filter((a) => a.ladoDoPerigoso === "nos").map((a) => <li key={a.id}><b>{a.perigoso} → {a.alvo}</b>: {a.texto}{a.excecao ? ` (exceto: ${a.excecao})` : ""}</li>)}</ul>
            </div>
          )}

          {!plano.momentos?.length && plano.fases.length > 0 && (
            <ol className="qg-fases">
              {plano.fases.map((fase, i) => <li key={i}><b>{fase.nome}</b><span>{fase.instrucao}</span></li>)}
            </ol>
          )}

          {camadas.marcadores.length > 0 && (
            <details className="quadro-general-simbolos">
              <summary>Editar notas dos símbolos · {MOMENTOS.find((m) => m.id === momento)?.nome.toLowerCase()} ({camadas.marcadores.length})</summary>
              <ul>
                {camadas.marcadores.map((marcador) => (
                  <li key={marcador.id}>
                    <b style={{ color: COR_DO_MARCADOR[marcador.tipo] }} title={marcador.brawler ? `${marcador.brawler}` : "Equipa"} aria-hidden="true">{TIPOS_DE_MARCADOR.find((t) => t.id === marcador.tipo)?.simbolo}</b>
                    <input
                      aria-label="Nota do símbolo"
                      value={marcador.nota}
                      maxLength={60}
                      onChange={(e) => mudarCamadas((atuais) => ({ ...atuais, marcadores: atuais.marcadores.map((m) => (m.id === marcador.id ? { ...m, nota: e.target.value } : m)) }))}
                    />
                    <button type="button" aria-label="Apagar símbolo" onClick={() => apagar("marcador", marcador.id)}>×</button>
                  </li>
                ))}
              </ul>
            </details>
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
