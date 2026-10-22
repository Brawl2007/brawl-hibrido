import React from "react";
import type { estadoDaCadenciaDasPartidas } from "@shared/agendamentoPartidas";

type Cadencia = ReturnType<typeof estadoDaCadenciaDasPartidas>;

const ROTULOS: Record<Cadencia["estado"], string> = {
  em_dia: "Última volta concluída",
  a_recolher: "A recolher partidas",
  atrasada: "Recolha atrasada",
  falhou: "A última recolha falhou",
  sem_chave: "Recolha sem chave da API",
  sem_recolhas: "Ainda sem recolhas",
};

function hora(valor: string) {
  return new Date(valor).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function EstadoDaRecolha({ cadencia }: { cadencia: Cadencia | undefined }) {
  if (!cadencia) return null;
  const aviso = cadencia.estado === "atrasada" || cadencia.estado === "falhou" || cadencia.estado === "sem_chave";
  return (
    <aside className={`my-3 rounded-xl border border-border bg-card px-4 py-3 text-sm ${aviso ? "text-destructive" : "text-muted-foreground"}`} aria-label="Estado da recolha automática">
      <strong>{ROTULOS[cadencia.estado]}</strong> · ciclo de 15 minutos
      <span className="mt-1 block">
        {cadencia.ultimaTentativa ? <>Último início: <time dateTime={cadencia.ultimaTentativa}>{hora(cadencia.ultimaTentativa)}</time>. </> : null}
        {cadencia.ultimaConclusao ? <>Guardada: <time dateTime={cadencia.ultimaConclusao}>{hora(cadencia.ultimaConclusao)}</time>. </> : null}
        {cadencia.estado === "atrasada" ? "Não há uma nova recolha concluída no horário previsto. O agendador ou o servidor podem ter falhado. " : null}
        {cadencia.estado !== "sem_chave" ? <>Próxima prevista: <time dateTime={cadencia.proximaPrevista}>{hora(cadencia.proximaPrevista)}</time>.</> : null}
        {cadencia.erro ? <> {cadencia.erro}</> : null}
      </span>
    </aside>
  );
}

