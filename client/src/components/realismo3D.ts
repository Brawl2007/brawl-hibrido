/**
 * O modo "Cinema" do mapa 3D: luz e materiais a imitar a vida real.
 *
 * O QUE FAZ
 *
 * - Céu físico (dispersão da atmosfera) com o sol baixo de fim de tarde, e é
 *   esse mesmo céu que ilumina e se reflete nos materiais (environment map).
 * - Materiais com relevo: pedra nas paredes, grão no chão, água com ondulação
 *   que reflete o céu. As texturas são desenhadas aqui, em código — nada é
 *   descarregado de fora.
 * - Mato de lâminas de erva que baloiçam ao vento, em vez de bolas lisas.
 * - Poeira no ar a apanhar a luz, e brilho (bloom) nos tiros e clarões.
 * - Mapeamento de tons "neutro": os destaques não queimam e as cores do mapa
 *   (e dos retratos) ficam como são.
 *
 * O modo "Rápido" não usa nada disto: é o de sempre, leve, para telemóveis.
 */
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type { QualidadeDoMapa } from "./qualidadeDoMapa";

/* ------------------------------------------------------------------ *
 * Ruído e texturas desenhadas em código
 * ------------------------------------------------------------------ */

/** Um número pseudoaleatório estável, para a mesma textura sair sempre igual. */
function semente(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Ruído de valor que se repete sem costura, em várias oitavas (0..1). */
function ruido(tamanho: number, oitavas: number, base = 1) {
  const dados = new Float32Array(tamanho * tamanho);
  let amplitude = 1, soma = 0;
  for (let o = 0; o < oitavas; o++) {
    const celulas = 4 << o;
    const grelha = new Float32Array(celulas * celulas);
    for (let i = 0; i < grelha.length; i++) grelha[i] = semente(i + o * 9973 + base * 31);
    for (let y = 0; y < tamanho; y++) {
      for (let x = 0; x < tamanho; x++) {
        const gx = (x / tamanho) * celulas, gy = (y / tamanho) * celulas;
        const x0 = Math.floor(gx), y0 = Math.floor(gy);
        const fx = gx - x0, fy = gy - y0;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const v = (xx: number, yy: number) => grelha[((yy + celulas) % celulas) * celulas + ((xx + celulas) % celulas)];
        const topo = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
        const fundo = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
        dados[y * tamanho + x] += (topo + (fundo - topo) * sy) * amplitude;
      }
    }
    soma += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < dados.length; i++) dados[i] /= soma;
  return dados;
}

/** Um mapa de normais a partir de uma altura (diferenças de vizinhos, com repetição). */
function normaisDe(altura: Float32Array, tamanho: number, forca: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = tamanho;
  const ctx = canvas.getContext("2d")!;
  const imagem = ctx.createImageData(tamanho, tamanho);
  const h = (x: number, y: number) => altura[((y + tamanho) % tamanho) * tamanho + ((x + tamanho) % tamanho)];
  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * forca;
      const dy = (h(x, y + 1) - h(x, y - 1)) * forca;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * tamanho + x) * 4;
      imagem.data[i] = (n.x * 0.5 + 0.5) * 255;
      imagem.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      imagem.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      imagem.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imagem, 0, 0);
  const textura = new THREE.CanvasTexture(canvas);
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  return textura;
}

export type TexturasReais = {
  pedra: THREE.Texture;
  pedraNormais: THREE.Texture;
  chaoNormais: THREE.Texture;
  aguaNormais: THREE.Texture;
  dispose: () => void;
};

/** Pedra (cor clara, a cor de cada parede vem por cima), grão do chão e ondas da água. */
export function criarTexturas(): TexturasReais {
  const T = 256;
  // Pedra: blocos com juntas fundas, lascas e manchas.
  const base = ruido(T, 5, 1);
  const lascas = ruido(T, 3, 7);
  const altura = new Float32Array(T * T);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = T;
  const ctx = canvas.getContext("2d")!;
  const imagem = ctx.createImageData(T, T);
  for (let y = 0; y < T; y++) {
    const fiada = Math.floor(y / (T / 4));
    const desvio = fiada % 2 ? T / 4 : 0;
    for (let x = 0; x < T; x++) {
      const bx = (x + desvio) % (T / 2), by = y % (T / 4);
      const junta = Math.min(bx, T / 2 - bx, by, T / 4 - by);
      const naJunta = junta < 5 ? 1 - junta / 5 : 0;
      const i = y * T + x;
      const h = base[i] * 0.7 + lascas[i] * 0.3 - naJunta * 0.8;
      altura[i] = h;
      const tom = 0.62 + base[i] * 0.38 - naJunta * 0.35 - (lascas[i] > 0.72 ? 0.12 : 0);
      const p = i * 4;
      imagem.data[p] = Math.max(0, Math.min(255, tom * 255));
      imagem.data[p + 1] = Math.max(0, Math.min(255, tom * 248));
      imagem.data[p + 2] = Math.max(0, Math.min(255, tom * 238));
      imagem.data[p + 3] = 255;
    }
  }
  ctx.putImageData(imagem, 0, 0);
  const pedra = new THREE.CanvasTexture(canvas);
  pedra.colorSpace = THREE.SRGBColorSpace;
  pedra.wrapS = pedra.wrapT = THREE.RepeatWrapping;
  const pedraNormais = normaisDe(altura, T, 6);
  const chaoNormais = normaisDe(ruido(T, 6, 3), T, 3.5);
  const aguaNormais = normaisDe(ruido(T, 4, 5), T, 5);
  return {
    pedra, pedraNormais, chaoNormais, aguaNormais,
    dispose: () => { for (const t of [pedra, pedraNormais, chaoNormais, aguaNormais]) t.dispose(); },
  };
}

/* ------------------------------------------------------------------ *
 * Céu, luz, reflexos e pós-processamento
 * ------------------------------------------------------------------ */

/** Sol de fim de tarde: baixo, de lado, quente. */
const ELEVACAO_DO_SOL = 22;
const AZIMUTE_DO_SOL = 215;

export function direcaoDoSol() {
  return new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - ELEVACAO_DO_SOL), THREE.MathUtils.degToRad(AZIMUTE_DO_SOL));
}

function novoCeu() {
  const ceu = new Sky();
  ceu.scale.setScalar(160);
  const u = ceu.material.uniforms;
  u.turbidity.value = 5.5;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(direcaoDoSol());
  return ceu;
}

/** O fundo: céu de fim de tarde em degradê (sem passar do branco, para não brilhar). */
function fundoDeFimDeTarde() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#2d5d93");
  g.addColorStop(0.45, "#6f9cc9");
  g.addColorStop(0.72, "#d9c3a0");
  g.addColorStop(0.85, "#e8b98a");
  g.addColorStop(1, "#5a4a3c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

export type Realismo = {
  desenhar: () => void;
  redimensionar: (largura: number, altura: number) => void;
  /** Chamar a cada quadro: vento no mato, ondas na água, poeira no ar. */
  animar: (segundos: number) => void;
  materiaisAnimados: Set<THREE.Material>;
  texturas: TexturasReais;
  dispose: () => void;
};

export function montarRealismo(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, sol: THREE.DirectionalLight, hemisferio: THREE.HemisphereLight): Realismo {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // O céu físico serve para a luz que vem de todo o lado e para os reflexos.
  // Não vai para o fundo: é tão claro que o brilho (bloom) o espalhava por cima
  // de tudo e o mapa ficava branco. O fundo é um degradê de céu de fim de tarde.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cenaDoCeu = new THREE.Scene();
  const ceu = novoCeu();
  cenaDoCeu.add(ceu);
  const ambiente = pmrem.fromScene(cenaDoCeu, 0).texture;
  scene.environment = ambiente;
  scene.environmentIntensity = 0.45;
  const fundo = fundoDeFimDeTarde();
  scene.background = fundo;
  scene.fog = new THREE.Fog("#b8b3a8", 70, 160);

  // O sol vem da mesma direção que o céu desenha; luz quente, sombra longa e macia.
  sol.position.copy(direcaoDoSol().multiplyScalar(40));
  sol.color.set("#ffd9a8");
  sol.intensity = 3.1;
  sol.shadow.mapSize.set(4096, 4096);
  sol.shadow.radius = 3;
  sol.shadow.camera.left = -22;
  sol.shadow.camera.right = 22;
  sol.shadow.camera.top = 26;
  sol.shadow.camera.bottom = -26;
  sol.shadow.camera.far = 110;
  sol.shadow.camera.updateProjectionMatrix();
  hemisferio.color.set("#bcd4ff");
  hemisferio.groundColor.set("#5a4632");
  hemisferio.intensity = 0.55;

  // Poeira: pontinhos quase invisíveis que apanham a luz.
  const quantos = 520;
  const posicoes = new Float32Array(quantos * 3);
  for (let i = 0; i < quantos; i++) {
    posicoes[i * 3] = (semente(i) - 0.5) * 21;
    posicoes[i * 3 + 1] = 0.3 + semente(i + 500) * 4;
    posicoes[i * 3 + 2] = (semente(i + 1000) - 0.5) * 33;
  }
  const geometriaDaPoeira = new THREE.BufferGeometry();
  geometriaDaPoeira.setAttribute("position", new THREE.BufferAttribute(posicoes, 3));
  // Redondos e pequenos (um PointsMaterial sem textura desenha quadrados).
  const grao = document.createElement("canvas");
  grao.width = grao.height = 32;
  const g = grao.getContext("2d")!;
  const raio = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  raio.addColorStop(0, "rgba(255,255,255,1)");
  raio.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = raio;
  g.fillRect(0, 0, 32, 32);
  const texturaDoGrao = new THREE.CanvasTexture(grao);
  const poeira = new THREE.Points(geometriaDaPoeira, new THREE.PointsMaterial({ color: "#fff1d6", map: texturaDoGrao, size: 0.035, sizeAttenuation: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  poeira.renderOrder = 2;
  scene.add(poeira);

  // Pós-processamento: a imagem em alta gama, com brilho só no que passa do branco
  // (os tiros e clarões, que se somam) — o texto e os retratos não brilham.
  const alvo = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const compositor = new EffectComposer(renderer, alvo);
  compositor.addPass(new RenderPass(scene, camera));
  const brilho = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.55, 1.0);
  compositor.addPass(brilho);
  compositor.addPass(new OutputPass());

  const texturas = criarTexturas();
  const materiaisAnimados = new Set<THREE.Material>();

  return {
    desenhar: () => compositor.render(),
    redimensionar: (largura, altura) => {
      compositor.setPixelRatio(renderer.getPixelRatio());
      compositor.setSize(largura, altura);
      brilho.resolution.set(largura, altura);
    },
    animar: (segundos) => {
      for (const material of materiaisAnimados) {
        const tempo = (material.userData.tempo as { value: number } | undefined);
        if (tempo) tempo.value = segundos;
        const normais = (material as THREE.MeshStandardMaterial).normalMap;
        if (material.userData.ondula && normais) normais.offset.set(segundos * 0.02, segundos * 0.013);
      }
      const p = geometriaDaPoeira.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < quantos; i++) {
        p.setY(i, 0.3 + ((semente(i + 500) * 4 + segundos * (0.08 + semente(i) * 0.1)) % 4));
        p.setX(i, (semente(i) - 0.5) * 21 + Math.sin(segundos * 0.3 + i) * 0.4);
      }
      p.needsUpdate = true;
    },
    materiaisAnimados,
    texturas,
    dispose: () => {
      compositor.dispose();
      alvo.dispose();
      ambiente.dispose();
      pmrem.dispose();
      texturas.dispose();
      geometriaDaPoeira.dispose();
      texturaDoGrao.dispose();
      (poeira.material as THREE.Material).dispose();
      ceu.geometry.dispose();
      (ceu.material as THREE.Material).dispose();
      fundo.dispose();
    },
  };
}

/* ------------------------------------------------------------------ *
 * Mato de lâminas de erva, a baloiçar
 * ------------------------------------------------------------------ */

/** Uma lâmina fina que afina até à ponta, de pé. */
function geometriaDaLamina() {
  const g = new THREE.PlaneGeometry(0.075, 0.62, 1, 4);
  g.translate(0, 0.31, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i) / 0.62;
    p.setX(i, p.getX(i) * (1 - h * 0.9));
    // Um pouco dobrada para a frente, como erva a sério.
    p.setZ(i, h * h * 0.12);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * O mato: muitas lâminas por casa, com a cor do próprio mapa, e um vento
 * suave que as faz baloiçar (no vertex shader: não custa nada ao processador).
 */
export function criarMatoDeLaminas(casas: Array<{ x: number; z: number; cor: THREE.Color }>, realismo: Realismo, porCasa = 34) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  const tempo = { value: 0 };
  material.userData.tempo = tempo;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTempo = tempo;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTempo;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float alturaDaLamina = clamp(position.y / 0.62, 0.0, 1.0);
        vec3 base = instanceMatrix[3].xyz;
        float vento = sin(uTempo * 1.8 + base.x * 0.9 + base.z * 0.6) * 0.5 + sin(uTempo * 3.1 + base.z * 1.7) * 0.25;
        transformed.x += vento * 0.09 * alturaDaLamina * alturaDaLamina;
        transformed.z += vento * 0.05 * alturaDaLamina * alturaDaLamina;`,
      );
  };
  realismo.materiaisAnimados.add(material);
  const total = casas.length * porCasa;
  const laminas = new THREE.InstancedMesh(geometriaDaLamina(), material, total);
  const matriz = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  casas.forEach((casa, c) => {
    for (let k = 0; k < porCasa; k++) {
      const s = c * 131 + k * 7;
      const escala = 0.75 + semente(s) * 0.7;
      e.set((semente(s + 1) - 0.5) * 0.35, semente(s + 2) * Math.PI * 2, (semente(s + 3) - 0.5) * 0.35);
      q.setFromEuler(e);
      matriz.compose(new THREE.Vector3(casa.x + (semente(s + 4) - 0.5) * 0.95, 0, casa.z + (semente(s + 5) - 0.5) * 0.95), q, new THREE.Vector3(escala, escala * (0.8 + semente(s + 6) * 0.6), escala));
      laminas.setMatrixAt(c * porCasa + k, matriz);
      // Pontas mais claras e secas aqui e ali: a cor nunca é toda igual.
      laminas.setColorAt(c * porCasa + k, casa.cor.clone().multiplyScalar(0.55 + semente(s + 7) * 0.5).lerp(new THREE.Color("#c9c26a"), semente(s + 8) > 0.85 ? 0.25 : 0));
    }
  });
  laminas.castShadow = true;
  laminas.receiveShadow = true;
  return laminas;
}
