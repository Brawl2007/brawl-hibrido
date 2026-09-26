import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * As frases que o Draft escreve sobre as suas próprias regras.
 *
 * O ecrã anunciava "Counter contextual: +6% por matchup direto literal". Esse
 * 6% é `counterPickN`, herança de quando o bónus era uma taxa fixa por pick.
 * Hoje o bónus é o delta publicado do confronto vezes o ajuste do pick, e
 * `counterPickN` não entra em conta nenhuma — pondo-o a 60, a frase prometia
 * "+60%" e o Score não mexia um decimal.
 *
 * Uma frase que cita um número sem efeito é pior do que não dizer nada: manda
 * estudar um botão que não existe. Este teste guarda a frase corrigida e, mais
 * importante, impede que o valor morto volte a ser citado.
 */
/**
 * Sem comentários, linha a linha.
 *
 * Sem isto o teste falhava por causa do comentário que explica a correção: ele
 * cita a frase antiga para o próximo leitor perceber o que mudou, e a busca
 * encontrava-a. O mesmo removedor está em `draftParaVisitantes.test.ts`, e pela
 * mesma razão de sempre: uma expressão regular sobre o ficheiro inteiro come
 * centenas de linhas, porque há `/*` dentro de textos e de endereços.
 */
function semComentarios(fonte: string) {
  const saida: string[] = [];
  let dentroDeBloco = false;
  for (const linha of fonte.split("\n")) {
    const limpa = linha.trim();
    if (dentroDeBloco) {
      if (limpa.endsWith("*/") || limpa.endsWith("*/}")) dentroDeBloco = false;
      continue;
    }
    if (limpa.startsWith("//")) continue;
    if (limpa.startsWith("/*") || limpa.startsWith("{/*")) {
      if (!(limpa.endsWith("*/") || limpa.endsWith("*/}"))) dentroDeBloco = true;
      continue;
    }
    if (limpa.startsWith("*")) continue;
    saida.push(linha);
  }
  return saida.join("\n");
}

const draft = semComentarios(readFileSync(new URL("../client/src/pages/Draft.tsx", import.meta.url), "utf8"));

describe("o Draft não cita percentagens que não aplica", () => {
  it("o removedor de comentários não comeu o ficheiro", () => {
    // Um teste que procura num ficheiro mutilado passa por acaso. Estas duas
    // linhas de código real têm de sobreviver à limpeza.
    expect(draft).toContain("const counterReason = enemyPicks.length");
    expect(draft.split("\n").length).toBeGreaterThan(2000);
  });

  it("a frase do Counter descreve o delta publicado, não uma taxa por pick", () => {
    expect(draft).toContain("a percentagem publicada de cada confronto");
    expect(draft).not.toContain("por matchup direto literal");
  });

  it("nenhuma frase do ecrã é construída a partir de `getCounterBonusRate`", () => {
    // A função continua exportada e devolvida no relatório do motor; o que não
    // pode voltar é alimentar texto que o utilizador lê como se fosse o que o
    // Score faz.
    expect(draft).not.toContain("getCounterBonusRate");
  });

  it("a frase da Sinergia admite que a fonte pode mandar mais do que a regra", () => {
    // `effectiveSynergyRate` usa a taxa configurada só quando a fonte não
    // publica uma para o par. A frase dizia-a como se fosse sempre a que conta.
    expect(draft).toContain("ou a percentagem que a fonte publicar para o par");
  });
});
