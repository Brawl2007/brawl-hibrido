import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * v169 — como no PL Prodigy: passar o rato por um cartão do Draft mostra os
 * fatores aplicados (bónus e desbónus, com pontos e percentagem), ou as
 * partes do motor quando o motor é o PL Prodigy ou o MetaPick.
 */
describe("a dica dos fatores nos cartões do Draft", () => {
  const draft = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
  const cartao = draft.slice(draft.indexOf("const DraftCard = memo("), draft.indexOf("});", draft.indexOf("const DraftCard = memo(")));

  it("cada cartão compacto fica dentro da dica; com os detalhes abertos não se repete", () => {
    expect(cartao).toContain("<DicaDosFatores conteudo={dica} desligada={expanded}>");
    expect(cartao).toContain("</DicaDosFatores>");
  });

  it("só os fatores que mexeram nos pontos, com pontos e percentagem; ou as partes do motor", () => {
    expect(cartao).toContain("activeBonusItems.filter((bonus) => Math.abs(bonus.points) >= 0.005)");
    expect(cartao).toContain("normalizeContextualPoints(bonus.points, basePoints, signal.scoreBreakdown.hybridPoints)");
    expect(cartao).toContain("formatRulePercentage(bonus.rate)");
    expect(cartao).toContain("motor.partes.filter((parte) => Math.abs(parte.valor) >= 0.05)");
  });

  it("abre num portal (não é cortada pela lista) e com o teclado também", () => {
    expect(draft).toContain('import * as DicaPrimitiva from "@radix-ui/react-tooltip";');
    expect(draft).toContain("<DicaPrimitiva.Portal>");
    expect(draft).toContain("<DicaPrimitiva.Trigger asChild>{children}</DicaPrimitiva.Trigger>");
  });
});
