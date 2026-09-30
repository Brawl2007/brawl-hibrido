import type { Request, Response } from "express";
import { waitUntil } from "@vercel/functions";
import { garantirArranque } from "./arranque";
import { recolherSeForAltura } from "./observedMatchCollection";

/** O agendador recebe a confirmação de receção; a base confirma o resultado final. */
export function agendarRecolhaDePartidas(_req: Request, res: Response) {
  const trabalho = garantirArranque().then(() => recolherSeForAltura("scheduled"))
    .then((resultado) => {
      if (resultado.ok) console.log("[Agendador de partidas] Recolha concluída:", JSON.stringify(resultado));
      else if ("saltada" in resultado) console.log("[Agendador de partidas] Janela já atendida:", JSON.stringify(resultado));
      else console.error("[Agendador de partidas] Recolha falhou:", JSON.stringify(resultado));
    }).catch((erro: unknown) => {
      console.error("[Agendador de partidas] Não foi possível recolher:", erro instanceof Error ? erro.message : erro);
    });
  // Sem waitUntil, a Vercel pode parar a função ao enviar a resposta.
  waitUntil(trabalho);
  res.status(202).set("Cache-Control", "no-store").json({
    accepted: true,
    mensagem: "Pedido recebido. O estado da recolha mostra a conclusão e as partidas guardadas.",
  });
}
