import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENDAMENTO_DA_RECOLHA, CRON_DA_RECOLHA } from "@shared/agendamento";

const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

/**
 * O painel publicava um agendador que já não existe.
 *
 * `enabled: false` e `cronExpression: "0 0 * * * *"` vinham de colunas da base
 * que nada lê — sobraram da plataforma anterior, cujo agendador usava seis
 * campos. Quem lesse aquilo concluía que a recolha estava desligada e que o
 * horário estava mal; na verdade a recolha corre, mandada pelo cron da
 * plataforma, todos os dias às 05:00 UTC.
 *
 * O pior de um campo morto não é estar errado — é ter a mesma cara de um campo
 * certo. Custou uma investigação inteira começada no sítio errado.
 */
describe("agendamento publicado", () => {
  it("publica o horário que manda de facto", () => {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    expect(vercel.crons[0].schedule).toBe(CRON_DA_RECOLHA);
    expect(AGENDAMENTO_DA_RECOLHA.fonte).toContain("vercel.json");
  });

  it("não volta a publicar as colunas mortas da base", () => {
    // Nenhum `status` pode voltar a devolver o que a base guarda sobre cron.
    expect(routers).not.toMatch(/cronExpression: config\?\.cronExpression/);
    expect(routers).not.toMatch(/enabled: Boolean\(config\?\.enabled\)/);
  });

  it("os três painéis dizem todos a mesma coisa", () => {
    // Ranked, counters e batalhas observadas partilham o mesmo agendador real.
    const ocorrencias = routers.match(/agendamento: AGENDAMENTO_DA_RECOLHA/g) ?? [];
    expect(ocorrencias).toHaveLength(3);
  });
});
