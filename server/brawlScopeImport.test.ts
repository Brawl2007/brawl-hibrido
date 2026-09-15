import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { getBrawlScopeMatchupCoverage, getBrawlScopeMatchupMatrix, importBrawlScopePage } from "./counterSync";

beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }));

/**
 * Colagem manual de uma ficha do BrawlScope.
 *
 * A recolha automática desta fonte acabou: responde 403 a este servidor, e quem
 * a mantém não respondeu ao contacto. Não vai ser contornada — uma porta fechada
 * sem resposta não é um convite a entrar por trás.
 *
 * Mas as páginas são públicas e abrem no navegador de qualquer pessoa. Quando o
 * dono do site copia uma e a cola, não há automatismo nenhum a bater à porta
 * deles: há uma pessoa a ler uma página pública e a trazer o que leu.
 */
const paginaFalsa = (brawler: string, modo?: string) => {
  const adversarios = ["Mortis", "Edgar", "Fang", "Belle", "Piper", "Bea", "Colt", "Rico", "Brock", "Bull",
    "Jacky", "Frank", "Pam", "Poco", "Gene", "Tara", "Sandy", "Amber", "Max", "Byron",
    "Sprout", "Squeak", "Lou", "Colette", "Emz", "Nita", "Bo", "Jessie", "Dynamike", "Barley",
    "Rosa", "Carl", "Penny", "Darryl", "Mr. P", "Gale", "Nani", "Surge", "Ash", "Buzz",
    "Griff", "Grom", "Bonnie", "Sam", "Otis", "Gus", "Buster", "Chester", "Mandy", "R-T"];

  /**
   * A marcação real de um confronto: uma ligação para a ficha do adversário,
   * com "taxa% vs média% usual" e o delta. O parser exige que as contas batam
   * certo (taxa − média = delta), por isso o fixture calcula-as em vez de as
   * inventar — um fixture que não passasse nessa verificação testaria outra
   * coisa qualquer.
   */
  const linhas = adversarios
    .map((nome, indice) => {
      const media = 48 + (indice % 5);
      const delta = ((indice % 9) - 4) + 0.5;
      const taxa = media + delta;
      const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const sinal = delta >= 0 ? "+" : "";
      return `<a href="/counters/${slug}">${nome} ${taxa.toFixed(1)}% vs ${media.toFixed(1)}% usual · 120 battles ${sinal}${delta.toFixed(1)}</a>`;
    })
    .join("");

  const canonico = `https://brawlscope.com/counters/${brawler.toLowerCase()}${modo ? `?mode=${modo}` : ""}`;
  return `<html><head><link rel="canonical" href="${canonico}" /></head><body>
    <h1>${brawler} counters</h1>
    <p>Counter with</p><ul><li><a href="/counters/belle"><span>Belle</span> +9.2</a></li><li><a href="/counters/piper"><span>Piper</span> +7.1</a></li></ul>
    <p>Punishes</p><ul><li><a href="/counters/mortis"><span>Mortis</span> +6.4</a></li><li><a href="/counters/edgar"><span>Edgar</span> +5.8</a></li></ul>
    <p>Pair with</p><ul><li><a href="/counters/poco"><span>Poco</span> +4.3</a></li><li><a href="/counters/sandy"><span>Sandy</span> +3.9</a></li></ul>
    <p>Every matchup</p>${linhas}
    ${"<span>enchimento</span>".repeat(200)}
  </body></html>`;
};

describe("colar uma ficha do BrawlScope", () => {
  it("recusa um texto curto, com instrução em vez de erro seco", () => {
    const resultado = importBrawlScopePage("<html>nada</html>");
    expect(resultado.ok).toBe(false);
    // Quem cola a coisa errada tem de perceber o que fazer a seguir — e o que
    // se pede mudou: Ctrl+A na página, não Ctrl+U no código-fonte.
    expect(resultado.error).toContain("Ctrl+A");
  });

  it("recusa uma página que não é uma ficha", () => {
    const resultado = importBrawlScopePage(`<html><body>${"<p>x</p>".repeat(500)}</body></html>`);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain("brawler");
  });

  it("recusa uma ficha truncada, dizendo quantos confrontos leu", () => {
    // Metade de uma tabela é pior do que nada: entraria como verdade parcial.
    const completa = paginaFalsa("Shelly");
    const primeiraLigacao = completa.indexOf('<a href="/counters/');
    const meia = completa.slice(0, primeiraLigacao + 600) + "</body></html>" + "<span>enchimento</span>".repeat(200);
    const resultado = importBrawlScopePage(meia);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/confrontos/);
  });

  it("lê o modo pelo endereço canónico, não por qualquer mode= da página", () => {
    // A página tem ligações para todos os outros modos no seletor; procurar
    // `mode=` em qualquer sítio daria o modo errado quase sempre.
    const resultado = importBrawlScopePage(paginaFalsa("Piper", "knockout"));
    expect(resultado.ok).toBe(true);
    expect(resultado.view).toBe("knockout");
  });

  it("sem modo no endereço, a ficha é a vista geral", () => {
    expect(importBrawlScopePage(paginaFalsa("Bea")).view).toBe("overall");
  });

  it("o modo escolhido à mão manda sobre o detetado", () => {
    const resultado = importBrawlScopePage(paginaFalsa("Bo", "knockout"), { view: "heist" });
    expect(resultado.view).toBe("heist");
  });

  it("uma ficha entra na matriz e não apaga as outras", () => {
    importBrawlScopePage(paginaFalsa("Colt"));
    importBrawlScopePage(paginaFalsa("Nita"));

    const matriz = getBrawlScopeMatchupMatrix("overall") ?? {};
    expect(Object.keys(matriz)).toEqual(expect.arrayContaining(["Colt", "Nita"]));
    expect(Object.keys(matriz["Colt"] ?? {}).length).toBeGreaterThan(40);
  });

  it("colar a mesma ficha duas vezes substitui, não duplica", () => {
    importBrawlScopePage(paginaFalsa("Jessie"));
    const primeira = Object.keys(getBrawlScopeMatchupMatrix("overall")?.["Jessie"] ?? {}).length;
    importBrawlScopePage(paginaFalsa("Jessie"));
    const segunda = Object.keys(getBrawlScopeMatchupMatrix("overall")?.["Jessie"] ?? {}).length;

    expect(segunda).toBe(primeira);
  });

  it("a cobertura cresce a cada ficha, para se ver o progresso", () => {
    const antes = getBrawlScopeMatchupCoverage().views["overall"]?.profiles ?? 0;
    importBrawlScopePage(paginaFalsa("Gus"));
    const depois = getBrawlScopeMatchupCoverage().views["overall"]?.profiles ?? 0;

    expect(depois).toBe(antes + 1);
  });

  it("traz também as listas de counters e as sinergias da mesma página", () => {
    const resultado = importBrawlScopePage(paginaFalsa("Tara"));
    expect(resultado.relations).toBeGreaterThan(0);
    expect(resultado.synergies).toBeGreaterThan(0);
  });
});

describe("a colagem não é recolha automática disfarçada", () => {
  const counterSync = readFileSync(resolve(process.cwd(), "server/counterSync.ts"), "utf8");
  const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

  it("importar não faz um único pedido ao BrawlScope", () => {
    const funcao = counterSync.slice(counterSync.indexOf("export function importBrawlScopePage"));
    const corpo = funcao.slice(0, funcao.indexOf("\n}\n"));
    expect(corpo).not.toContain("fetchText");
    expect(corpo).not.toContain("fetch(");
  });

  it("só o dono pode importar", () => {
    expect(routers).toMatch(/importPage[\s\S]{0,600}exigirDono\(ctx,/);
  });

  it("grava logo, em vez de esperar pelo ciclo", () => {
    // Perder uma colagem manual num reinício é muito pior do que perder uma
    // recolha automática, que se repete sozinha.
    expect(routers).toContain("persistMatchupMatricesNow()");
  });
});

/**
 * O CHÃO DE 40 CONFRONTOS REJEITAVA PÁGINAS BOAS
 *
 * A vista "Overall" traz as 105 linhas todas e nunca esbarrava neste limite.
 * Uma vista de modo não: o BrawlScope só lista os confrontos com jogos que
 * cheguem, e num modo pouco jogado ficam trinta e poucos. Quem colava uma
 * dessas — corretamente, com Ctrl+A — via "só li 36 confrontos" e uma sugestão
 * para copiar outra vez de outra maneira. A ficha estava certa; o limite é que
 * estava errado.
 */
describe("chão de confrontos de uma ficha colada", () => {
  const paginaComNLinhas = (brawler: string, quantos: number) => {
    const adversarios = ["Mortis", "Edgar", "Fang", "Belle", "Piper", "Bea", "Colt", "Rico", "Brock", "Bull",
      "Jacky", "Frank", "Pam", "Poco", "Gene", "Tara", "Sandy", "Amber", "Max", "Byron"].slice(0, quantos);
    const linhas = adversarios.map((nome, indice) => {
      const media = 48 + (indice % 5);
      const delta = ((indice % 7) - 3) + 0.5;
      const taxa = Math.round((media + delta) * 10) / 10;
      return `${nome} ${taxa.toFixed(1)}% vs ${media.toFixed(1)}% usual ${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
    });
    /**
     * O enchimento tem de sobreviver ao trim: a importação mede o texto
     * já aparado, e uma cauda de espaços deixava a página abaixo do mínimo de
     * comprimento — fazia o teste falhar por um motivo que não era o dele.
     */
    const rodape = "Brawlscope Legendary+ ranked matchup data. ".repeat(12);
    return [`${brawler} counters`, "Every matchup", ...linhas, rodape].join("\n");
  };

  it("aceita uma ficha de modo com 20 confrontos", () => {
    const resultado = importBrawlScopePage(paginaComNLinhas("Shelly", 20), { view: "knockout" });
    expect(resultado.ok).toBe(true);
    expect(resultado.brawler).toBe("Shelly");
    expect(resultado.view).toBe("knockout");
  });

  it("continua a recusar uma página sem tabela nenhuma, e aí sim fala do Ctrl+U", () => {
    const semTabela = ["Shelly counters", "Every matchup"].join("\n") + " ".padEnd(500, "x");
    const resultado = importBrawlScopePage(semTabela, { view: "overall" });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/Ctrl\+U/);
  });

  it("quando a tabela veio mas é curta de mais, não manda copiar outra vez com Ctrl+A", () => {
    const resultado = importBrawlScopePage(paginaComNLinhas("Shelly", 3), { view: "overall" });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).not.toMatch(/Ctrl\+U/);
    expect(resultado.error).toMatch(/3 confrontos/);
  });
});
