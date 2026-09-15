import { describe, expect, it } from "vitest";
import {
  MIN_PLAUSIBLE_MAPS,
  brawlPlanetSlug,
  mergeRotationSources,
  parseRankedRotationIndex,
} from "@shared/rankedRotationSource";
import { RANKED_MAP_SOURCES } from "./rankedSync";

/**
 * Fixture com a forma do índice público do TopBrawl, verificada em
 * https://topbrawl.com/rankeds: os mapas aparecem agrupados por modo, cada um
 * ligado a `/rankeds/<id>` com o nome precedido da palavra "Map".
 */
const modos: Array<[string, Array<[string, string]>]> = [
  ["GEM GRAB", [["Double Swoosh", "15000115"], ["Gem Fort", "15000010"], ["Hard Rock Mine", "15000007"], ["Undermine", "15000011"]]],
  ["HEIST", [["Bridge Too Far", "15000072"], ["Hot Potato", "15000053"], ["Kaboom Canyon", "15000018"], ["Safe Zone", "15000019"]]],
  ["BOUNTY", [["Dry Season", "15000083"], ["Hideout", "15000022"], ["Layer Cake", "15000082"], ["Shooting Star", "15000005"]]],
  ["BRAWL BALL", [["Beach Ball", "15000143"], ["Center Stage", "15000132"], ["Pinball Dreams", "15000118"], ["Sneaky Fields", "15000050"], ["Spiraling Out", "15001021"], ["Triple Dribble", "15000025"]]],
  ["HOT ZONE", [["Dueling Beetles", "15000306"], ["Open Business", "15000292"], ["Parallel Plays", "15000293"], ["Ring of Fire", "15000300"]]],
  ["KNOCKOUT", [["Belle's Rock", "15000368"], ["Flaring Phoenix", "15000440"], ["New Horizons", "15000703"], ["Out in the Open", "15000548"]]],
];

function indiceHtml(grupos = modos) {
  const seccoes = grupos.map(([modo, mapas]) => `
    <section class="mode-block">
      <h2 class="mode-title">${modo}</h2>
      <div class="map-grid">
        ${mapas.map(([nome, id]) => `
          <a class="map-card" href="https://topbrawl.com/rankeds/${id}">
            <img src="/img/${id}.png" alt="" />
            <span class="map-label">Map ${nome}</span>
          </a>`).join("")}
      </div>
    </section>`).join("");
  return `<!doctype html><html><body><main><h1>Ranked</h1>${seccoes}</main></body></html>`;
}

describe("leitura da rotação Ranked publicada", () => {
  it("extrai nome, id e modo de cada mapa do índice", () => {
    const leitura = parseRankedRotationIndex(indiceHtml());

    expect(leitura.complete).toBe(true);
    expect(leitura.maps).toHaveLength(26);

    const gemFort = leitura.maps.find((map) => map.name === "Gem Fort");
    expect(gemFort).toMatchObject({ id: "15000010", mode: "Pique-Gema", modeId: "gem-grab" });

    const nocaute = leitura.maps.filter((map) => map.modeId === "knockout").map((map) => map.name);
    expect(nocaute).toEqual(["Belle's Rock", "Flaring Phoenix", "New Horizons", "Out in the Open"]);
  });

  it("lê o apóstrofo de Belle's Rock, escrito ou escapado", () => {
    const escapado = indiceHtml().replace("Belle's Rock", "Belle&#39;s Rock");
    const leitura = parseRankedRotationIndex(escapado);

    expect(leitura.maps.map((map) => map.name)).toContain("Belle's Rock");
  });

  it("reconhece a rotação exata que o projeto traz hoje", () => {
    // Se um dia divergirem, é sinal de que a rotação mudou — que é precisamente
    // o que este sistema existe para detetar sozinho.
    const leitura = parseRankedRotationIndex(indiceHtml());
    const publicados = leitura.maps.map((map) => map.name).sort();
    const noProjeto = RANKED_MAP_SOURCES.map(([name]) => name).sort();

    expect(publicados).toEqual(noProjeto);
  });

  it("deteta um mapa que entrou e outro que saiu", () => {
    const novosModos = modos.map(([modo, mapas]): [string, Array<[string, string]>] =>
      modo === "KNOCKOUT"
        ? [modo, [...mapas.filter(([nome]) => nome !== "New Horizons"), ["Rustic Arcade", "15000343"]]]
        : [modo, mapas]);
    const leitura = parseRankedRotationIndex(indiceHtml(novosModos));

    const nomes = leitura.maps.map((map) => map.name);
    expect(nomes).toContain("Rustic Arcade");
    expect(nomes).not.toContain("New Horizons");
    expect(leitura.maps.find((map) => map.name === "Rustic Arcade")).toMatchObject({ id: "15000343", modeId: "knockout" });
  });

  it("marca a leitura como incompleta quando o parser deixa de reconhecer a página", () => {
    /**
     * Este é o teste que mais interessa. Se a estrutura mudar e o parser ler
     * pouco ou nada, o resultado NÃO pode ser aceite como "a rotação encolheu".
     */
    expect(parseRankedRotationIndex("<html><body><p>Em manutenção</p></body></html>").complete).toBe(false);
    expect(parseRankedRotationIndex("").complete).toBe(false);
    expect(parseRankedRotationIndex(indiceHtml(modos.slice(0, 2))).complete).toBe(false);
    expect(parseRankedRotationIndex(indiceHtml(modos.slice(0, 2))).note).toMatch(/mínimo plausível/);
  });

  it("não rebenta com HTML estranho", () => {
    for (const entrada of ["<a href='/rankeds/'></a>", "<a href=\"/rankeds/123\"></a>", "<<<>>>", "a".repeat(5000)]) {
      expect(() => parseRankedRotationIndex(entrada)).not.toThrow();
    }
  });

  it("deriva o slug do Brawl Planet no formato que a fonte usa", () => {
    expect(brawlPlanetSlug("Belle's Rock", "knockout")).toBe("bellesrock_knockout");
    expect(brawlPlanetSlug("Hard Rock Mine", "gem-grab")).toBe("hardrockmine_gemgrab");
    expect(brawlPlanetSlug("Out in the Open", "knockout")).toBe("outintheopen_knockout");
  });

  it("deriva um slug igual ao verificado à mão para todos os mapas atuais", () => {
    const porNome = new Map(RANKED_MAP_SOURCES.map(([name, , slug]) => [name, slug]));
    const leitura = parseRankedRotationIndex(indiceHtml());

    for (const map of leitura.maps) {
      expect(`${map.name}: ${map.planetSlug}`).toBe(`${map.name}: ${porNome.get(map.name)}`);
    }
  });
});

describe("junção da rotação descoberta com a do projeto", () => {
  it("usa a rotação publicada quando a leitura é completa", () => {
    const leitura = parseRankedRotationIndex(indiceHtml());
    const junta = mergeRotationSources(RANKED_MAP_SOURCES, leitura);

    expect(junta.complete).toBe(true);
    expect(junta.maps).toHaveLength(26);
    // O slug verificado à mão continua a mandar sobre o derivado.
    expect(junta.maps.find((map) => map.name === "Belle's Rock")?.planetSlug).toBe("bellesrock_knockout");
  });

  it("cai para a lista do projeto quando a leitura falha, e assinala-o", () => {
    const junta = mergeRotationSources(RANKED_MAP_SOURCES, { maps: [], complete: false, note: "índice em baixo" });

    expect(junta.complete).toBe(false);
    expect(junta.maps.map((map) => map.name).sort()).toEqual(RANKED_MAP_SOURCES.map(([name]) => name).sort());
    expect(junta.note).toBe("índice em baixo");
  });

  it("aceita um mapa novo que o projeto ainda não conhece", () => {
    const novosModos = modos.map(([modo, mapas]): [string, Array<[string, string]>] =>
      modo === "HEIST" ? [modo, [...mapas, ["Mapa Estreante", "15009999"]]] : [modo, mapas]);
    const junta = mergeRotationSources(RANKED_MAP_SOURCES, parseRankedRotationIndex(indiceHtml(novosModos)));

    const novo = junta.maps.find((map) => map.name === "Mapa Estreante");
    expect(novo).toMatchObject({ id: "15009999", modeId: "heist", planetSlug: "mapaestreante_heist" });
    expect(junta.maps.length).toBe(27);
  });

  it("descarta uma entrada sem id, que não daria para recolher", () => {
    const junta = mergeRotationSources(RANKED_MAP_SOURCES, {
      maps: [{ name: "Sem Id", id: "" }, ...parseRankedRotationIndex(indiceHtml()).maps],
      complete: true,
    });

    expect(junta.maps.map((map) => map.name)).not.toContain("Sem Id");
    expect(junta.maps.length).toBeGreaterThanOrEqual(MIN_PLAUSIBLE_MAPS);
  });
});

/**
 * O caso real que deixou a rotação parada.
 *
 * O diagnóstico no servidor devolveu: "168 038 caracteres recebidos · 0 mapas
 * reconhecidos". A página tinha as ligações todas — o que falhava era a forma
 * de as ler. O padrão antigo exigia um `<a href="…">` com aspas duplas E o nome
 * dentro dos primeiros 400 caracteres do conteúdo da ligação. Um cartão de mapa
 * com imagem, ícone de modo e estatísticas lá dentro estoura esse limite.
 *
 * Zero mapas não dava erro nenhum: caía na rotação do projeto, em silêncio.
 */
describe("índice da rotação com cartões grandes", () => {
  const cartao = (id: string, nome: string) => `
    <a href="/rankeds/${id}" class="card">
      <div class="thumb"><img src="/img/${id}.png" alt="Map ${nome}" width="240" height="135" loading="lazy" /></div>
      <div class="badges">${"<span class='chip'>chip</span>".repeat(20)}</div>
      <div class="stats"><span>Win 52.4%</span><span>Use 11.9%</span><span>1234 battles</span></div>
      <h3 class="name">${nome}</h3>
    </a>`;

  it("lê os mapas mesmo quando o nome está muito depois do início da ligação", () => {
    const nomes = ["Double Swoosh", "Gem Fort", "Hard Rock Mine", "Undermine", "Bridge Too Far", "Hot Potato",
      "Kaboom Canyon", "Safe Zone", "Dry Season", "Hideout", "Layer Cake", "Shooting Star", "Belle's Rock"];
    const html = `<html><body><h2>GEM GRAB</h2>${nomes.map((nome, i) => cartao(`1500${String(i).padStart(4, "0")}`, nome)).join("")}</body></html>`;

    const leitura = parseRankedRotationIndex(html);

    expect(leitura.maps.length).toBe(nomes.length);
    expect(leitura.complete).toBe(true);
    expect(leitura.maps.map((mapa) => mapa.name).sort()).toEqual([...nomes].sort());
  });

  it("não confunde estatísticas nem cabeçalhos de modo com nomes de mapa", () => {
    const html = `<html><body><h2>KNOCKOUT</h2>
      <a href="/rankeds/15000099" class="card">
        <div class="stats"><span>52.4%</span><span>1234</span><span>Win rate</span></div>
        <h3>Belle's Rock</h3>
      </a></body></html>`;

    const leitura = parseRankedRotationIndex(html);

    expect(leitura.maps).toHaveLength(1);
    expect(leitura.maps[0].name).toBe("Belle's Rock");
    expect(leitura.maps[0].modeId).toBe("knockout");
  });

  it("a leitura antiga continua a mandar quando a marcação é simples", () => {
    // O preenchimento é só para passar o mínimo de 200 caracteres da leitura.
    const html = `<html><body><h2>HEIST</h2><a href="/rankeds/15000072">Bridge Too Far</a>${"<p>rodape</p>".repeat(20)}</body></html>`;
    const leitura = parseRankedRotationIndex(html);

    expect(leitura.maps).toHaveLength(1);
    expect(leitura.maps[0].name).toBe("Bridge Too Far");
  });

  it("uma página sem ligações nenhumas continua a ser leitura incompleta", () => {
    const html = `<html><body>${"<p>nada aqui</p>".repeat(40)}</body></html>`;
    const leitura = parseRankedRotationIndex(html);

    expect(leitura.maps).toHaveLength(0);
    expect(leitura.complete).toBe(false);
  });
});
