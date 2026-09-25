import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PL_PRODIGY_DRAFT_URL, PREFIXO_DO_DRAFT, draftParaPLProdigy, enderecoNoPLProdigy, lerDraftDoFragmento } from "@shared/plProdigyDraft";

const ler = (ficheiro: string) => readFileSync(resolve(process.cwd(), ficheiro), "utf8");
const extensao = ler("client/public/brawlscope-helper/pl-prodigy.js");
const manifesto = JSON.parse(ler("client/public/brawlscope-helper/manifest.json")) as {
  permissions: string[];
  host_permissions: string[];
  content_scripts?: Array<{ matches: string[]; js: string[] }>;
};

describe("levar o draft para o PL Prodigy", () => {
  it("o draft vai e volta pelo endereço sem se perder nada", () => {
    const draft = draftParaPLProdigy({ mapa: "Belle's Rock", nossos: ["Mortis", "Larry & Lawrie", "Mr. P"], deles: ["R-t", "El Primo"], bans: ["Wendy", "Shade"] });
    const endereco = enderecoNoPLProdigy(draft);
    expect(endereco.startsWith(`${PL_PRODIGY_DRAFT_URL}${PREFIXO_DO_DRAFT}`)).toBe(true);
    expect(lerDraftDoFragmento(new URL(endereco).hash)).toEqual(draft);
  });

  it("não leva mais do que um draft tem, nem lixo", () => {
    const draft = draftParaPLProdigy({ mapa: "  ", nossos: ["A", "B", "C", "D", null, ""], deles: [undefined, "X".repeat(90)], bans: ["1", "2", "3", "4", "5", "6", "7"] });
    expect(draft.mapa).toBeNull();
    expect(draft.nossos).toEqual(["A", "B", "C"]);
    expect(draft.deles).toEqual(["X".repeat(40)]);
    expect(draft.bans).toHaveLength(6);
  });

  it("um fragmento que não é nosso, ou de outra versão, não é lido", () => {
    expect(lerDraftDoFragmento("#outra-coisa")).toBeNull();
    expect(lerDraftDoFragmento(`${PREFIXO_DO_DRAFT}%7Bnao-e-json`)).toBeNull();
    expect(lerDraftDoFragmento(`${PREFIXO_DO_DRAFT}${encodeURIComponent(JSON.stringify({ v: 2, nossos: ["A"] }))}`)).toBeNull();
  });

  it("o site e a extensão usam o mesmo formato", () => {
    expect(extensao).toContain(`const PREFIXO = "${PREFIXO_DO_DRAFT}";`);
    expect(extensao).toContain("pedido.v !== 1");
  });
});

describe("a extensão na página do PL Prodigy", () => {
  it("só entra na ferramenta de draft, e só com a permissão desse site", () => {
    expect(manifesto.host_permissions).toContain("https://powerleagueprodigy.com/*");
    expect(manifesto.content_scripts).toEqual([
      { matches: ["https://powerleagueprodigy.com/plprodigy*"], js: ["pl-prodigy.js"], run_at: "document_idle" },
    ]);
  });

  it("faz cliques, e mais nada: sem pedidos de rede, sem cookies, sem disfarce", () => {
    // Sem comentários: eles dizem "não mexe em cookies", e têm de poder.
    const codigo = extensao.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const proibido of ["fetch(", "XMLHttpRequest", "chrome.", "document.cookie", "navigator.userAgent", "localStorage", "sendBeacon"]) {
      expect(codigo).not.toContain(proibido);
    }
    for (const perigosa of ["cookies", "webRequest", "declarativeNetRequest", "webRequestBlocking", "proxy"]) {
      expect(manifesto.permissions).not.toContain(perigosa);
    }
  });

  it("encontra os elementos pelos marcadores do tutorial da própria página", () => {
    for (const marcador of ["brawler-choice", "brawler-grid", "map-select", "pick-ban-toggle", "turn-switch", "reset-draft", "lineup-selected-pick", "lineup-selected-ban"]) {
      expect(extensao).toContain(`alvo("${marcador}")`);
    }
  });

  it("tira o draft do endereço depois de o ler: recarregar não volta a preencher", () => {
    expect(extensao).toContain('history.replaceState(null, "", location.pathname + location.search);');
  });

  it("o botão do Draft leva o draft do Brawl Híbrido", () => {
    const draftTsx = ler("client/src/pages/Draft.tsx");
    expect(draftTsx).toContain("href={enderecoNoPLProdigy(draftParaPLProdigy({ mapa: mapName, nossos: blueRows.map((row) => row.brawler), deles: redRows.map((row) => row.brawler), bans: Array.from(bannedNames) }))}");
    expect(draftTsx).toContain('target="_blank"');
  });
});
