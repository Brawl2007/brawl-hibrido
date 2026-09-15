import { describe, expect, it } from "vitest";
import { detectPastedBrawler, looksLikeHtml, parsePastedMatchups, readBrawlScopeUrl } from "@shared/brawlScopePaste";

/**
 * A avaria que isto corrige.
 *
 * A primeira versão mandava copiar o CÓDIGO-FONTE (Ctrl+U). Resultado real, na
 * mão do utilizador: "Reconheci Shelly, mas só li 0 confrontos". O nome vinha —
 * está no HTML servido — e a tabela não, porque o BrawlScope monta-a já no
 * navegador. Zero confrontos em todas as fichas, em todos os brawlers.
 *
 * O que se copia agora é a página COMO SE VÊ (Ctrl+A, Ctrl+C), que traz o texto
 * já montado. Ler texto em vez de marcação é também mais resistente: podem
 * mudar as etiquetas à vontade que "R-T 64.1% vs 49.0% usual" continua igual.
 */
const ROSTER = ["Shelly", "R-T", "Mortis", "Edgar", "Belle", "Piper", "Bea", "Colt", "Larry & Lawrie", "Larry", "Bo", "Bonnie", "Mr. P", "El Primo"];

describe("ler a página colada", () => {
  it("lê um confronto no formato que a página mostra", () => {
    const texto = "Every matchup R-T 64.1% vs 49.0% usual · 1,204 battles +15.1";
    const { matchups } = parsePastedMatchups(texto, ROSTER);

    expect(matchups).toHaveLength(1);
    expect(matchups[0]).toMatchObject({ opponent: "R-T", rate: 64.1, average: 49 });
    // O delta é calculado, não lido: é a mesma conta e não depende do sinal.
    expect(matchups[0].delta).toBeCloseTo(15.1, 1);
  });

  it("lê deltas negativos sem depender de como o sinal vem escrito", () => {
    // O menos tipográfico "−" já partiu leituras antes de agora.
    const texto = "Mortis 43.2% vs 49.8% usual · 980 battles −6.6";
    const { matchups } = parsePastedMatchups(texto, ROSTER);

    expect(matchups[0].opponent).toBe("Mortis");
    expect(matchups[0].delta).toBeCloseTo(-6.6, 1);
  });

  it("descarta uma linha cujo delta publicado não bate com as percentagens", () => {
    // Números de linhas diferentes colados juntos: melhor perder a linha do que
    // guardar um valor que ninguém publicou.
    const texto = "Belle 60.0% vs 50.0% usual · 400 battles +2.0";
    const { matchups, discarded } = parsePastedMatchups(texto, ROSTER);

    expect(matchups).toHaveLength(0);
    expect(discarded).toBe(1);
  });

  it("não confunde um nome curto contido noutro", () => {
    const texto = "Bonnie 55.0% vs 50.0% usual +5.0 Larry & Lawrie 52.0% vs 48.0% usual +4.0";
    const { matchups } = parsePastedMatchups(texto, ROSTER);

    expect(matchups.map((confronto) => confronto.opponent)).toEqual(["Bonnie", "Larry & Lawrie"]);
  });

  it("fica com a primeira leitura de cada adversário", () => {
    const texto = "Piper 60.0% vs 50.0% usual +10.0 Piper 55.0% vs 50.0% usual +5.0";
    const { matchups } = parsePastedMatchups(texto, ROSTER);

    expect(matchups).toHaveLength(1);
    expect(matchups[0].delta).toBeCloseTo(10, 1);
  });

  it("lê uma ficha inteira colada, com o ruído da página à volta", () => {
    const adversarios = ["R-T", "Mortis", "Edgar", "Belle", "Piper", "Bea", "Colt", "Bo", "Mr. P", "El Primo"];
    const linhas = adversarios
      .map((nome, indice) => {
        const media = 48 + (indice % 4);
        const delta = (indice % 7) - 3;
        return `${nome} ${(media + delta).toFixed(1)}% vs ${media.toFixed(1)}% usual · ${100 + indice} battles ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`;
      })
      .join(" ");
    const texto = `Shelly counters Brawl Stars Home Tier list Counters Shelly (top picks) Shelly Punishes Pair with Every matchup ${linhas} Privacy Policy`;

    const lido = parsePastedMatchups(texto, ROSTER);
    expect(lido.brawler).toBe("Shelly");
    expect(lido.matchups).toHaveLength(adversarios.length);
  });
});

describe("de quem é a ficha", () => {
  it("reconhece pelo título", () => {
    expect(detectPastedBrawler("Shelly counters — BrawlScope", ROSTER)).toBe("Shelly");
  });

  it("reconhece pela secção que a página publica", () => {
    expect(detectPastedBrawler("Brawlers That Counter Piper", ROSTER)).toBe("Piper");
    expect(detectPastedBrawler("Counters Bea (top picks)", ROSTER)).toBe("Bea");
  });

  it("não inventa um nome que não exista no roster", () => {
    expect(detectPastedBrawler("Something counters everything", ROSTER)).toBeUndefined();
  });
});

describe("o endereço da ficha", () => {
  it("dá o brawler e o modo, que é a informação mais fiável", () => {
    expect(readBrawlScopeUrl("https://brawlscope.com/counters/shelly?mode=knockout"))
      .toEqual({ slug: "shelly", mode: "knockout" });
  });

  it("sem modo, é a vista geral", () => {
    expect(readBrawlScopeUrl("https://brawlscope.com/counters/piper")).toEqual({ slug: "piper", mode: undefined });
  });

  it("ignora um endereço de outro sítio", () => {
    expect(readBrawlScopeUrl("https://exemplo.com/counters/shelly?mode=heist")).toEqual({});
    expect(readBrawlScopeUrl("nem sequer é um endereço")).toEqual({});
  });
});

describe("marcação ou texto", () => {
  it("distingue os dois", () => {
    expect(looksLikeHtml('<a href="/counters/shelly">Shelly</a>')).toBe(true);
    expect(looksLikeHtml("Shelly 64.1% vs 49.0% usual")).toBe(false);
  });
});

/**
 * Casos apanhados contra a PÁGINA REAL, não contra um teste escrito à medida
 * do parser.
 *
 * O primeiro parser passava nos meus testes e falhava na mão do utilizador —
 * porque os testes tinham sido feitos a partir do que eu julgava ser o formato.
 * Estas linhas são as que o BrawlScope mostra mesmo.
 */
describe("linhas reais do BrawlScope", () => {
  const ROSTER_REAL = ["R-T", "Gale", "Sirius", "Charlie", "Pam", "Amber", "Ruffs", "Sprout", "Lola", "Meg",
    "Kenji", "Gene", "Najia", "Bo", "Squeak", "Berry", "Juju", "Nita", "Starr Nova", "Piper", "Shelly"];

  it("lê uma linha tal como aparece, com contagem em K e ponto do meio", () => {
    const { matchups } = parsePastedMatchups("6 Amber 65.4% vs 57.8% usual · 2.6K battles +7.6", ROSTER_REAL);
    expect(matchups[0]).toMatchObject({ opponent: "Amber", rate: 65.4, average: 57.8 });
  });

  it("aceita o arredondamento da fonte: 58.0−52.5 dá 5.5 e a página diz +5.4", () => {
    // Rejeitar por uma décima deitaria fora metade da tabela.
    const { matchups, discarded } = parsePastedMatchups("18 Nita 58.0% vs 52.5% usual · 949 battles +5.4", ROSTER_REAL);
    expect(discarded).toBe(0);
    expect(matchups[0].delta).toBeCloseTo(5.5, 1);
  });

  it("lê uma linha de delta zero, que vem sem sinal nenhum", () => {
    const { matchups } = parsePastedMatchups("45 Najia 50.0% vs 50.0% usual · 14.4K battles 0.0", ROSTER_REAL);
    expect(matchups[0]).toMatchObject({ opponent: "Najia", delta: 0 });
  });

  it("o nome da linha anterior não rouba o lugar — o caso que perdeu o Surge", () => {
    /**
     * Contra a página real, com endereços por linha, "Ruffs" aparecia dentro do
     * link da linha 50 e ganhava a corrida ao "Surge" da linha 51. O confronto
     * desaparecia sem sequer ser contado como descartado: invisível.
     */
    const duasLinhas = [
      "[50 Ruffs 46.7% vs 47.1% usual · 15.9K battles -0.4](https://brawlscope.com/counters/ruffs?mode=knockout)",
      "[51 Surge 45.9% vs 46.3% usual · 5.7K battles -0.4](https://brawlscope.com/counters/surge?mode=knockout)",
    ].join("\n");

    const { matchups } = parsePastedMatchups(duasLinhas, ROSTER_REAL);
    expect(matchups.map((confronto) => confronto.opponent)).toEqual(["Ruffs", "Surge"]);
  });

  it("aceita um brawler que o catálogo ainda não conhece, e diz quais foram", () => {
    // Quando a Supercell lança um brawler, o catálogo do projeto não o tem.
    // Descartar a coluna dele em silêncio seria perder dados sem se dar por isso.
    const { matchups, unknownNames } = parsePastedMatchups("70 Angelo 49.9% vs 51.2% usual · 20.1K battles -1.2", ROSTER_REAL);

    expect(matchups[0].opponent).toBe("Angelo");
    expect(unknownNames).toContain("Angelo");
  });

  it("não aceita como nome uma palavra da própria linha", () => {
    const { matchups } = parsePastedMatchups("usual 50.0% vs 50.0% usual", ROSTER_REAL);
    expect(matchups).toHaveLength(0);
  });

  it("lê a ficha inteira de uma vez, com o ruído todo", () => {
    const linhas = ["1 R-T 65.2% vs 49.0% usual · 210 battles +16.2",
      "2 Gale 57.6% vs 45.6% usual · 368 battles +12.0",
      "3 Sirius 62.1% vs 51.7% usual · 861 battles +10.5",
      "4 Charlie 59.4% vs 48.8% usual · 382 battles +10.6",
      "5 Pam 72.5% vs 45.9% usual · 40 battles +26.6"].join("\n");
    const lido = parsePastedMatchups(`Shelly counters Every matchup\n${linhas}\nPrivacy Policy`, ROSTER_REAL);

    expect(lido.brawler).toBe("Shelly");
    expect(lido.matchups).toHaveLength(5);
    expect(lido.discarded).toBe(0);
  });
});

/**
 * O CONFRONTO QUE FALTAVA SEMPRE
 *
 * Com a ficha inteira do Shelly — 105 linhas, lidas do brawlscope.com — a
 * leitura trazia 104. O que faltava era o Frank, e faltava por um motivo que
 * não se vê a olhar para a linha dele: 49,3% contra 49,3% dá 0,0, um delta sem
 * sinal. A confirmação procurava um número com sinal, não encontrava nenhum na
 * linha do Frank, continuava a ler e ia buscar o −0,3 da linha de baixo.
 * Comparava os dois, achava que não batiam certo, e deitava fora a linha boa.
 *
 * Um confronto perdido em cada ficha, sempre o mesmo, sem erro nenhum à vista.
 */
describe("a confirmação do delta não pode atravessar para a linha seguinte", () => {
  const roster = ["Hank", "Frank", "Lola", "Piper", "Surge"];

  it("lê uma linha de delta zero mesmo com a seguinte a trazer um delta com sinal", () => {
    const texto = [
      "Hank 48.1% vs 47.8% usual +0.3",
      "Frank 49.3% vs 49.3% usual 0.0",
      "Lola 47.1% vs 47.4% usual -0.3",
    ].join("\n");
    const lido = parsePastedMatchups(texto, roster);
    expect(lido.matchups.map((confronto) => confronto.opponent)).toEqual(["Hank", "Frank", "Lola"]);
    expect(lido.discarded).toBe(0);
    expect(lido.matchups.find((confronto) => confronto.opponent === "Frank")?.delta).toBe(0);
  });

  it("continua a recusar uma linha cujo próprio delta publicado não bate certo", () => {
    // 60,0 − 50,0 = 10,0, e a página diz +2,0: uma das leituras está errada e
    // nenhuma delas merece confiança.
    const texto = "Piper 60.0% vs 50.0% usual +2.0\nSurge 52.8% vs 49.6% usual +3.2";
    const lido = parsePastedMatchups(texto, roster);
    expect(lido.matchups.map((confronto) => confronto.opponent)).toEqual(["Surge"]);
    expect(lido.discarded).toBe(1);
  });

  it("aceita o arredondamento da própria linha", () => {
    // 58,0 − 52,5 = 5,5 e a página publica +5,4. Diferença de 0,1: é
    // arredondamento da fonte, não desacordo.
    const lido = parsePastedMatchups("Piper 58.0% vs 52.5% usual +5.4", roster);
    expect(lido.matchups).toHaveLength(1);
    expect(lido.matchups[0].delta).toBe(5.5);
  });
});

/**
 * 103 DE 105
 *
 * A ficha guardava 103 confrontos e a página parecia ter 105. Duas explicações
 * possíveis, muito diferentes uma da outra: ou a página daquele brawler só lista
 * 103 — o BrawlScope só mostra confrontos com jogos que cheguem, e esse número
 * muda de brawler para brawler —, ou duas linhas caíram no mesmo adversário e
 * uma engoliu a outra.
 *
 * A segunda é um defeito. Passavam as duas pela mesma porta, caladas.
 */
describe("linhas que se colapsam numa só", () => {
  const roster = ["Shelly", "Mortis", "Piper"];

  it("conta e nomeia a linha repetida, em vez de a perder em silêncio", () => {
    const texto = [
      "Mortis 43.3% vs 49.7% usual -6.4",
      "Piper 52.4% vs 50.0% usual +2.4",
      "Mortis 44.0% vs 49.7% usual -5.7",
    ].join("\n");
    const lido = parsePastedMatchups(texto, roster);
    expect(lido.matchups).toHaveLength(2);
    expect(lido.duplicated).toEqual(["Mortis"]);
  });

  it("uma ficha sem repetições diz isso mesmo", () => {
    const lido = parsePastedMatchups("Mortis 43.3% vs 49.7% usual -6.4\nPiper 52.4% vs 50.0% usual +2.4", roster);
    expect(lido.duplicated).toEqual([]);
    expect(lido.matchups).toHaveLength(2);
  });

  it("a repetição não é confundida com uma linha descartada", () => {
    // Descartada é uma linha que não se conseguiu atribuir a ninguém; repetida
    // é uma que se atribuiu a alguém que já tinha sido lido. Contá-las juntas
    // apagava a diferença entre um problema de leitura e um de nomes.
    const lido = parsePastedMatchups("Mortis 43.3% vs 49.7% usual -6.4\nMortis 44.0% vs 49.7% usual -5.7", roster);
    expect(lido.discarded).toBe(0);
    expect(lido.duplicated).toHaveLength(1);
  });
});
