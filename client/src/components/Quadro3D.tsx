/**
 * O mapa em 3D do quadro do general.
 *
 * O chão é a imagem do mapa; as casas de parede e de mato sobem em blocos,
 * com o topo recortado da mesma imagem — por isso cada tema fica com as suas
 * cores sem nada desenhado à mão. Os brawlers são retratos que olham sempre
 * para a câmara; as setas e os símbolos ficam por cima de tudo, como num
 * plano de batalha.
 *
 * Carregado à parte (ver `QuadroDoGeneral`): o three.js só é descarregado por
 * quem chega ao fim do draft.
 *
 * Coordenadas: o plano guarda frações do mapa (0–1). Aqui o mapa tem 21×33
 * unidades, centrado na origem: x para a direita, z para baixo (a tua base).
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { CasaDoMapa, MarcadorDoPlano, PontoNoMapa, SetaDoPlano, TipoDeMarcador, TipoDeSeta, TrilhoDoPlano } from "@shared/quadroDoGeneral";
import { TIPOS_DE_MARCADOR } from "@shared/quadroDoGeneral";
import { tipoDaCasa, type TerrenoDoMapa } from "@shared/terrenoDoMapa";
import { COR_DA_SETA, COR_DO_MARCADOR } from "./coresDoQuadro";

export type FichaNo3D = { chave: string; nome: string; lado: "nos" | "eles"; retrato: string | null; ponto: PontoNoMapa; funcao?: string };
/** Um duelo 1v1: a linha entre as duas fichas, com a vantagem da tua equipa. */
export type DueloNo3D = { nosso: string; deles: string; vantagem: number };
/** `casa`: só para o dono — clicar numa casa corrige o tipo dela. */
export type Ferramenta = "mover" | "seta" | "simbolo" | "apagar" | "casa";
/** Uma ameaça: um círculo vermelho à volta de quem é perigoso, com o aviso para quem não se deve aproximar. */
export type AmeacaNo3D = { id: string; perigoso: string; alvo: string; texto: string; excecao?: string };
export type Vista = "nossa" | "deles" | "cima" | "lado" | "rasante";
/** Os botões de câmara no ecrã, para quem não tem rato (ou prefere clicar). */
export type ComandoDeCamara = "rodar-esquerda" | "rodar-direita" | "subir" | "descer" | "aproximar" | "afastar";
export type AlvoDoCursor = { tipo: "ficha" | "marcador"; id: string; x: number; y: number } | null;

type Props = {
  imagem: string | null;
  terreno: TerrenoDoMapa | null;
  fichas: FichaNo3D[];
  setas: SetaDoPlano[];
  marcadores: MarcadorDoPlano[];
  duelos: DueloNo3D[];
  /** Passos fantasma: por onde cada brawler vai andar mais. Vazio = não desenhar. */
  trilhos: TrilhoDoPlano[];
  /** Escrever a nota ao lado de cada símbolo, no próprio mapa. */
  notasNoMapa: boolean;
  /** Paredes que já caíram no momento mostrado: ficam escombros. */
  paredesPartidas: CasaDoMapa[];
  ameacas: AmeacaNo3D[];
  /** Pôr a câmara atrás de um brawler, a olhar para onde ele joga. Muda `n` para pedir outra vez. */
  perspetiva: { chave: string; n: number } | null;
  /** Ferramenta "casa": a casa clicada. */
  onCasa?: (coluna: number, linha: number) => void;
  ferramenta: Ferramenta;
  tipoDeSeta: TipoDeSeta;
  tipoDeMarcador: TipoDeMarcador;
  vista: Vista;
  /** Muda a cada clique num botão de vista, para a mesma vista poder ser pedida outra vez. */
  pedidoDeVista: number;
  comando: { acao: ComandoDeCamara; n: number } | null;
  onMoverFicha: (chave: string, ponto: PontoNoMapa) => void;
  onMoverMarcador: (id: string, ponto: PontoNoMapa) => void;
  onNovaSeta: (seta: Omit<SetaDoPlano, "id">) => void;
  onNovoMarcador: (tipo: TipoDeMarcador, ponto: PontoNoMapa) => void;
  onApagar: (tipo: "seta" | "marcador", id: string) => void;
  onCursor: (alvo: AlvoDoCursor) => void;
  onErro: (mensagem: string) => void;
};

const LARGURA = 21;
const PROFUNDIDADE = 33;
const ALTURA_DA_PAREDE = 1;
const ALTURA_DO_JARRO = 0.84;
const COR_DO_LADO = { nos: "#37c8ff", eles: "#ff4d6d" } as const;

const paraMundo = (ponto: PontoNoMapa) => new THREE.Vector3((ponto.x - 0.5) * LARGURA, 0, (ponto.y - 0.5) * PROFUNDIDADE);
const paraPlano = (v: THREE.Vector3): PontoNoMapa => ({
  x: Math.min(0.99, Math.max(0.01, v.x / LARGURA + 0.5)),
  y: Math.min(0.99, Math.max(0.01, v.z / PROFUNDIDADE + 0.5)),
});

const POSICAO_DA_VISTA: Record<Vista, [number, number, number]> = {
  nossa: [0, 25, 20],
  deles: [0, 25, -20],
  cima: [0, 40, 0.01],
  lado: [27, 16, 0],
  // Quase ao nível do chão, atrás da tua base: vê-se o mato de lado.
  rasante: [0, 2.2, 21],
};
const ALVO_DA_VISTA: Record<Vista, [number, number, number]> = {
  nossa: [0, 0, 0],
  deles: [0, 0, 0],
  cima: [0, 0, 0],
  lado: [0, 0, 0],
  rasante: [0, 0.6, 6],
};

/** O fundo: um céu escuro em degradê, para o mapa não flutuar no preto. */
function fundoDoCeu() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const degrade = ctx.createLinearGradient(0, 0, 0, 256);
  degrade.addColorStop(0, "#1d3557");
  degrade.addColorStop(0.55, "#0f1b2d");
  degrade.addColorStop(1, "#070b14");
  ctx.fillStyle = degrade;
  ctx.fillRect(0, 0, 4, 256);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/** Um aviso de ameaça: "⚠ Shade: não chegues perto" e, por baixo, a exceção. */
function desenharAmeaca(titulo: string, excecao?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = excecao ? 176 : 104;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 42px sans-serif";
  const largura = Math.min(700, Math.max(ctx.measureText(titulo).width, excecao ? ctx.measureText(`exceto: ${excecao}`).width * 0.86 : 0) + 44);
  ctx.fillStyle = "rgba(40,6,12,.92)";
  ctx.beginPath();
  ctx.roundRect(360 - largura / 2, 8, largura, canvas.height - 16, 18);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#ff4d6d";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd5dc";
  ctx.fillText(titulo, 360, 54, 680);
  if (excecao) {
    ctx.font = "bold 36px sans-serif";
    ctx.fillStyle = "#ffd23f";
    ctx.fillText(`exceto: ${excecao}`, 360, 124, 680);
  }
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/** O perfil de um jarro de barro, rodado à volta do eixo. */
function geometriaDoJarro() {
  const perfil = [[0, 0], [0.24, 0], [0.33, 0.1], [0.37, 0.32], [0.31, 0.56], [0.19, 0.7], [0.22, 0.78], [0.2, ALTURA_DO_JARRO], [0, ALTURA_DO_JARRO]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(perfil, 14);
}

/** Um número pseudo-aleatório fixo por casa: o mato e os escombros não mudam de forma a cada desenho. */
const aleatorio = (semente: number) => {
  const x = Math.sin(semente * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** O retrato num círculo com a cor da equipa e o nome por baixo. */
function desenharFicha(nome: string, lado: "nos" | "eles", imagem: HTMLImageElement | null, funcao?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(128, 124, 112, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(6,9,16,.92)";
  ctx.fill();
  if (imagem) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(128, 124, 104, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(imagem, 24, 20, 208, 208);
    ctx.restore();
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 84px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(nome.slice(0, 2).toUpperCase(), 128, 128);
  }
  ctx.lineWidth = 14;
  ctx.strokeStyle = COR_DO_LADO[lado];
  ctx.beginPath();
  ctx.arc(128, 124, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const largura = Math.min(250, ctx.measureText(nome).width + 28);
  ctx.fillStyle = "rgba(6,9,16,.88)";
  ctx.beginPath();
  ctx.roundRect(128 - largura / 2, 256, largura, 56, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(nome, 128, 285, 236);
  // A função por baixo do nome: lê-se no mapa sem abrir nada.
  if (funcao) {
    ctx.font = "bold 30px sans-serif";
    const larguraDaFuncao = Math.min(252, ctx.measureText(funcao).width + 24);
    ctx.fillStyle = COR_DO_LADO[lado];
    ctx.beginPath();
    ctx.roundRect(128 - larguraDaFuncao / 2, 320, larguraDaFuncao, 46, 23);
    ctx.fill();
    ctx.fillStyle = "#06101c";
    ctx.fillText(funcao, 128, 344, 240);
  }
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/**
 * O símbolo com a nota escrita ao lado — a explicação fica no mapa. O círculo
 * fica à esquerda do desenho; o `center` do sprite põe-no em cima do ponto.
 */
function desenharSimbolo(tipo: TipoDeMarcador, nota?: string, dono?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = nota ? 640 : 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  if (nota) {
    ctx.font = "bold 40px sans-serif";
    const texto = dono ? `${dono}: ${nota}` : nota;
    const largura = Math.min(500, ctx.measureText(texto).width + 36);
    ctx.fillStyle = "rgba(6,9,16,.9)";
    ctx.beginPath();
    ctx.roundRect(100, 30, largura, 68, 14);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = COR_DO_MARCADOR[tipo];
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, 120, 66, 470);
  }
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(6,9,16,.9)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = COR_DO_MARCADOR[tipo];
  ctx.stroke();
  ctx.fillStyle = COR_DO_MARCADOR[tipo];
  ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(TIPOS_DE_MARCADOR.find((item) => item.id === tipo)?.simbolo ?? "•", 64, 68);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/** Um texto curto num balão, com a cor da seta. */
function desenharEtiqueta(texto: string, cor: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 44px sans-serif";
  const largura = Math.min(620, ctx.measureText(texto).width + 40);
  ctx.fillStyle = "rgba(6,9,16,.88)";
  ctx.beginPath();
  ctx.roundRect(320 - largura / 2, 28, largura, 72, 36);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = cor;
  ctx.stroke();
  ctx.fillStyle = cor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, 320, 66, 590);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

function desenharPercentagem(vantagem: number, cor: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(6,9,16,.92)";
  ctx.beginPath();
  ctx.roundRect(8, 12, 176, 72, 36);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = cor;
  ctx.stroke();
  ctx.fillStyle = cor;
  ctx.font = "bold 48px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(vantagem)}%`, 96, 50);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/** Uma seta plana no chão: haste e ponta num só polígono. */
function geometriaDaSeta(de: THREE.Vector3, para: THREE.Vector3) {
  const comprimento = Math.max(0.2, de.distanceTo(para));
  const ponta = Math.min(1.1, comprimento * 0.45);
  const haste = 0.22, largura = 0.6;
  const forma = new THREE.Shape();
  forma.moveTo(0, -haste);
  forma.lineTo(comprimento - ponta, -haste);
  forma.lineTo(comprimento - ponta, -largura);
  forma.lineTo(comprimento, 0);
  forma.lineTo(comprimento - ponta, largura);
  forma.lineTo(comprimento - ponta, haste);
  forma.lineTo(0, haste);
  forma.closePath();
  const geometria = new THREE.ShapeGeometry(forma);
  geometria.rotateX(-Math.PI / 2);
  geometria.rotateY(-Math.atan2(para.z - de.z, para.x - de.x));
  geometria.translate(de.x, 0.08, de.z);
  return geometria;
}

export default function Quadro3D(props: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  // Os callbacks mudam a cada render; os ouvintes do three.js leem sempre o mais recente.
  const atual = useRef(props);
  atual.current = props;
  // Onde cada ficha foi desenhada da última vez: ao mudar de momento, anda de lá para cá.
  const ultimaPosicao = useRef(new Map<string, THREE.Vector3>());
  // Na vista de um brawler, o retrato dele esconde-se: não tapa o mapa à frente.
  const vistoComo = props.perspetiva?.chave ?? null;
  const cena = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    pedirDesenho: () => void;
    voarPara: (vista: Vista) => void;
    comandar: (acao: ComandoDeCamara) => void;
    olharComo: (ponto: PontoNoMapa, para: PontoNoMapa) => void;
    deslizar: (objeto: THREE.Object3D, de: THREE.Vector3, para: THREE.Vector3) => void;
    grupoDoTerreno: THREE.Group;
    grupoDasFichas: THREE.Group;
    grupoDasSetas: THREE.Group;
    grupoDosMarcadores: THREE.Group;
    grupoDosDuelos: THREE.Group;
    grupoDosTrilhos: THREE.Group;
    grupoDasAmeacas: THREE.Group;
    texturaDoMapa: { url: string | null; textura: THREE.Texture | null };
  } | null>(null);

  /* ---- A cena, uma vez. ---- */
  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      atual.current.onErro("Este navegador não consegue mostrar 3D (WebGL desligado).");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#0b1320");
    // Sombras suaves: as paredes e o mato projetam sombra no chão, e o mapa ganha relevo.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    elemento.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.background = fundoDoCeu();
    scene.fog = new THREE.Fog("#0b1320", 55, 120);
    scene.add(new THREE.HemisphereLight("#e8f4ff", "#3a2f25", 1.35));
    const sol = new THREE.DirectionalLight("#fff3e0", 1.9);
    sol.position.set(-10, 24, 12);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.camera.left = -16;
    sol.shadow.camera.right = 16;
    sol.shadow.camera.top = 22;
    sol.shadow.camera.bottom = -22;
    sol.shadow.camera.near = 1;
    sol.shadow.camera.far = 70;
    sol.shadow.bias = -0.0006;
    sol.shadow.normalBias = 0.02;
    scene.add(sol, sol.target);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(...POSICAO_DA_VISTA.nossa);

    const grupoDoTerreno = new THREE.Group();
    const grupoDasFichas = new THREE.Group();
    const grupoDasSetas = new THREE.Group();
    const grupoDosMarcadores = new THREE.Group();
    // Os duelos à parte: o cursor não os apanha, para não taparem as fichas.
    const grupoDosDuelos = new THREE.Group();
    const grupoDosTrilhos = new THREE.Group();
    // As ameaças também não se apanham com o cursor.
    const grupoDasAmeacas = new THREE.Group();
    scene.add(grupoDoTerreno, grupoDosTrilhos, grupoDasAmeacas, grupoDosDuelos, grupoDasSetas, grupoDosMarcadores, grupoDasFichas);

    let sujo = true;
    // Deslizes: um brawler que muda de sítio (de um momento da partida para outro) anda até lá.
    const deslizes = new Map<THREE.Object3D, { de: THREE.Vector3; para: THREE.Vector3; inicio: number }>();
    const deslizar = (objeto: THREE.Object3D, de: THREE.Vector3, para: THREE.Vector3) => {
      objeto.position.copy(de);
      deslizes.set(objeto, { de, para, inicio: performance.now() });
      sujo = true;
    };
    let voo: { de: THREE.Vector3; para: THREE.Vector3; alvoDe: THREE.Vector3; alvoPara: THREE.Vector3; inicio: number } | null = null;
    const pedirDesenho = () => { sujo = true; };

    // Os ouvintes do cursor vêm ANTES dos controlos da câmara: assim, ao
    // agarrar uma ficha, desliga-se a rotação antes de ela começar.
    const raycaster = new THREE.Raycaster();
    const chao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const rato = new THREE.Vector2();
    const apontar = (evento: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      rato.set(((evento.clientX - r.left) / r.width) * 2 - 1, -((evento.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(rato, camera);
    };
    const pontoNoChao = () => {
      const v = new THREE.Vector3();
      return raycaster.ray.intersectPlane(chao, v) ? v : null;
    };
    const tocado = (grupo: THREE.Group) => raycaster.intersectObjects(grupo.children, true)[0]?.object;
    const idDe = (objeto: THREE.Object3D | undefined) => {
      for (let o = objeto; o; o = o.parent ?? undefined) if (o.userData.id) return o.userData as { id: string; tipo: string };
      return null;
    };

    let arrasto: { tipo: "ficha" | "marcador"; id: string; objeto: THREE.Object3D } | null = null;
    let setaEmCurso: { de: THREE.Vector3; malha: THREE.Mesh } | null = null;

    const aoCarregar = (evento: PointerEvent) => {
      if (evento.button !== 0) return;
      apontar(evento);
      const { ferramenta } = atual.current;
      if (ferramenta === "mover") {
        const alvo = idDe(tocado(grupoDasFichas)) ?? idDe(tocado(grupoDosMarcadores));
        if (!alvo) return;
        const objeto = [...grupoDasFichas.children, ...grupoDosMarcadores.children].find((o) => o.userData.id === alvo.id);
        if (!objeto) return;
        arrasto = { tipo: alvo.tipo as "ficha" | "marcador", id: alvo.id, objeto };
        controls.enabled = false;
        renderer.domElement.setPointerCapture(evento.pointerId);
        return;
      }
      controls.enabled = false;
      renderer.domElement.setPointerCapture(evento.pointerId);
      if (ferramenta === "seta") {
        const de = pontoNoChao();
        if (!de) return;
        const material = new THREE.MeshBasicMaterial({ color: COR_DA_SETA[atual.current.tipoDeSeta], transparent: true, opacity: 0.7, depthTest: false });
        const malha = new THREE.Mesh(geometriaDaSeta(de, de.clone().add(new THREE.Vector3(0.2, 0, 0))), material);
        malha.renderOrder = 10;
        scene.add(malha);
        setaEmCurso = { de, malha };
      }
    };
    const aoMover = (evento: PointerEvent) => {
      apontar(evento);
      if (arrasto) {
        const p = pontoNoChao();
        if (p) {
          const plano = paraPlano(p);
          const mundo = paraMundo(plano);
          arrasto.objeto.position.x = mundo.x;
          arrasto.objeto.position.z = mundo.z;
          pedirDesenho();
        }
        return;
      }
      if (setaEmCurso) {
        const p = pontoNoChao();
        if (p) {
          setaEmCurso.malha.geometry.dispose();
          setaEmCurso.malha.geometry = geometriaDaSeta(setaEmCurso.de, p);
          pedirDesenho();
        }
        return;
      }
      // Passar por cima: diz ao quadro onde está o cursor, para mostrar as ordens.
      const alvo = idDe(tocado(grupoDasFichas)) ?? idDe(tocado(grupoDosMarcadores));
      renderer.domElement.style.cursor = alvo && atual.current.ferramenta === "mover" ? "grab" : atual.current.ferramenta === "mover" ? "default" : "crosshair";
      atual.current.onCursor(alvo && (alvo.tipo === "ficha" || alvo.tipo === "marcador")
        ? { tipo: alvo.tipo, id: alvo.id, x: evento.clientX, y: evento.clientY }
        : null);
    };
    const aoLargar = (evento: PointerEvent) => {
      if (renderer.domElement.hasPointerCapture(evento.pointerId)) renderer.domElement.releasePointerCapture(evento.pointerId);
      controls.enabled = true;
      apontar(evento);
      const { ferramenta } = atual.current;
      if (arrasto) {
        const ponto = paraPlano(arrasto.objeto.position);
        // Largada à mão: fica onde foi largada, sem deslizar de volta.
        if (arrasto.tipo === "ficha") ultimaPosicao.current.set(arrasto.id, paraMundo(ponto));
        if (arrasto.tipo === "ficha") atual.current.onMoverFicha(arrasto.id, ponto);
        else atual.current.onMoverMarcador(arrasto.id, ponto);
        arrasto = null;
        return;
      }
      if (setaEmCurso) {
        const para = pontoNoChao();
        scene.remove(setaEmCurso.malha);
        setaEmCurso.malha.geometry.dispose();
        (setaEmCurso.malha.material as THREE.Material).dispose();
        if (para && para.distanceTo(setaEmCurso.de) > 0.8) {
          atual.current.onNovaSeta({ de: paraPlano(setaEmCurso.de), para: paraPlano(para), tipo: atual.current.tipoDeSeta });
        }
        setaEmCurso = null;
        pedirDesenho();
        return;
      }
      if (evento.button !== 0) return;
      if (ferramenta === "simbolo") {
        const p = pontoNoChao();
        if (p) atual.current.onNovoMarcador(atual.current.tipoDeMarcador, paraPlano(p));
      } else if (ferramenta === "casa") {
        const p = pontoNoChao();
        if (p && Math.abs(p.x) < LARGURA / 2 && Math.abs(p.z) < PROFUNDIDADE / 2) {
          atual.current.onCasa?.(Math.floor(p.x + LARGURA / 2), Math.floor(p.z + PROFUNDIDADE / 2));
        }
      } else if (ferramenta === "apagar") {
        const alvo = idDe(tocado(grupoDosMarcadores)) ?? idDe(tocado(grupoDasSetas));
        if (alvo && (alvo.tipo === "marcador" || alvo.tipo === "seta")) atual.current.onApagar(alvo.tipo, alvo.id);
      }
    };
    const aoSair = () => atual.current.onCursor(null);
    renderer.domElement.addEventListener("pointerdown", aoCarregar);
    renderer.domElement.addEventListener("pointermove", aoMover);
    renderer.domElement.addEventListener("pointerup", aoLargar);
    renderer.domElement.addEventListener("pointerleave", aoSair);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    // Câmara livre: dá para descer quase ao chão (ver o mato de lado) e chegar
    // muito perto. A roda aproxima na direção do cursor.
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 1.5;
    controls.maxDistance = 70;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = false;
    // Esquerdo roda, direito arrasta o mapa; com uma ferramenta de desenho, o
    // esquerdo desenha e o direito continua a arrastar. No telemóvel: um dedo
    // roda, dois dedos aproximam e arrastam.
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.addEventListener("change", () => {
      // O ponto para onde a câmara olha não sai do mapa.
      controls.target.x = Math.max(-LARGURA / 2, Math.min(LARGURA / 2, controls.target.x));
      controls.target.z = Math.max(-PROFUNDIDADE / 2, Math.min(PROFUNDIDADE / 2, controls.target.z));
      controls.target.y = Math.max(0, Math.min(3, controls.target.y));
      pedirDesenho();
    });
    controls.update();

    const voar = (para: THREE.Vector3, alvoPara: THREE.Vector3) => {
      voo = { de: camera.position.clone(), para, alvoDe: controls.target.clone(), alvoPara, inicio: performance.now() };
      pedirDesenho();
    };
    const voarPara = (vista: Vista) => voar(new THREE.Vector3(...POSICAO_DA_VISTA[vista]), new THREE.Vector3(...ALVO_DA_VISTA[vista]));
    const comandar = (acao: ComandoDeCamara) => {
      const esfera = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      if (acao === "rodar-esquerda") esfera.theta -= Math.PI / 8;
      if (acao === "rodar-direita") esfera.theta += Math.PI / 8;
      if (acao === "subir") esfera.phi = Math.max(0.05, esfera.phi - 0.2);
      if (acao === "descer") esfera.phi = Math.min(controls.maxPolarAngle, esfera.phi + 0.2);
      if (acao === "aproximar") esfera.radius = Math.max(controls.minDistance, esfera.radius * 0.72);
      if (acao === "afastar") esfera.radius = Math.min(controls.maxDistance, esfera.radius / 0.72);
      voar(new THREE.Vector3().setFromSpherical(esfera).add(controls.target), controls.target.clone());
    };

    const ajustar = () => {
      const { clientWidth, clientHeight } = elemento;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      pedirDesenho();
    };
    const observador = new ResizeObserver(ajustar);
    observador.observe(elemento);
    ajustar();

    let quadro = 0;
    const ciclo = () => {
      quadro = requestAnimationFrame(ciclo);
      if (voo) {
        const t = Math.min(1, (performance.now() - voo.inicio) / 600);
        const suave = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(voo.de, voo.para, suave);
        controls.target.lerpVectors(voo.alvoDe, voo.alvoPara, suave);
        controls.update();
        if (t >= 1) voo = null;
        sujo = true;
      }
      for (const [objeto, d] of deslizes) {
        const t = Math.min(1, (performance.now() - d.inicio) / 900);
        const suave = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        objeto.position.lerpVectors(d.de, d.para, suave);
        if (t >= 1) deslizes.delete(objeto);
        sujo = true;
      }
      if (!sujo) return;
      sujo = false;
      renderer.render(scene, camera);
    };
    ciclo();

    // Atrás do brawler, um pouco acima, a olhar para onde ele joga: para os adversários (ou para o meio, se já estiver colado a eles).
    const olharComo = (ponto: PontoNoMapa, para: PontoNoMapa) => {
      const p = paraMundo(ponto);
      let direcao = paraMundo(para).sub(p).setY(0);
      if (direcao.length() < 1.5) direcao = new THREE.Vector3(0, 0, 0).sub(p).setY(0);
      if (direcao.length() < 0.5) direcao.set(0, 0, -1);
      direcao.normalize();
      voar(p.clone().addScaledVector(direcao, -2.2).setY(3.2), p.clone().addScaledVector(direcao, 8).setY(0.3));
    };

    cena.current = { scene, camera, renderer, controls, pedirDesenho, voarPara, comandar, olharComo, deslizar, grupoDoTerreno, grupoDasFichas, grupoDasSetas, grupoDosMarcadores, grupoDosDuelos, grupoDosTrilhos, grupoDasAmeacas, texturaDoMapa: { url: null, textura: null } };

    return () => {
      cancelAnimationFrame(quadro);
      observador.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", aoCarregar);
      renderer.domElement.removeEventListener("pointermove", aoMover);
      renderer.domElement.removeEventListener("pointerup", aoLargar);
      renderer.domElement.removeEventListener("pointerleave", aoSair);
      scene.traverse((objeto) => {
        const malha = objeto as THREE.Mesh;
        malha.geometry?.dispose();
        const materiais = Array.isArray(malha.material) ? malha.material : malha.material ? [malha.material] : [];
        for (const material of materiais) {
          (material as THREE.MeshBasicMaterial).map?.dispose();
          material.dispose();
        }
      });
      cena.current?.texturaDoMapa.textura?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cena.current = null;
    };
  }, []);

  /* ---- O terreno: chão com a imagem, blocos de parede e de mato. ---- */
  useEffect(() => {
    const c = cena.current;
    if (!c) return;
    const limpar = () => {
      for (const filho of [...c.grupoDoTerreno.children]) {
        c.grupoDoTerreno.remove(filho);
        (filho as THREE.Mesh).geometry?.dispose();
        const material = (filho as THREE.Mesh).material as THREE.Material | THREE.Material[];
        for (const m of Array.isArray(material) ? material : [material]) m?.dispose();
      }
    };
    let cancelado = false;
    const construir = (textura: THREE.Texture | null) => {
      if (cancelado) return;
      limpar();
      const materialDoChao = new THREE.MeshLambertMaterial(textura ? { map: textura } : { color: "#2f6b3c" });
      const chao = new THREE.Mesh(new THREE.PlaneGeometry(LARGURA, PROFUNDIDADE), materialDoChao);
      chao.rotation.x = -Math.PI / 2;
      chao.receiveShadow = true;
      // A imagem tem uma casa de margem à volta: o chão mostra só o mapa.
      const uv = chao.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (1 + uv.getX(i) * LARGURA) / 23, (1 + uv.getY(i) * PROFUNDIDADE) / 35);
      c.grupoDoTerreno.add(chao);
      // A moldura: um rebordo de pedra escura à volta, para o mapa não flutuar.
      const moldura = new THREE.Mesh(new RoundedBoxGeometry(LARGURA + 1.2, 0.8, PROFUNDIDADE + 1.2, 2, 0.25), new THREE.MeshStandardMaterial({ color: "#16202f", roughness: 0.9 }));
      moldura.position.y = -0.41;
      moldura.receiveShadow = true;
      c.grupoDoTerreno.add(moldura);

      const terreno = atual.current.terreno;
      if (terreno) {
        const partidas = new Set(atual.current.paredesPartidas.map((casa) => casa.linha * terreno.colunas + casa.coluna));
        const corDaCasa = (coluna: number, linha: number) => {
          const grupo = terreno.grupos.find((g) => g.id === terreno.grelha[linha * terreno.colunas + coluna]);
          return new THREE.Color(`rgb(${(grupo?.cor ?? [120, 120, 120]).join(",")})`);
        };
        const casasDe = (tipo: string) => {
          const casas: Array<{ coluna: number; linha: number; cor: THREE.Color }> = [];
          for (let linha = 0; linha < terreno.linhas; linha++) {
            for (let coluna = 0; coluna < terreno.colunas; coluna++) {
              if (tipoDaCasa(terreno, coluna, linha) === tipo) casas.push({ coluna, linha, cor: corDaCasa(coluna, linha) });
            }
          }
          return casas;
        };
        const centro = (coluna: number, linha: number) => [coluna - LARGURA / 2 + 0.5, linha - PROFUNDIDADE / 2 + 0.5] as const;
        const matriz = new THREE.Matrix4();

        // Paredes: blocos de cantos redondos, com sombra. As partidas neste momento ficam em escombros.
        const todasAsParedes = casasDe("parede");
        const paredes = todasAsParedes.filter((casa) => !partidas.has(casa.linha * terreno.colunas + casa.coluna));
        const escombros = todasAsParedes.filter((casa) => partidas.has(casa.linha * terreno.colunas + casa.coluna));
        if (paredes.length) {
          const blocos = new THREE.InstancedMesh(new RoundedBoxGeometry(0.98, ALTURA_DA_PAREDE, 0.98, 2, 0.09), new THREE.MeshStandardMaterial({ roughness: 0.82 }), paredes.length);
          paredes.forEach((casa, i) => {
            const [x, z] = centro(casa.coluna, casa.linha);
            matriz.makeTranslation(x, ALTURA_DA_PAREDE / 2, z);
            blocos.setMatrixAt(i, matriz);
            blocos.setColorAt(i, casa.cor.clone().multiplyScalar(0.62));
          });
          blocos.castShadow = true;
          blocos.receiveShadow = true;
          c.grupoDoTerreno.add(blocos);
          // Os topos: a mesma imagem, recortada casa a casa. O desenho da
          // Brawlify põe o topo dos objetos um pouco acima da casa; daí o desvio.
          if (textura) {
            const desvio = 0.4;
            const posicoes: number[] = [], uvs: number[] = [], indices: number[] = [];
            paredes.forEach(({ coluna, linha }, i) => {
              const x0 = coluna - LARGURA / 2 + 0.03, z0 = linha - PROFUNDIDADE / 2 + 0.03, y = ALTURA_DA_PAREDE + 0.003;
              posicoes.push(x0, y, z0, x0 + 0.94, y, z0, x0 + 0.94, y, z0 + 0.94, x0, y, z0 + 0.94);
              const u0 = (coluna + 1) / 23, u1 = (coluna + 2) / 23;
              const vTopo = 1 - (linha + 1 - desvio) / 35, vFundo = 1 - (linha + 2 - desvio) / 35;
              uvs.push(u0, vTopo, u1, vTopo, u1, vFundo, u0, vFundo);
              const b = i * 4;
              indices.push(b, b + 2, b + 1, b, b + 3, b + 2);
            });
            const geometria = new THREE.BufferGeometry();
            geometria.setAttribute("position", new THREE.Float32BufferAttribute(posicoes, 3));
            geometria.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
            geometria.setIndex(indices);
            geometria.computeVertexNormals();
            const topos = new THREE.Mesh(geometria, new THREE.MeshLambertMaterial({ map: textura }));
            topos.receiveShadow = true;
            c.grupoDoTerreno.add(topos);
          }
        }
        if (escombros.length) {
          // Quatro pedaços por casa, tombados, da cor da parede.
          const pedacos = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), escombros.length * 4);
          escombros.forEach((casa, i) => {
            const [x, z] = centro(casa.coluna, casa.linha);
            for (let k = 0; k < 4; k++) {
              const semente = (casa.linha * 31 + casa.coluna) * 7 + k;
              const escala = 0.7 + aleatorio(semente) * 0.7;
              matriz.compose(
                new THREE.Vector3(x + (aleatorio(semente + 1) - 0.5) * 0.7, 0.1 * escala, z + (aleatorio(semente + 2) - 0.5) * 0.7),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(aleatorio(semente + 3) * 3, aleatorio(semente + 4) * 3, 0)),
                new THREE.Vector3(escala, escala * 0.6, escala),
              );
              pedacos.setMatrixAt(i * 4 + k, matriz);
              pedacos.setColorAt(i * 4 + k, casa.cor.clone().multiplyScalar(0.5));
            }
          });
          pedacos.castShadow = true;
          c.grupoDoTerreno.add(pedacos);
        }

        // Mato: tufos redondos de folhas (três por casa), com a cor do próprio mapa.
        const matos = casasDe("mato");
        if (matos.length) {
          const tufos = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), matos.length * 3);
          matos.forEach((casa, i) => {
            const [x, z] = centro(casa.coluna, casa.linha);
            for (let k = 0; k < 3; k++) {
              const semente = (casa.linha * 31 + casa.coluna) * 5 + k;
              const escala = 0.85 + aleatorio(semente) * 0.35;
              matriz.compose(
                new THREE.Vector3(x + (aleatorio(semente + 1) - 0.5) * 0.45, 0.28 + aleatorio(semente + 2) * 0.12, z + (aleatorio(semente + 3) - 0.5) * 0.45),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, aleatorio(semente + 4) * 6, 0)),
                new THREE.Vector3(escala, escala * 0.85, escala),
              );
              tufos.setMatrixAt(i * 3 + k, matriz);
              tufos.setColorAt(i * 3 + k, casa.cor.clone().multiplyScalar(0.72 + aleatorio(semente + 5) * 0.3));
            }
          });
          tufos.castShadow = true;
          tufos.receiveShadow = true;
          c.grupoDoTerreno.add(tufos);
        }

        // Jarros e barris soltos: partem-se com ataques normais.
        const jarros = casasDe("destrutivel").filter((casa) => !partidas.has(casa.linha * terreno.colunas + casa.coluna));
        if (jarros.length) {
          const vasos = new THREE.InstancedMesh(geometriaDoJarro(), new THREE.MeshStandardMaterial({ color: "#c8643c", roughness: 0.7 }), jarros.length);
          jarros.forEach((casa, i) => {
            const [x, z] = centro(casa.coluna, casa.linha);
            matriz.makeTranslation(x, 0, z);
            vasos.setMatrixAt(i, matriz);
          });
          vasos.castShadow = true;
          c.grupoDoTerreno.add(vasos);
        }

        // Água: uma película azul brilhante por cima da imagem.
        const aguas = casasDe("agua");
        if (aguas.length) {
          const placa = new THREE.PlaneGeometry(1, 1);
          placa.rotateX(-Math.PI / 2);
          const pelicula = new THREE.InstancedMesh(placa, new THREE.MeshStandardMaterial({ color: "#49b6ff", transparent: true, opacity: 0.38, roughness: 0.15, metalness: 0.2 }), aguas.length);
          aguas.forEach((casa, i) => {
            const [x, z] = centro(casa.coluna, casa.linha);
            matriz.makeTranslation(x, 0.04, z);
            pelicula.setMatrixAt(i, matriz);
          });
          c.grupoDoTerreno.add(pelicula);
        }
      }
      c.pedirDesenho();
    };

    const url = atual.current.imagem;
    if (!url) {
      construir(null);
      return () => { cancelado = true; };
    }
    if (c.texturaDoMapa.url === url && c.texturaDoMapa.textura) {
      construir(c.texturaDoMapa.textura);
      return () => { cancelado = true; };
    }
    new THREE.TextureLoader().load(
      url,
      (textura) => {
        textura.colorSpace = THREE.SRGBColorSpace;
        textura.anisotropy = c.renderer.capabilities.getMaxAnisotropy();
        c.texturaDoMapa.textura?.dispose();
        c.texturaDoMapa = { url, textura };
        construir(textura);
      },
      undefined,
      () => construir(null),
    );
    return () => { cancelado = true; };
  }, [props.imagem, props.terreno, props.paredesPartidas]);

  /* ---- Os brawlers. ---- */
  const retratos = useRef(new Map<string, HTMLImageElement | null>());
  useEffect(() => {
    const c = cena.current;
    if (!c) return;
    let cancelado = false;
    const desenhar = () => {
      if (cancelado) return;
      for (const filho of [...c.grupoDasFichas.children, ...c.grupoDosDuelos.children]) {
        filho.removeFromParent();
        filho.traverse((o) => {
          const malha = o as THREE.Mesh;
          malha.geometry?.dispose();
          const material = malha.material as THREE.SpriteMaterial | undefined;
          material?.map?.dispose();
          material?.dispose();
        });
      }
      for (const ficha of atual.current.fichas) {
        const grupo = new THREE.Group();
        grupo.userData = { id: ficha.chave, tipo: "ficha" };
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.62, 0.7, 0.16, 32),
          new THREE.MeshLambertMaterial({ color: COR_DO_LADO[ficha.lado], emissive: COR_DO_LADO[ficha.lado], emissiveIntensity: 0.35 }),
        );
        base.position.y = 0.08;
        base.castShadow = true;
        const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), new THREE.MeshBasicMaterial({ color: COR_DO_LADO[ficha.lado] }));
        haste.position.y = 0.7;
        const retrato = new THREE.Sprite(new THREE.SpriteMaterial({ map: desenharFicha(ficha.nome, ficha.lado, retratos.current.get(ficha.retrato ?? "") ?? null, ficha.funcao), depthTest: false }));
        // Visto dos olhos dele: o retrato não aparece (tapava tudo); fica a base no chão.
        retrato.visible = ficha.chave !== vistoComo;
        haste.visible = ficha.chave !== vistoComo;
        retrato.scale.set(1.9, 2.85, 1);
        retrato.position.y = 2.4;
        retrato.renderOrder = 20;
        grupo.add(base, haste, retrato);
        const mundo = paraMundo(ficha.ponto);
        const antes = ultimaPosicao.current.get(ficha.chave);
        c.grupoDasFichas.add(grupo);
        if (antes && antes.distanceTo(mundo) > 0.05) c.deslizar(grupo, antes.clone(), mundo);
        else grupo.position.copy(mundo);
        ultimaPosicao.current.set(ficha.chave, mundo);
      }
      // Os duelos 1v1: linha tracejada entre os dois, cor pela vantagem, e a percentagem ao meio.
      for (const duelo of atual.current.duelos) {
        const a = atual.current.fichas.find((f) => f.chave === duelo.nosso);
        const b = atual.current.fichas.find((f) => f.chave === duelo.deles);
        if (!a || !b) continue;
        const cor = duelo.vantagem >= 55 ? "#3ddc84" : duelo.vantagem <= 45 ? "#ff4d6d" : "#ffd23f";
        const pa = paraMundo(a.ponto), pb = paraMundo(b.ponto);
        pa.y = pb.y = 0.12;
        const linha = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pa, pb]), new THREE.LineDashedMaterial({ color: cor, dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0.85, depthTest: false }));
        linha.computeLineDistances();
        linha.renderOrder = 4;
        const etiqueta = new THREE.Sprite(new THREE.SpriteMaterial({ map: desenharPercentagem(duelo.vantagem, cor), depthTest: false }));
        etiqueta.scale.set(1.5, 0.75, 1);
        etiqueta.position.set((pa.x + pb.x) / 2, 0.6, (pa.z + pb.z) / 2);
        etiqueta.renderOrder = 12;
        c.grupoDosDuelos.add(linha, etiqueta);
      }
      c.pedirDesenho();
    };
    desenhar();
    // Os retratos chegam depois; quando chegam, redesenha-se com eles.
    const emFalta = Array.from(new Set(props.fichas.map((ficha) => ficha.retrato).filter((url): url is string => Boolean(url) && !retratos.current.has(url!))));
    for (const url of emFalta) {
      retratos.current.set(url, null);
      const imagem = new Image();
      imagem.onload = () => { retratos.current.set(url, imagem); desenhar(); };
      imagem.src = url;
    }
    return () => { cancelado = true; };
  }, [props.fichas, props.duelos, vistoComo]);

  /* ---- Ameaças: círculo vermelho à volta de quem é perigoso, com o aviso. ---- */
  useEffect(() => {
    const c = cena.current;
    if (!c) return;
    for (const filho of [...c.grupoDasAmeacas.children]) {
      filho.removeFromParent();
      const malha = filho as THREE.Mesh;
      malha.geometry?.dispose();
      const material = malha.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
    }
    const porPerigoso = new Map<string, number>();
    for (const ameaca of props.ameacas) {
      const ficha = props.fichas.find((f) => f.chave === ameaca.perigoso);
      if (!ficha) continue;
      const p = paraMundo(ficha.ponto);
      const ordem = porPerigoso.get(ameaca.perigoso) ?? 0;
      porPerigoso.set(ameaca.perigoso, ordem + 1);
      if (ordem === 0) {
        const anel = new THREE.Mesh(new THREE.RingGeometry(2.25, 2.45, 56), new THREE.MeshBasicMaterial({ color: "#ff4d6d", transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
        anel.rotation.x = -Math.PI / 2;
        anel.position.set(p.x, 0.09, p.z);
        anel.renderOrder = 6;
        const disco = new THREE.Mesh(new THREE.CircleGeometry(2.25, 56), new THREE.MeshBasicMaterial({ color: "#ff4d6d", transparent: true, opacity: 0.12, depthTest: false, side: THREE.DoubleSide }));
        disco.rotation.x = -Math.PI / 2;
        disco.position.set(p.x, 0.07, p.z);
        disco.renderOrder = 2;
        c.grupoDasAmeacas.add(disco, anel);
      }
      const aviso = new THREE.Sprite(new THREE.SpriteMaterial({ map: desenharAmeaca(`⚠ ${ameaca.alvo}: ${ameaca.texto}`, ameaca.excecao), depthTest: false }));
      const alto = ameaca.excecao ? 1.7 : 1;
      aviso.scale.set(6.9, alto, 1);
      aviso.position.set(p.x, 4.5 + ordem * 1.9, p.z);
      aviso.renderOrder = 16;
      c.grupoDasAmeacas.add(aviso);
    }
    c.pedirDesenho();
  }, [props.ameacas, props.fichas]);

  /* ---- Setas e símbolos. ---- */
  useEffect(() => {
    const c = cena.current;
    if (!c) return;
    for (const filho of [...c.grupoDasSetas.children]) {
      c.grupoDasSetas.remove(filho);
      if (!(filho as THREE.Sprite).isSprite) (filho as THREE.Mesh).geometry.dispose();
      const material = (filho as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
    }
    for (const seta of props.setas) {
      const malha = new THREE.Mesh(
        geometriaDaSeta(paraMundo(seta.de), paraMundo(seta.para)),
        new THREE.MeshBasicMaterial({ color: COR_DA_SETA[seta.tipo], transparent: true, opacity: 0.92, depthTest: false, side: THREE.DoubleSide }),
      );
      malha.renderOrder = 5;
      malha.userData = { id: seta.id, tipo: "seta" };
      c.grupoDasSetas.add(malha);
      // Porquê este movimento, escrito a meio da seta.
      if (props.notasNoMapa && seta.nota) {
        const de = paraMundo(seta.de), para = paraMundo(seta.para);
        const etiqueta = new THREE.Sprite(new THREE.SpriteMaterial({ map: desenharEtiqueta(seta.nota, COR_DA_SETA[seta.tipo]), depthTest: false }));
        etiqueta.scale.set(5, 1, 1);
        etiqueta.position.set((de.x + para.x) / 2, 0.9, (de.z + para.z) / 2);
        etiqueta.renderOrder = 14;
        etiqueta.userData = { id: seta.id, tipo: "seta" };
        c.grupoDasSetas.add(etiqueta);
      }
    }
    for (const filho of [...c.grupoDosMarcadores.children]) {
      c.grupoDosMarcadores.remove(filho);
      const material = (filho as THREE.Sprite).material;
      material.map?.dispose();
      material.dispose();
    }
    for (const marcador of props.marcadores) {
      const comNota = props.notasNoMapa && Boolean(marcador.nota);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: desenharSimbolo(marcador.tipo, comNota ? marcador.nota : undefined, comNota ? marcador.brawler : undefined), depthTest: false }));
      if (comNota) {
        sprite.scale.set(6.25, 1.25, 1);
        sprite.center.set(64 / 640, 0.5);
      } else {
        sprite.scale.set(1.25, 1.25, 1);
      }
      const mundo = paraMundo(marcador.ponto);
      sprite.position.set(mundo.x, 1.3, mundo.z);
      sprite.renderOrder = 15;
      sprite.userData = { id: marcador.id, tipo: "marcador" };
      c.grupoDosMarcadores.add(sprite);
    }
    c.pedirDesenho();
  }, [props.setas, props.marcadores, props.notasNoMapa]);

  /* ---- Passos fantasma: pegadas ao longo do caminho previsto. ---- */
  useEffect(() => {
    const c = cena.current;
    if (!c) return;
    for (const filho of [...c.grupoDosTrilhos.children]) {
      filho.removeFromParent();
      (filho as THREE.Mesh).geometry.dispose();
      ((filho as THREE.Mesh).material as THREE.Material).dispose();
    }
    for (const lado of ["nos", "eles"] as const) {
      const passos: Array<{ x: number; z: number; angulo: number; esquerdo: boolean; t: number }> = [];
      for (const trilho of props.trilhos.filter((t) => t.lado === lado)) {
        const pontos = trilho.pontos.map(paraMundo);
        let esquerdo = false;
        const total = pontos.slice(1).reduce((soma, p, i) => soma + p.distanceTo(pontos[i]), 0) || 1;
        let andado = 0;
        for (let i = 1; i < pontos.length; i++) {
          const a = pontos[i - 1], b = pontos[i];
          const troco = a.distanceTo(b);
          const angulo = Math.atan2(b.x - a.x, b.z - a.z);
          for (let d = 0.35; d < troco; d += 0.75) {
            const p = a.clone().lerp(b, d / troco);
            // Pé esquerdo e pé direito, um pouco para cada lado do caminho.
            const lateral = (esquerdo ? 1 : -1) * 0.2;
            passos.push({ x: p.x + Math.cos(angulo) * lateral, z: p.z - Math.sin(angulo) * lateral, angulo, esquerdo, t: (andado + d) / total });
            esquerdo = !esquerdo;
          }
          andado += troco;
        }
      }
      if (!passos.length) continue;
      const pe = new THREE.CircleGeometry(0.19, 14);
      pe.scale(1, 1.7, 1);
      pe.rotateX(-Math.PI / 2);
      const pegadas = new THREE.InstancedMesh(pe, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthTest: false }), passos.length);
      const cor = new THREE.Color(COR_DO_LADO[lado]);
      const matriz = new THREE.Matrix4();
      passos.forEach((passo, i) => {
        matriz.makeRotationY(passo.angulo).setPosition(passo.x, 0.05, passo.z);
        pegadas.setMatrixAt(i, matriz);
        // Mais forte no fim do caminho: é aí que o brawler acaba por lutar.
        pegadas.setColorAt(i, cor.clone().multiplyScalar(0.7 + 0.3 * passo.t));
      });
      pegadas.renderOrder = 3;
      c.grupoDosTrilhos.add(pegadas);
    }
    c.pedirDesenho();
  }, [props.trilhos]);

  /* ---- Vistas. ---- */
  useEffect(() => {
    if (props.pedidoDeVista > 0) cena.current?.voarPara(props.vista);
  }, [props.pedidoDeVista, props.vista]);
  useEffect(() => {
    if (props.comando) cena.current?.comandar(props.comando.acao);
  }, [props.comando]);
  useEffect(() => {
    if (!props.perspetiva) return;
    const ficha = atual.current.fichas.find((f) => f.chave === props.perspetiva!.chave);
    if (!ficha) return;
    const adversarios = atual.current.fichas.filter((f) => f.lado !== ficha.lado);
    const centro = adversarios.length
      ? { x: adversarios.reduce((s, f) => s + f.ponto.x, 0) / adversarios.length, y: adversarios.reduce((s, f) => s + f.ponto.y, 0) / adversarios.length }
      : { x: 0.5, y: 0.5 };
    cena.current?.olharComo(ficha.ponto, centro);
  }, [props.perspetiva]);

  return <div ref={caixa} className="quadro3d-palco" />;
}
