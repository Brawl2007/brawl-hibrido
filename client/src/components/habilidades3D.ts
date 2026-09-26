/**
 * Como cada brawler ataca e usa o super na cena do mapa 3D, para se parecer
 * com o jogo: o Mortis dá dash através do alvo, o El Primo salta para cima
 * dele, a Jessie monta a torre, o Barley faz chover garrafas…
 *
 * Quem não está na lista ataca à maneira da classe (`estiloDaClasse`).
 */
export type EstiloDeAtaque =
  | "arco"      // atirado por cima das paredes e rebenta no chão
  | "reto"      // um tiro direito e rápido
  | "rajada"    // várias balas seguidas ou em leque
  | "investida" // vai até ao alvo e bate (corpo a corpo)
  | "dash"      // arranca a correr e passa através do alvo
  | "salto"     // salta por cima de tudo e cai em cima do alvo
  | "raio"      // um feixe contínuo (lança-chamas, laser)
  | "onda"      // uma onda larga à frente
  | "zona"      // deixa uma área no chão
  | "chuva"     // várias bombas à volta do alvo
  | "torreta"   // monta uma torre (ou um urso, um clone) que dispara
  | "cura";     // cura-se a si e aos seus

export type Habilidade = { ataque: EstiloDeAtaque; super: EstiloDeAtaque; /** A cor do efeito, se o brawler tiver uma sua. */ cor?: string };

const H = (ataque: EstiloDeAtaque, sup: EstiloDeAtaque, cor?: string): Habilidade => ({ ataque, super: sup, ...(cor ? { cor } : {}) });

export const HABILIDADES: Record<string, Habilidade> = {
  "8-bit": H("rajada", "torreta", "#ff4df0"),
  Alli: H("investida", "dash"),
  Amber: H("raio", "zona", "#ff7a1a"),
  Angelo: H("reto", "zona", "#7bd389"),
  Ash: H("onda", "rajada", "#ff9b3d"),
  Barley: H("arco", "chuva", "#ff9b3d"),
  Bea: H("reto", "rajada", "#ffd23f"),
  Belle: H("reto", "reto", "#ffd23f"),
  Berry: H("cura", "dash", "#ff9ad5"),
  Bibi: H("investida", "reto", "#ff9ad5"),
  Bo: H("rajada", "zona", "#ff9b3d"),
  Bonnie: H("reto", "salto"),
  Brock: H("reto", "chuva", "#ff7a1a"),
  Bull: H("rajada", "dash"),
  Buster: H("rajada", "zona", "#9be7ff"),
  Buzz: H("investida", "dash", "#ffd23f"),
  Byron: H("reto", "arco", "#7bd389"),
  Carl: H("reto", "dash"),
  Charlie: H("reto", "zona", "#ff9ad5"),
  Chester: H("rajada", "chuva", "#ffd23f"),
  Chuck: H("reto", "dash"),
  Clancy: H("rajada", "rajada"),
  Colette: H("reto", "dash", "#ff9ad5"),
  Colt: H("rajada", "rajada"),
  Cordelius: H("rajada", "zona", "#8f5bd6"),
  Crow: H("rajada", "salto", "#7bd389"),
  Darryl: H("rajada", "dash"),
  Doug: H("investida", "cura"),
  Draco: H("investida", "raio", "#ff7a1a"),
  Dynamike: H("arco", "arco", "#ff7a1a"),
  Edgar: H("investida", "salto", "#8f5bd6"),
  "El Primo": H("investida", "salto", "#ff7a1a"),
  Emz: H("onda", "zona", "#c77dff"),
  Eve: H("rajada", "torreta", "#7bd389"),
  Fang: H("investida", "dash", "#ffd23f"),
  Finx: H("reto", "zona", "#9be7ff"),
  Frank: H("onda", "onda"),
  Gale: H("rajada", "onda", "#9be7ff"),
  Gene: H("reto", "raio", "#c77dff"),
  Gray: H("reto", "zona", "#c77dff"),
  Griff: H("rajada", "rajada", "#ffd23f"),
  Grom: H("arco", "arco"),
  Gus: H("reto", "cura", "#9be7ff"),
  Hank: H("zona", "chuva", "#9be7ff"),
  Jacky: H("onda", "zona"),
  Janet: H("raio", "chuva", "#ff9ad5"),
  Jessie: H("reto", "torreta", "#ff9b3d"),
  Juju: H("arco", "torreta", "#8f5bd6"),
  Kenji: H("investida", "dash"),
  Kit: H("investida", "salto"),
  "Larry & Lawrie": H("arco", "torreta"),
  Leon: H("rajada", "zona", "#7bd389"),
  Lily: H("investida", "dash", "#c77dff"),
  Lola: H("rajada", "torreta", "#ff9ad5"),
  Lou: H("reto", "zona", "#9be7ff"),
  Maisie: H("reto", "onda"),
  Mandy: H("raio", "raio", "#ff9ad5"),
  Max: H("rajada", "cura", "#ffd23f"),
  Meg: H("rajada", "salto"),
  Melodie: H("reto", "dash", "#ff9ad5"),
  Mico: H("salto", "salto"),
  Moe: H("arco", "dash"),
  Mortis: H("dash", "onda", "#8f5bd6"),
  "Mr. P": H("arco", "torreta"),
  Nani: H("rajada", "reto", "#9be7ff"),
  Nita: H("onda", "torreta"),
  Ollie: H("investida", "salto"),
  Otis: H("reto", "zona", "#c77dff"),
  Pam: H("rajada", "torreta", "#7bd389"),
  Pearl: H("raio", "raio", "#ff7a1a"),
  Penny: H("reto", "torreta", "#ffd23f"),
  Pierce: H("reto", "reto"),
  Piper: H("reto", "salto", "#ff9ad5"),
  Poco: H("onda", "cura", "#7bd389"),
  "R-T": H("reto", "zona"),
  Rico: H("reto", "rajada", "#ff9ad5"),
  Rosa: H("investida", "zona", "#7bd389"),
  Ruffs: H("reto", "arco"),
  Sam: H("investida", "dash"),
  Sandy: H("onda", "zona", "#ffd23f"),
  Shade: H("investida", "dash", "#8f5bd6"),
  Shelly: H("rajada", "rajada"),
  Sirius: H("reto", "torreta", "#8f5bd6"),
  Spike: H("reto", "zona", "#7bd389"),
  Sprout: H("arco", "zona", "#7bd389"),
  Squeak: H("arco", "chuva", "#9be7ff"),
  Stu: H("reto", "dash", "#ff7a1a"),
  Surge: H("reto", "salto", "#9be7ff"),
  Tara: H("rajada", "zona", "#8f5bd6"),
  Tick: H("chuva", "arco"),
  Willow: H("arco", "zona", "#7bd389"),
};

/** Como ataca quem não está na lista: à maneira da classe. */
export function estiloDaClasse(classe?: string): EstiloDeAtaque {
  switch (classe) {
    case "Lançador": return "arco";
    case "Artilheiro": return "reto";
    case "Tank":
    case "Assassino": return "investida";
    case "Destruidor": return "rajada";
    case "Controlador": return "zona";
    case "Suporte": return "cura";
    default: return "reto";
  }
}

function superDaClasse(classe?: string): EstiloDeAtaque {
  switch (classe) {
    case "Lançador": return "chuva";
    case "Tank": return "dash";
    case "Assassino": return "salto";
    case "Controlador": return "zona";
    case "Suporte": return "cura";
    default: return "rajada";
  }
}

const porNome = new Map(Object.entries(HABILIDADES).map(([nome, h]) => [nome.toLowerCase(), h]));

/** O ataque e o super de um brawler: os dele, se estiver na lista; senão, os da classe. */
export function habilidadeDe(nome: string | undefined, classe?: string): Habilidade {
  return (nome && porNome.get(nome.trim().toLowerCase())) || { ataque: estiloDaClasse(classe), super: superDaClasse(classe) };
}
