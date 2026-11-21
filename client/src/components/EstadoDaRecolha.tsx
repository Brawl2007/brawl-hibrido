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

/** Onde as partidas estão guardadas (v182): a migração para o formato compacto acontece sozinha, volta a volta. */
export type ArmazenamentoDasPartidas = { armazenamento: "legado" | "a_migrar" | "compacto"; convertidas?: number; diferenca?: number };

function textoDoArmazenamento(a: ArmazenamentoDasPartidas | undefined) {
  if (!a || a.armazenamento === "compacto") return null;
  if (a.armazenamento === "legado") return "Formato compacto das partidas: vai arrancar na próxima volta.";
  const feitas = (a.convertidas ?? 0).toLocaleString("pt-PT");
  return a.diferenca
    ? `Formato compacto: ${feitas} partidas copiadas; as contagens ainda não batem (diferença de ${a.diferenca}). O Draft continua a usar o formato anterior.`
    : `Formato compacto: ${feitas} partidas copiadas. O Draft continua a usar o formato anterior até a cópia acabar.`;
}

/** O ritmo da última volta (v184): quantos jogadores se leem, quantos falharam e quantos esperam na lista. */
export type RitmoDaRecolha = {
  ultimaVolta?: { pedidos?: number; lidos?: number; falhas?: Record<string, number>; novas?: number; proximoRitmo?: { jogadores: number } } | null;
  lista?: { naLista: number; naAltura: number } | null;
};

function textoDoRitmo(r: RitmoDaRecolha | undefined) {
  const volta = r?.ultimaVolta;
  if (!volta || typeof volta.pedidos !== "number") return null;
  const falhas = Object.entries(volta.falhas ?? {});
  const total = falhas.reduce((s, [, n]) => s + n, 0);
  const partes = [`Última volta: ${volta.lidos ?? 0} de ${volta.pedidos} jogadores lidos${volta.novas !== undefined ? `, ${volta.novas.toLocaleString("pt-PT")} partidas novas` : ""}.`];
  if (total > 0) partes.push(`Sem resposta: ${falhas.map(([motivo, n]) => `${n} (${motivo === "429" ? "limite de pedidos" : motivo})`).join(", ")}.`);
  if (volta.proximoRitmo) partes.push(`Próxima volta: ${volta.proximoRitmo.jogadores} jogadores.`);
  if (r?.lista) partes.push(`Lista: ${r.lista.naLista.toLocaleString("pt-PT")} jogadores, ${r.lista.naAltura.toLocaleString("pt-PT")} à espera de leitura.`);
  return partes.join(" ");
}

export function EstadoDaRecolha({ cadencia, armazenamento, ritmo }: { cadencia: Cadencia | undefined; armazenamento?: ArmazenamentoDasPartidas; ritmo?: RitmoDaRecolha }) {
  if (!cadencia) return null;
  const migracao = textoDoArmazenamento(armazenamento);
  const leituras = textoDoRitmo(ritmo);
  const aviso = cadencia.estado === "atrasada" || cadencia.estado === "falhou" || cadencia.estado === "sem_chave";
  return (
    <aside className={`my-3 rounded-xl border border-border bg-card px-4 py-3 text-sm ${aviso ? "text-destructive" : "text-muted-foreground"}`} aria-label="Estado da recolha automática">
      <strong>{ROTULOS[cadencia.estado]}</strong> · ciclo de {cadencia.intervaloMinutos === 60 ? "1 hora" : `${cadencia.intervaloMinutos} minutos`}
      <span className="mt-1 block">
        {cadencia.ultimaTentativa ? <>Último início: <time dateTime={cadencia.ultimaTentativa}>{hora(cadencia.ultimaTentativa)}</time>. </> : null}
        {cadencia.ultimaConclusao ? <>Guardada: <time dateTime={cadencia.ultimaConclusao}>{hora(cadencia.ultimaConclusao)}</time>. </> : null}
        {cadencia.estado === "atrasada" ? "Não há uma nova recolha concluída no horário previsto. O agendador ou o servidor podem ter falhado. " : null}
        {cadencia.estado !== "sem_chave" ? <>Próxima prevista: <time dateTime={cadencia.proximaPrevista}>{hora(cadencia.proximaPrevista)}</time>.</> : null}
        {cadencia.erro ? <> {cadencia.erro}</> : null}
        {leituras ? <span className="mt-1 block">{leituras}</span> : null}
        {migracao ? <span className="mt-1 block">{migracao}</span> : null}
      </span>
    </aside>
  );
}

