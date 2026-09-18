import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VERSAO_DA_EXTENSAO, avisoDeVersao, versaoEAnterior } from "@shared/versaoDaExtensao";

/**
 * O site passa a saber qual extensão produziu cada ficheiro.
 *
 * POR QUE ISTO EXISTE
 *
 * Três vezes seguidas publiquei uma correção na extensão, disse "atualiza e
 * recarrega", e o que continuou a correr foi a versão antiga. Da última vez só
 * percebi porque a mensagem de erro que me chegou era, palavra a palavra, uma
 * frase que já não existe no código — descobri por acaso, ao procurá-la e não a
 * encontrar.
 *
 * Não havia forma de ver, do lado do site, qual é a extensão que produziu um
 * ficheiro: os dados entravam e ninguém dizia nada. Agora a extensão carimba a
 * versão, e a ausência do carimbo é ela própria a resposta.
 */
describe("versão da extensão que produziu o ficheiro", () => {
  it("o número deste módulo é o do manifesto", () => {
    const manifesto = JSON.parse(readFileSync(resolve(process.cwd(), "client/public/brawlscope-helper/manifest.json"), "utf8")) as { version: string };
    expect(VERSAO_DA_EXTENSAO).toBe(manifesto.version);
  });

  it("a extensão carimba a versão no que exporta", () => {
    const panel = readFileSync(resolve(process.cwd(), "client/public/brawlscope-helper/panel.js"), "utf8");
    // Nos dois ficheiros: mapas e fichas.
    expect(panel.match(/extensao: VERSAO/g) ?? []).toHaveLength(2);
  });

  /** Um ficheiro sem carimbo é anterior ao carimbo existir. Silêncio é resposta. */
  it("trata a ausência de versão como versão antiga", () => {
    expect(versaoEAnterior(undefined)).toBe(true);
    expect(versaoEAnterior(null)).toBe(true);
    expect(versaoEAnterior("")).toBe(true);
    expect(avisoDeVersao(undefined)).toContain("anterior à v");
  });

  it("compara por número, e não por ordem alfabética", () => {
    // "9" vem depois de "10" no alfabeto; aqui não pode vir.
    expect(versaoEAnterior("9.0.0", "10.0.0")).toBe(true);
    expect(versaoEAnterior("10.0.0", "9.0.0")).toBe(false);
    expect(versaoEAnterior("96.0.0", "97.0.0")).toBe(true);
    expect(versaoEAnterior("97.0.0", "97.0.0")).toBe(false);
    /**
     * Mais recente do que o site espera não é motivo para aviso nenhum.
     *
     * O número é DERIVADO da constante, e não escrito à mão: a primeira versão
     * disto fixava "98.0.0" como "mais recente", e o teste passou a falhar
     * assim que a extensão chegou à 99 — a falhar por causa do teste, não do
     * código.
     */
    const maisRecente = `${Number(VERSAO_DA_EXTENSAO.split(".")[0]) + 1}.0.0`;
    expect(versaoEAnterior(maisRecente)).toBe(false);
    expect(avisoDeVersao(maisRecente)).toBeNull();
  });

  it("o aviso diz a versão recebida e a esperada", () => {
    const aviso = avisoDeVersao("96.0.0") ?? "";
    expect(aviso).toContain("v96.0.0");
    expect(aviso).toContain(`v${VERSAO_DA_EXTENSAO}`);
    // E diz que os dados não se perderam: o aviso não pode parecer uma recusa.
    expect(aviso).toContain("guardados na mesma");
  });

  /**
   * O aviso aparece ANTES do "correu bem".
   *
   * Uma extensão desatualizada guarda os dados na mesma, por isso a mensagem de
   * sucesso é verdadeira — e foi isso que deixou passar três corridas seguidas
   * feitas com a versão antiga.
   */
  it("a interface põe o aviso à frente do resultado", () => {
    const componente = readFileSync(resolve(process.cwd(), "client/src/components/ImportarLote.tsx"), "utf8");
    expect(componente).toContain("${aviso ? `⚠️ ${aviso} ` : \"\"}${rotacaoDita}");
  });
});
