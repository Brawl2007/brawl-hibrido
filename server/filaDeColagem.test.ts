import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brawlScopeSlugFromName } from "@shared/brawlScopeSlugs";

/**
 * A FILA DE COLAGEM
 *
 * Com o BrawlScope a recusar qualquer servidor, quem traz estes números é uma
 * pessoa — e são 106 brawlers vezes sete vistas. A pessoa não sai do meio; o
 * que sai é o trabalho inútil à volta de cada passagem: escolher o modo de cada
 * vez, carregar num botão, e lembrar-se de cor por onde ia.
 */
const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf-8");

describe("fila de colagem", () => {
  const fila = () => ler("client/src/components/FilaDeColagem.tsx");

  it("o servidor diz QUAIS já foram coladas, não só quantas", () => {
    const counterSync = ler("server/counterSync.ts");
    expect(counterSync).toContain("export function getBrawlScopeColagemFeita");
    const routers = ler("server/routers.ts");
    expect(routers).toMatch(/colagemFeita: publicProcedure/);
  });

  it("guarda assim que se cola, sem botão pelo meio", () => {
    const fonte = fila();
    // A vista é a da tarefa em curso — ver "percurso por todas as vistas".
    expect(fonte).toContain("importar.mutate({ html: texto, view: vistaAtiva })");
    // Guardado dentro de um efeito sobre o texto: é a chegada do texto que
    // dispara, não um clique.
    expect(fonte).toMatch(/useEffect\(\(\) => \{[\s\S]{0,400}importar\.mutate/);
  });

  it("não dispara duas vezes com a mesma colagem", () => {
    const fonte = fila();
    expect(fonte).toContain("importar.isPending) return");
  });

  it("devolve o cursor à caixa depois de guardar", () => {
    expect(fila()).toContain("caixaRef.current?.focus()");
  });

  it("ordena por pontuação, não por alfabeto — parar a meio deixa o melhor feito", () => {
    const fonte = fila();
    expect(fonte).toContain("melhorPontuacao");
    expect(fonte).toMatch(/pontosB - pontosA/);
  });

  it("o endereço da próxima ficha leva o modo escolhido", () => {
    const fonte = fila();
    expect(fonte).toContain("brawlscope.com/counters/");
    expect(fonte).toMatch(/vista === "overall" \? "" : `\?mode=\$\{vista\}`/);
  });

  it("o endereço usa o slug do projeto, com as exceções conhecidas", () => {
    // "Larry & Lawrie" tem um endereço que não sai do nome por regra nenhuma.
    expect(brawlScopeSlugFromName("Larry & Lawrie")).toBe("larry-lawrie");
    expect(brawlScopeSlugFromName("8-Bit")).toBe("8-bit");
    expect(brawlScopeSlugFromName("Mr. P")).toBe("mr-p");
    expect(fila()).toContain("brawlScopeSlugFromName");
  });

  it("não faz um único pedido ao BrawlScope — quem abre a página é a pessoa", () => {
    const fonte = fila();
    expect(fonte).not.toMatch(/\bfetch\s*\(/);
    expect(fonte).not.toMatch(/axios/);
    // A ligação é um <a> que a pessoa carrega, num separador dela.
    expect(fonte).toContain('target="_blank"');
  });

  it("está montada no Draft", () => {
    expect(ler("client/src/pages/Draft.tsx")).toContain("<FilaDeColagem />");
  });
});

/**
 * O CICLO SEM FIM
 *
 * A colagem guardava sozinha com uma condição só: "há texto e não está a
 * correr". Quando uma leitura falhava, o texto ficava na caixa e o "a correr"
 * voltava a falso — as duas condições reuniam-se outra vez e a mesma ficha era
 * enviada de novo, e de novo, tantas vezes por segundo quantas o navegador
 * aguentasse. Uma ficha que falhasse chegava para pendurar o painel inteiro.
 *
 * Foi o que aconteceu ao abrir o Estado das fontes.
 */
describe("a colagem automática não se repete", () => {
  const fila = () => ler("client/src/components/FilaDeColagem.tsx");

  it("guarda o texto já enviado e não o manda outra vez", () => {
    const fonte = fila();
    expect(fonte).toContain("jaEnviado");
    expect(fonte).toMatch(/if \(pronto === jaEnviado\.current\) return;/);
    // A marca é posta ANTES do envio: entre marcar e enviar não pode haver
    // espaço para um segundo desenho entrar pelo meio.
    const efeito = fonte.slice(fonte.indexOf("const pronto = texto.trim()"));
    expect(efeito.indexOf("jaEnviado.current = pronto")).toBeLessThan(efeito.indexOf("importar.mutate"));
  });

  it("a marca é levantada quando a ficha fica guardada", () => {
    const fonte = fila();
    const sucesso = fonte.slice(fonte.indexOf("onSuccess"), fonte.indexOf("onError"));
    expect(sucesso).toContain('jaEnviado.current = ""');
  });

  it("a referência é criada antes de quem a usa", () => {
    const fonte = fila();
    expect(fonte.indexOf("const jaEnviado = useRef")).toBeLessThan(fonte.indexOf("jaEnviado.current"));
  });
});

/**
 * DUAS COISAS COM O MESMO NOME
 *
 * A rota devolvia `views` com os NOMES já colados e, na mesma linha, espalhava
 * a cobertura — que traz um `views` seu, com CONTAGENS. O segundo apagava o
 * primeiro sem um aviso, e o ecrã ia percorrer uma lista que afinal era
 * `{ profiles, pairs }`:
 *
 *     TypeError: ((intermediate value) ?? []).map is not a function
 *
 * E não caiu só o painel: levou o Draft inteiro atrás.
 */
describe("os nomes colados e as contagens não se pisam", () => {
  it("cada um vai no seu campo, sem espalhar por cima do outro", () => {
    const routers = ler("server/routers.ts");
    const rota = routers.slice(routers.indexOf("colagemFeita: publicProcedure"));
    const bloco = rota.slice(0, 300);
    expect(bloco).toContain("feitas: getBrawlScopeColagemFeita()");
    expect(bloco).toContain("cobertura: getBrawlScopeMatchupCoverage()");
    // Espalhar a cobertura à solta é o que criava a colisão.
    expect(bloco).not.toContain("...getBrawlScopeMatchupCoverage()");
  });

  it("o painel confirma que recebeu uma lista antes de a percorrer", () => {
    const fila = ler("client/src/components/FilaDeColagem.tsx");
    expect(fila).toContain("Array.isArray(valor) ? valor : []");
    // Nada percorre a resposta do servidor sem passar por essa confirmação.
    expect(fila).not.toMatch(/progresso\.data\?\.feitas\?\.\[[^\]]+\] \?\? \[\]\)\.map/);
  });

  it("a devolver nomes, devolve mesmo nomes", () => {
    const counterSync = ler("server/counterSync.ts");
    const funcao = counterSync.slice(counterSync.indexOf("export function getBrawlScopeColagemFeita"));
    expect(funcao.slice(0, 400)).toContain("Object.keys(perfis).sort()");
  });
});

/**
 * UMA CAIXA QUE NÃO RESPONDE
 *
 * A caixa da fila só reage a partir de 400 caracteres. Quem lá colasse o
 * ENDEREÇO da ficha — o gesto mais natural, e o que a caixa antiga pedia — não
 * via nada acontecer: sem erro, sem aviso, sem mudança. Parecia avariada.
 */
describe("a caixa diz o que recebeu de errado", () => {
  const fila = () => ler("client/src/components/FilaDeColagem.tsx");

  it("distingue um endereço de uma página curta", () => {
    const fonte = fila();
    expect(fonte).toContain("Isso é o endereço da ficha, não a ficha");
    expect(fonte).toContain("Faltam caracteres");
  });

  it("o aviso aparece no ecrã, não só na consola", () => {
    expect(fila()).toContain("{aviso && <p className=\"paste-queue-warn\">{aviso}</p>}");
  });

  it("não avisa quando a caixa está vazia — só quando há algo que não serve", () => {
    expect(fila()).toContain("if (!pronto || pronto.length >= 400) return null;");
  });
});

/**
 * A ORDEM DA FILA
 *
 * Prometi ordem por importância e saía por abecedário: 8-Bit, Alli, Amber,
 * Angelo. A comparação era `linha.score > atual`, e com `score` indefinido isso
 * é sempre falso — o brawler nunca entrava por essa via e ficava a valer o -1
 * do catálogo. Com todos a -1, o desempate alfabético decidia tudo.
 */
describe("a fila ordena por pontuação", () => {
  it("uma pontuação que não é número não passa por número", () => {
    const fonte = ler("client/src/components/FilaDeColagem.tsx");
    expect(fonte).toContain("Number.isFinite(linha.score)");
    expect(fonte).not.toMatch(/if \(linha\.score > atual\)/);
  });

  it("linhas sem brawler não entram na conta", () => {
    expect(ler("client/src/components/FilaDeColagem.tsx")).toContain("if (!linha?.brawler) continue;");
  });
});

/**
 * ENCALHADO NUMA FICHA, SEM SABER PORQUÊ
 *
 * O travão do v47 impede o ciclo sem fim comparando o texto com o último
 * enviado. Mas ele não distingue duas coisas: "é igual porque o efeito voltou a
 * correr" — que tem de ser travado — e "é igual porque a pessoa copiou e colou
 * outra vez" — que é um pedido deliberado.
 *
 * Consequência: uma ficha que falhasse ficava a bloquear a fila. Colar de novo
 * a mesma página não fazia nada, e o erro tinha ido num aviso que já
 * desapareceu. A fila ficava presa num brawler, calada.
 */
describe("nunca ficar encalhado numa ficha", () => {
  const fila = () => ler("client/src/components/FilaDeColagem.tsx");

  it("o erro fica no painel, não só num aviso que passa", () => {
    const fonte = fila();
    expect(fonte).toContain("setErro(resultado.error");
    expect(fonte).toContain('className="paste-queue-error"');
  });

  it("há uma forma deliberada de repetir a mesma ficha", () => {
    const fonte = fila();
    const bloco = fonte.slice(fonte.indexOf("Tentar outra vez") - 900, fonte.indexOf("Tentar outra vez"));
    // Levantar o travão é o gesto da pessoa, nunca do efeito.
    expect(bloco).toContain('jaEnviado.current = ""');
    expect(bloco).toContain("importar.mutate");
  });

  it("há sempre forma de seguir em frente sem resolver a ficha", () => {
    const fonte = fila();
    expect(fonte).toContain("setSaltados");
    // Saltar está disponível com erro e sem erro: o beco sem saída não pode
    // depender de ter havido um erro visível.
    expect((fonte.match(/setSaltados\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("o que foi saltado sai da fila", () => {
    // A fila passou a ser uma lista de tarefas (brawler + vista): o salto
    // aplica-se ao brawler todo, antes de se gerarem as vistas dele.
    const fonte = fila();
    expect(fonte).toContain("if (postosDeLado.has(chave)) continue;");
  });

  it("o travão continua a existir — o ciclo sem fim não pode voltar", () => {
    const fonte = fila();
    expect(fonte).toMatch(/if \(pronto === jaEnviado\.current\) return;/);
  });
});

/**
 * FAZER AS SETE VISTAS, E NÃO UMA
 *
 * A fila trabalhava uma vista de cada vez e obrigava a trocar à mão. Quem
 * quisesse o site completo acabava com um brawler em cada modo e nenhum modo
 * utilizável — foi exactamente o que aconteceu: o Griff em Nocaute, o Darryl em
 * Pique-Gema, a Colette em Fute-Brawl.
 *
 * No percurso "tudo", as sete vistas de um brawler vêm seguidas. Fica-se na
 * mesma ficha a trocar o modo no endereço, em vez de andar para trás e para a
 * frente entre brawlers.
 */
describe("percurso por todas as vistas", () => {
  const fila = () => ler("client/src/components/FilaDeColagem.tsx");

  it("a fila é uma lista de páginas, não de nomes", () => {
    const fonte = fila();
    expect(fonte).toMatch(/Array<\{ brawler: string; vista: string \}>/);
    expect(fonte).toContain("proximaTarefa");
  });

  it("percorre as vistas todas de um brawler antes de passar ao seguinte", () => {
    const fonte = fila();
    // O brawler está no ciclo de fora e as vistas no de dentro: trocar esta
    // ordem daria um brawler em cada modo, que é o que se quer evitar.
    const bloco = fonte.slice(fonte.indexOf("for (const brawler of roster)"), fonte.indexOf("return lista;"));
    expect(bloco).toContain("for (const vistaId of vistasDoPercurso)");
  });

  it("guarda na vista da tarefa, não na do seletor", () => {
    const fonte = fila();
    expect(fonte).toContain("importar.mutate({ html: texto, view: vistaAtiva })");
    expect(fonte).not.toContain("importar.mutate({ html: texto, view: vista })");
  });

  it("a ligação abre a ficha no modo da tarefa", () => {
    expect(fila()).toContain("enderecoDaFicha(proxima, vistaAtiva)");
  });

  it("a contagem é sobre o trabalho todo, não sobre uma vista", () => {
    const fonte = fila();
    expect(fonte).toContain('roster.length * (percurso === "tudo" ? VISTAS.length : 1)');
  });

  it("continua a dar para fazer só uma vista, para quem preferir", () => {
    const fonte = fila();
    expect(fonte).toContain('setPercurso(evento.target.value === "tudo" ? "tudo" : "vista")');
  });
});
