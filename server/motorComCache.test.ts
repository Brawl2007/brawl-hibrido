import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allRankedRows } from "../client/src/data/rankedData";
import { brawlerClassCatalog, calcularClasseDoBrawler, calcularPerfilDeCounter, getBrawlerClass, getCounterProfile } from "@shared/draft";
import { normalizeDraftRuleSettings, regrasDoMotor } from "@shared/draftRules";
import { getBrawlScopeLiveViews, setBrawlScopeLiveMatchups, setBrawlScopeReading } from "@shared/counterMatchupValue";
import { DEFAULT_BRAWLSCOPE_READING } from "@shared/brawlScopeReading";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { setDraftRoleOverrides } from "@shared/draftRoleOverrides";
import { versaoDoMotor } from "@shared/versaoDoMotor";

/**
 * A cache do perfil de counters tem de dar EXATAMENTE o que o cálculo dava.
 *
 * Medido antes dela: cada cartão do Draft recalculava o perfil a cada
 * desenho, ~1300 confrontos por tecla escrita na pesquisa. Guardar a resposta
 * só é seguro se ela nunca ficar velha — e ficar velha não dá erro nenhum, só
 * um Draft que deixa de reagir quando os dados mudam.
 *
 * Por isso este teste não confia: compara a cache com o cálculo sem cache para
 * TODOS os brawlers dos dados reais, e depois mexe em cada um dos quatro
 * estados de que o motor depende e confirma que a cache acompanha.
 */

beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => {
  setCounterSyncSnapshot(undefined, { allowOfflineFallback: false });
  setBrawlScopeReading(DEFAULT_BRAWLSCOPE_READING);
  for (const view of getBrawlScopeLiveViews()) setBrawlScopeLiveMatchups(view, null);
  setDraftRoleOverrides({});
});

const roster = [...new Set(allRankedRows.map((row) => row.brawler))];
const modos = [undefined, ...new Set(allRankedRows.map((row) => row.modeId))].slice(0, 4);

describe("a cache do perfil de counters", () => {
  it("dá o mesmo que o cálculo sem cache, para todos os brawlers e modos", () => {
    expect(roster.length).toBeGreaterThan(80);
    let comparados = 0;
    for (const modeId of modos) {
      for (const brawler of roster) {
        const semCache = calcularPerfilDeCounter(brawler, roster, modeId);
        const primeira = getCounterProfile(brawler, roster, modeId);
        const segunda = getCounterProfile(brawler, roster, modeId);
        expect(primeira).toEqual(semCache);
        // A segunda vem da cache: é o MESMO objeto, não um recálculo.
        expect(segunda).toBe(primeira);
        comparados += 1;
      }
    }
    expect(comparados).toBeGreaterThan(300);
  });

  it("listas de candidatos diferentes não partilham resposta", () => {
    // A primeira versão deste teste usava [a, b] e [a, b, c] — que davam o
    // MESMO perfil, e por isso passava com a lista fora da chave da cache.
    // Um teste que passa com o defeito posto não protege nada. Aqui escolhe-se
    // um brawler cujo perfil muda MESMO com a lista: com o roster todo tem
    // counters; só consigo próprio como candidato, não pode ter nenhum.
    const brawler = roster.find((nome) => calcularPerfilDeCounter(nome, roster).counters.length > 0)!;
    expect(brawler).toBeDefined();
    const sozinho = [brawler];
    const completo = calcularPerfilDeCounter(brawler, roster);
    const soEle = calcularPerfilDeCounter(brawler, sozinho);
    expect(soEle).not.toEqual(completo);
    // Pedidos seguidos, pela ordem que faria uma cache mal chaveada responder
    // com o primeiro ao segundo.
    expect(getCounterProfile(brawler, roster)).toEqual(completo);
    expect(getCounterProfile(brawler, sozinho)).toEqual(soEle);
  });

  it("cada um dos quatro estados do motor avança a versão", () => {
    const passos: Array<[string, () => void]> = [
      ["dados de counters", () => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true })],
      ["leitura por modo", () => setBrawlScopeReading(DEFAULT_BRAWLSCOPE_READING === "overall" ? "byMode" : "overall")],
      ["matriz ao vivo", () => setBrawlScopeLiveMatchups("overall", { Nori: { Doug: 20 } })],
      ["papéis ajustados", () => setDraftRoleOverrides({ Nori: "mid" })],
    ];
    for (const [nome, passo] of passos) {
      const antes = versaoDoMotor();
      passo();
      expect(versaoDoMotor(), nome).toBeGreaterThan(antes);
    }
  });

  it("repetir a mesma leitura não deita a cache fora", () => {
    setBrawlScopeReading(DEFAULT_BRAWLSCOPE_READING);
    const antes = versaoDoMotor();
    setBrawlScopeReading(DEFAULT_BRAWLSCOPE_READING);
    expect(versaoDoMotor()).toBe(antes);
  });

  it("uma matriz nova muda a resposta guardada — nunca fica velha", () => {
    const [dono, alvo] = ["Nori", "Doug"];
    expect(roster).toContain(dono);
    expect(roster).toContain(alvo);
    // Primeiro Nori perde contra Doug; a resposta fica guardada.
    setBrawlScopeLiveMatchups("overall", { [dono]: { [alvo]: -25 } });
    const antes = getCounterProfile(dono, roster);
    expect(antes).toEqual(calcularPerfilDeCounter(dono, roster));
    // Depois chega uma matriz que diz o contrário.
    setBrawlScopeLiveMatchups("overall", { [dono]: { [alvo]: 25 } });
    const depois = getCounterProfile(dono, roster);
    expect(depois).toEqual(calcularPerfilDeCounter(dono, roster));
    // O conteúdo muda mesmo — não basta ser outro objeto.
    expect(antes.counters).toContain(alvo);
    expect(depois.counteredBy).toContain(alvo);
  });

  it("o perfil partilhado não se deixa alterar no sítio", () => {
    const perfil = getCounterProfile(roster[0], roster);
    expect(Object.isFrozen(perfil)).toBe(true);
    expect(() => (perfil.counters as string[]).push("x")).toThrow(TypeError);
    expect(() => (perfil.counteredBy as string[]).sort()).toThrow(TypeError);
  });
});

describe("as outras duas caches do motor", () => {
  it("a classe guardada é a mesma que a calculada, com qualquer grafia", () => {
    const nomes = [...new Set([...roster, ...Object.keys(brawlerClassCatalog)])];
    const variantes = nomes.flatMap((n) => [n, n.toUpperCase(), n.toLowerCase(), `  ${n} `]);
    variantes.push("Ninguém Com Este Nome", "");
    for (const nome of variantes) {
      expect(getBrawlerClass(nome), nome).toBe(calcularClasseDoBrawler(nome));
      expect(getBrawlerClass(nome), `${nome} (2.ª vez)`).toBe(calcularClasseDoBrawler(nome));
    }
    expect(variantes.length).toBeGreaterThan(400);
  });

  it("as regras do motor dão o mesmo que a normalização pública", () => {
    const personalizadas = { counterPickMultiplier: 1.6, synergyPick1: 0.2 } as never;
    expect(regrasDoMotor(personalizadas)).toEqual(normalizeDraftRuleSettings(personalizadas));
    expect(regrasDoMotor(undefined)).toEqual(normalizeDraftRuleSettings(undefined));
    expect(regrasDoMotor(null)).toEqual(normalizeDraftRuleSettings(null));
    // Um valor que não é objeto vale como "sem regras", como na pública.
    // `[1..6].map(getCounterBonusRate)` passa o índice do map nesse lugar.
    for (const primitivo of [0, 3, "x", true] as never[]) {
      expect(() => regrasDoMotor(primitivo)).not.toThrow();
      expect(regrasDoMotor(primitivo)).toEqual(normalizeDraftRuleSettings(primitivo));
    }
    // O mesmo objeto devolve a mesma resposta guardada.
    expect(regrasDoMotor(personalizadas)).toBe(regrasDoMotor(personalizadas));
  });

  it("regras novas (objeto novo) dão resposta nova — nunca a antiga", () => {
    // O estado do React troca o objeto quando alguém muda uma regra.
    const a = regrasDoMotor({ counterPickMultiplier: 1.2 } as never);
    const b = regrasDoMotor({ counterPickMultiplier: 1.8 } as never);
    expect(a).not.toEqual(b);
    expect(b).toEqual(normalizeDraftRuleSettings({ counterPickMultiplier: 1.8 } as never));
  });

  it("o resultado do motor é só de leitura; o público continua editável", () => {
    const motor = regrasDoMotor({ counterPickMultiplier: 1.4 } as never) as Record<string, number>;
    expect(() => { motor.counterPick1 = 9; }).toThrow(TypeError);
    // O cliente usa a função pública e pode editar o que recebe.
    const publico = normalizeDraftRuleSettings({ counterPickMultiplier: 1.4 } as never) as Record<string, number>;
    publico.counterPick1 = 9;
    expect(publico.counterPick1).toBe(9);
  });
});
