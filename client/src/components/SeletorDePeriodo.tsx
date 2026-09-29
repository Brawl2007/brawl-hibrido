import { useEffect, useState } from "react";

/**
 * O período das partidas recolhidas: atalhos de 24 h, 7, 14 e 30 dias e
 * «Tudo», mais um campo para escrever os dias que se quiser (1 a 365).
 *
 * Usado na página «Partidas» e no Draft com «Só API oficial» — o mesmo
 * controlo nos dois sítios, para os números baterem certo entre eles.
 * `0` quer dizer «tudo».
 */
const ATALHOS = [
  { dias: 1, label: "24 h" },
  { dias: 7, label: "7 dias" },
  { dias: 14, label: "14 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 0, label: "Tudo" },
] as const;

export const DIAS_MAXIMOS = 365;

export function limitarDias(valor: number) {
  if (!Number.isFinite(valor)) return 30;
  return Math.min(DIAS_MAXIMOS, Math.max(0, Math.round(valor)));
}

export function SeletorDePeriodo({ dias, onChange, className = "" }: { dias: number; onChange: (dias: number) => void; className?: string }) {
  const [escrito, setEscrito] = useState(String(dias || ""));
  useEffect(() => setEscrito(dias ? String(dias) : ""), [dias]);
  const aplicar = () => {
    const numero = Number(escrito);
    if (escrito.trim() === "" || !Number.isFinite(numero) || numero < 1) {
      setEscrito(dias ? String(dias) : "");
      return;
    }
    const limitado = limitarDias(numero);
    setEscrito(String(limitado));
    if (limitado !== dias) onChange(limitado);
  };
  return (
    <div className={`partidas-grupo seletor-periodo ${className}`} role="group" aria-label="Período das partidas">
      <span>Período</span>
      {ATALHOS.map((atalho) => (
        <button key={atalho.dias} type="button" aria-pressed={dias === atalho.dias} className={dias === atalho.dias ? "is-active" : ""} onClick={() => onChange(atalho.dias)}>
          {atalho.label}
        </button>
      ))}
      <label className={`seletor-periodo-dias ${ATALHOS.some((atalho) => atalho.dias === dias) ? "" : "is-active"}`}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={DIAS_MAXIMOS}
          value={escrito}
          placeholder="—"
          aria-label="Número de dias"
          onChange={(evento) => setEscrito(evento.target.value)}
          onBlur={aplicar}
          onKeyDown={(evento) => { if (evento.key === "Enter") aplicar(); }}
        />
        dias
      </label>
    </div>
  );
}
