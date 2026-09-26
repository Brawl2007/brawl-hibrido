/**
 * Os bonecos do mapa 3D: um corpo a sério em vez de um pau com um retrato.
 *
 * Os modelos verdadeiros dos brawlers são da Supercell e não há de onde os
 * tirar; estes são feitos aqui, com formas simples, e o retrato do brawler
 * fica como cara. A forma vem da classe, para se perceber quem é quem ao
 * longe: o tanque é largo, o assassino é fino e leva lâminas, o atirador leva
 * uma espingarda comprida, o lançador tem a bomba na mão, o destruidor duas
 * armas, o controlador um bastão com uma esfera e o suporte uma mochila.
 *
 * O boneco olha para a base adversária. Mede ~1,6 casas; a cara (o retrato)
 * fica por cima, à altura `ALTURA_DA_CARA`.
 */
import * as THREE from "three";

export const ALTURA_DA_CARA = 1.95;

type Forma = {
  largura: number;   // do tronco
  altura: number;    // do tronco
  perna: number;     // comprimento das pernas
  braco: number;     // grossura dos braços
  inclinacao: number; // para a frente (assassinos em corrida)
};

const FORMAS: Record<string, Forma> = {
  Tank: { largura: 0.78, altura: 0.72, perna: 0.42, braco: 0.16, inclinacao: 0 },
  Assassino: { largura: 0.44, altura: 0.6, perna: 0.55, braco: 0.09, inclinacao: 0.28 },
  Artilheiro: { largura: 0.48, altura: 0.62, perna: 0.55, braco: 0.1, inclinacao: 0.05 },
  Lançador: { largura: 0.52, altura: 0.6, perna: 0.5, braco: 0.11, inclinacao: 0 },
  Destruidor: { largura: 0.56, altura: 0.64, perna: 0.5, braco: 0.12, inclinacao: 0.08 },
  Controlador: { largura: 0.5, altura: 0.64, perna: 0.52, braco: 0.1, inclinacao: 0 },
  Suporte: { largura: 0.5, altura: 0.6, perna: 0.52, braco: 0.1, inclinacao: 0 },
};
const FORMA_COMUM = FORMAS.Destruidor;

const capsula = (raio: number, comprimento: number) => new THREE.CapsuleGeometry(raio, comprimento, 4, 10);

/**
 * O corpo, virado para -z (o boneco depois roda para a base adversária).
 * Devolve um grupo com o tronco, as pernas, os braços e a arma da classe.
 */
export function criarCorpo(classe: string | undefined, cor: string) {
  const forma = (classe && FORMAS[classe]) || FORMA_COMUM;
  const corpo = new THREE.Group();
  const roupa = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55, metalness: 0.05 });
  const escura = new THREE.MeshStandardMaterial({ color: new THREE.Color(cor).multiplyScalar(0.35), roughness: 0.7 });
  const pele = new THREE.MeshStandardMaterial({ color: "#e0b48f", roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: "#8a9099", roughness: 0.35, metalness: 0.8 });
  const juntar = (malha: THREE.Mesh) => { malha.castShadow = true; corpo.add(malha); return malha; };

  // Pernas e botas.
  for (const lado of [-1, 1]) {
    const perna = juntar(new THREE.Mesh(capsula(0.1, forma.perna), escura));
    perna.position.set(lado * forma.largura * 0.26, forma.perna / 2 + 0.1, 0);
    const bota = juntar(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.28), escura));
    bota.position.set(lado * forma.largura * 0.26, 0.06, -0.04);
  }
  const anca = forma.perna + 0.18;
  // Tronco (uma cápsula achatada), com cinto.
  const tronco = juntar(new THREE.Mesh(capsula(forma.largura / 2, forma.altura - forma.largura / 2), roupa));
  tronco.scale.set(1, 1, 0.72);
  tronco.position.y = anca + forma.altura / 2;
  const cinto = juntar(new THREE.Mesh(new THREE.CylinderGeometry(forma.largura * 0.5, forma.largura * 0.5, 0.08, 16), escura));
  cinto.scale.z = 0.72;
  cinto.position.y = anca + 0.06;
  const ombro = anca + forma.altura * 0.85;

  // Braços: pendurados; quem segura uma arma põe-nos para a frente.
  const bracos: THREE.Mesh[] = [];
  for (const lado of [-1, 1]) {
    const braco = juntar(new THREE.Mesh(capsula(forma.braco, forma.altura * 0.62), roupa));
    braco.position.set(lado * (forma.largura / 2 + forma.braco * 0.7), ombro - forma.altura * 0.34, 0);
    const mao = juntar(new THREE.Mesh(new THREE.SphereGeometry(forma.braco * 1.05, 10, 8), pele));
    mao.position.set(braco.position.x, ombro - forma.altura * 0.72, 0);
    braco.userData.mao = mao;
    bracos.push(braco);
  }
  const bracosParaAFrente = (angulo: number) => {
    for (const braco of bracos) {
      braco.rotation.x = angulo;
      const mao = braco.userData.mao as THREE.Mesh;
      mao.position.set(braco.position.x, ombro - Math.cos(angulo) * forma.altura * 0.62, -Math.sin(angulo) * forma.altura * 0.62);
    }
  };

  switch (classe) {
    case "Artilheiro": {
      // Espingarda comprida, apontada.
      bracosParaAFrente(1.2);
      const cano = juntar(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 8), metal));
      cano.rotation.x = Math.PI / 2;
      cano.position.set(0.08, ombro - 0.2, -0.6);
      const coronha = juntar(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.34), escura));
      coronha.position.set(0.08, ombro - 0.22, -0.12);
      break;
    }
    case "Lançador": {
      // Braço direito no ar com a bomba.
      bracos[1].rotation.x = Math.PI * 0.85;
      const mao = bracos[1].userData.mao as THREE.Mesh;
      mao.position.set(bracos[1].position.x, ombro + forma.altura * 0.55, 0.1);
      const bomba = juntar(new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshStandardMaterial({ color: "#2b2b2b", roughness: 0.4, metalness: 0.3 })));
      bomba.position.set(mao.position.x, mao.position.y + 0.16, 0.1);
      const pavio = juntar(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), new THREE.MeshStandardMaterial({ color: "#ffb340", emissive: "#ff7a00", emissiveIntensity: 1.5 })));
      pavio.position.set(bomba.position.x, bomba.position.y + 0.2, 0.1);
      break;
    }
    case "Assassino": {
      // Lâminas nas duas mãos.
      bracosParaAFrente(0.7);
      for (const braco of bracos) {
        const mao = braco.userData.mao as THREE.Mesh;
        const lamina = juntar(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 4), metal));
        lamina.rotation.x = -Math.PI / 2;
        lamina.position.set(mao.position.x, mao.position.y, mao.position.z - 0.28);
      }
      break;
    }
    case "Destruidor": {
      // Uma arma em cada mão.
      bracosParaAFrente(1.1);
      for (const braco of bracos) {
        const mao = braco.userData.mao as THREE.Mesh;
        const arma = juntar(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.42), metal));
        arma.position.set(mao.position.x, mao.position.y, mao.position.z - 0.2);
      }
      break;
    }
    case "Controlador": {
      // Bastão com uma esfera que brilha.
      const bastao = juntar(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8), escura));
      bastao.position.set(forma.largura / 2 + 0.2, 0.75, -0.1);
      const esfera = juntar(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 1.2, roughness: 0.2 })));
      esfera.position.set(bastao.position.x, 1.55, -0.1);
      break;
    }
    case "Suporte": {
      // Mochila com uma luz verde.
      const mochila = juntar(new THREE.Mesh(new THREE.BoxGeometry(forma.largura * 0.8, forma.altura * 0.7, 0.24), escura));
      mochila.position.set(0, anca + forma.altura * 0.5, 0.3);
      const luz = juntar(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: "#3ddc84", emissive: "#3ddc84", emissiveIntensity: 2 })));
      luz.position.set(0, anca + forma.altura * 0.75, 0.43);
      break;
    }
    case "Tank": {
      // Ombreiras de metal e punhos grandes.
      for (const braco of bracos) {
        const ombreira = juntar(new THREE.Mesh(new THREE.SphereGeometry(forma.braco * 1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal));
        ombreira.position.set(braco.position.x, ombro + 0.02, 0);
        const mao = braco.userData.mao as THREE.Mesh;
        mao.scale.setScalar(1.6);
      }
      break;
    }
    default:
      break;
  }
  // Pescoço até à cara.
  const pescoco = juntar(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 10), pele));
  pescoco.position.y = anca + forma.altura + 0.05;
  corpo.rotation.x = -forma.inclinacao;
  return corpo;
}
