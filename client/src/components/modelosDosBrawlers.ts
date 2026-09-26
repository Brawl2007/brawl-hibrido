/**
 * Os modelos 3D dos brawlers, quando os tens.
 *
 * Põe os ficheiros `.glb` em `client/src/modelos/brawlers/`, com o nome do
 * brawler em minúsculas e hífens (`el-primo.glb`, `8-bit.glb`, `mr-p.glb`).
 * As animações podem vir dentro do modelo ou em ficheiros à parte, com o nome
 * da animação depois de um `@`: `shelly@parado.glb`, `shelly@anda.glb`,
 * `shelly@ataque.glb`, `shelly@super.glb` (também servem os nomes em inglês:
 * idle, walk/run, attack, super).
 *
 * O site só descarrega o modelo de quem está no mapa, e só quando o mapa 3D
 * abre. Quem não tem modelo fica com o boneco feito aqui (`bonecos3D.ts`).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as clonarComEsqueleto } from "three/examples/jsm/utils/SkeletonUtils.js";

// O Vite encontra os ficheiros ao construir: sem ficheiros, a lista fica vazia.
const FICHEIROS = import.meta.glob("../modelos/brawlers/*.glb", { query: "?url", import: "default" }) as Record<string, () => Promise<string>>;

/** "El Primo" → "el-primo"; "8-Bit" → "8-bit"; "Mr. P" → "mr-p"; "Larry & Lawrie" → "larry-lawrie". */
export function slugDoBrawler(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Os ficheiros de cada brawler: o modelo e as animações à parte. */
function ficheirosDe(slug: string) {
  let modelo: (() => Promise<string>) | null = null;
  const animacoes: Array<() => Promise<string>> = [];
  for (const [caminho, url] of Object.entries(FICHEIROS)) {
    const nome = caminho.split("/").pop()!.replace(/\.glb$/i, "").toLowerCase();
    if (nome === slug) modelo = url;
    else if (nome.startsWith(`${slug}@`)) animacoes.push(url);
  }
  return { modelo, animacoes };
}

export function temModelo(nome: string) {
  return ficheirosDe(slugDoBrawler(nome)).modelo !== null;
}

type Original = { cena: THREE.Object3D; animacoes: THREE.AnimationClip[] };
const emCache = new Map<string, Promise<Original | null>>();
const carregador = new GLTFLoader();

function carregarOriginal(nome: string) {
  const slug = slugDoBrawler(nome);
  let pedido = emCache.get(slug);
  if (!pedido) {
    const { modelo, animacoes } = ficheirosDe(slug);
    pedido = modelo
      ? (async () => {
        const principal = await carregador.loadAsync(await modelo());
        const extras = await Promise.all(animacoes.map(async (url) => {
          try { return (await carregador.loadAsync(await url())).animations; } catch { return []; }
        }));
        return { cena: principal.scene, animacoes: [...principal.animations, ...extras.flat()] };
      })().catch(() => null)
      : Promise.resolve(null);
    emCache.set(slug, pedido);
  }
  return pedido;
}

export type Acao = "parado" | "anda" | "ataque" | "super";
// A ordem conta: "super" antes de "ataque" ("super_attack" é o super).
const PROCURA: Record<Acao, RegExp> = {
  parado: /idle|parad|stand|espera/i,
  anda: /walk|run|anda|corre|move/i,
  super: /super|ulti|especial/i,
  ataque: /attack|ataque|shoot|dispar|fire|hit/i,
};

/** Um modelo pronto a pôr no mapa, com as animações a tocar. */
export type BonecoOriginal = {
  objeto: THREE.Object3D;
  tocar: (acao: Acao) => void;
  avancar: (segundos: number) => void;
  animado: boolean;
  dispose: () => void;
};

/**
 * Uma cópia do modelo do brawler, com `altura` de alto, os pés no chão e o
 * centro no sítio. Devolve `null` se não houver modelo (ou se falhar).
 */
export async function criarBonecoOriginal(nome: string, altura: number): Promise<BonecoOriginal | null> {
  const original = await carregarOriginal(nome);
  if (!original) return null;
  const objeto = clonarComEsqueleto(original.cena);
  const dentro = new THREE.Group();
  dentro.add(objeto);
  const caixa = new THREE.Box3().setFromObject(objeto);
  const tamanho = caixa.getSize(new THREE.Vector3());
  const escala = tamanho.y > 0 ? altura / tamanho.y : 1;
  objeto.scale.multiplyScalar(escala);
  const centro = caixa.getCenter(new THREE.Vector3()).multiplyScalar(escala);
  objeto.position.set(-centro.x, -caixa.min.y * escala, -centro.z);
  objeto.traverse((o) => {
    const malha = o as THREE.Mesh;
    if (malha.isMesh) {
      malha.castShadow = true;
      malha.receiveShadow = true;
      // Com esqueleto, a caixa de corte não acompanha a animação.
      malha.frustumCulled = false;
    }
  });
  const mixer = new THREE.AnimationMixer(objeto);
  const clipes = original.animacoes;
  const acoes = new Map<Acao, THREE.AnimationAction>();
  const usados = new Set<THREE.AnimationClip>();
  for (const acao of Object.keys(PROCURA) as Acao[]) {
    const clipe = clipes.find((c) => !usados.has(c) && PROCURA[acao].test(c.name));
    if (clipe) usados.add(clipe);
    if (clipe) acoes.set(acao, mixer.clipAction(clipe));
  }
  // Sem nomes conhecidos, a primeira animação faz de "parado".
  if (!acoes.has("parado") && clipes[0]) acoes.set("parado", mixer.clipAction(clipes[0]));
  let atual: THREE.AnimationAction | null = null;
  const tocar = (acao: Acao) => {
    const proxima = acoes.get(acao) ?? (acao === "super" ? acoes.get("ataque") : undefined) ?? acoes.get("parado") ?? null;
    if (!proxima || proxima === atual) return;
    proxima.reset().setEffectiveWeight(1).play();
    if (atual) proxima.crossFadeFrom(atual, 0.18, false);
    atual = proxima;
  };
  tocar("parado");
  return {
    objeto: dentro,
    tocar,
    avancar: (segundos) => mixer.update(segundos),
    animado: acoes.size > 0,
    dispose: () => mixer.stopAllAction(),
  };
}
