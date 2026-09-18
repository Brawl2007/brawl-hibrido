import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LIMITE_DE_CONFIANCA_MS, descreverFrescura } from "@shared/idadeDosDados";

/**
 * Quem chega ao site tem de saber se os números são de agora.
 *
 * POR QUE ISTO EXISTE
 *
 * Os dados do site vivem na base de dados e são públicos: um amigo abre o link
 * e vê tudo, sem instalar nada. Mas a frescura desses números depende de uma
 * pessoa — o dono — correr uma extensão no navegador dela. Se estiver uma
 * semana sem o fazer, o site continua a mostrar números, só que de antes.
 *
 * A página principal mostrava uma data e mais nada. Uma data sozinha não
 * responde à pergunta que interessa a quem acaba de chegar, e que nem sabe que
 * existe uma extensão: isto é de agora?
 *
 * O módulo que responde a isto existe desde a v94 e estava a ser usado só no
 * Draft — a página onde já se tinha percebido o problema. Faltava na porta de
 * entrada.
 */
const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

describe("idade dos dados na página principal", () => {
  it("a página de entrada usa a mesma medida honesta que o Draft", () => {
    const noEcra = home.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    // Do `sourceReadAt` — a leitura na FONTE — e não do `capturedAt`, que é só
    // a hora a que a sincronização correu.
    expect(noEcra).toContain("descreverFrescura(statusQuery.data?.sourceReadAt");
    expect(noEcra).toContain("frescura.rotulo");
    expect(noEcra).toContain("frescura.velho");
  });

  it("uma leitura recente não assinala nada", () => {
    const agora = Date.now();
    const frescura = descreverFrescura(
      { topBrawl: new Date(agora - 2 * 3600_000).toISOString(), brawlPlanet: new Date(agora - 60_000).toISOString() },
      agora,
    );
    expect(frescura.velho).toBe(false);
    expect(frescura.rotulo).toContain("Dados lidos");
  });

  it("conta pela fonte MAIS ANTIGA, e não pela mais recente", () => {
    const agora = Date.now();
    // Uma fonte lida agora não torna novos os dados da outra, lida há 4 dias.
    const frescura = descreverFrescura(
      { topBrawl: new Date(agora - 4 * 24 * 3600_000).toISOString(), brawlPlanet: new Date(agora).toISOString() },
      agora,
    );
    expect(frescura.velho).toBe(true);
  });

  it("sem leitura declarada diz que não sabe, em vez de inventar", () => {
    const frescura = descreverFrescura({ topBrawl: null, brawlPlanet: null });
    expect(frescura.rotulo).toBe("Idade dos dados desconhecida");
    // "Não sei" nunca pode passar por "está velho": seria um alarme inventado.
    expect(frescura.velho).toBe(false);
  });

  it("o limiar do aviso é o mesmo em todo o site", () => {
    expect(LIMITE_DE_CONFIANCA_MS).toBe(48 * 60 * 60 * 1000);
  });
});
