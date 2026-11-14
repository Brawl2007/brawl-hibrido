import React, { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { PesosCalibrados, ResultadoDaCalibracao } from "@shared/calibracaoDoMotorApi";
import {
  CAMPOS_DA_CONFIG,
  CAMPOS_DO_PICK,
  CONFIG_PADRAO,
  GRUPOS_DA_CONFIG,
  PRESETS_DA_CONFIG,
  type CampoDaConfig,
  type ConfigDoMotorApi,
  type DistribuicaoDoPick,
  type IdDoPreset,
  type SecaoEscalar,
} from "@shared/configDoMotorApi";

/**
 * O painel da configuração do motor com «API oficial» (v183): a distribuição de
 * pontos de cada pick e todos os bônus e desbônus. Ver `shared/configDoMotorApi.ts`.
 */

const NOMES_DAS_COLUNAS: Record<keyof DistribuicaoDoPick, string> = { vitoria: "Vitória %", uso: "Uso %", counter: "Counter %", sinergia: "Sinergia %" };

const numero = (valor: number, casas = 2) => valor.toLocaleString("pt-PT", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Um número que só se aplica ao sair do campo ou com Enter, para se poder escrever à vontade. */
function CampoNumerico({ valor, onCommit, rotulo, max = 100, passo = 0.1 }: { valor: number; onCommit: (v: number) => void; rotulo: string; max?: number; passo?: number }) {
  const [texto, setTexto] = useState(numero(valor, 1));
  const [aEditar, setAEditar] = useState(false);
  useEffect(() => { if (!aEditar) setTexto(numero(valor, 1)); }, [valor, aEditar]);
  const aplicar = () => {
    setAEditar(false);
    const lido = Number(texto.replace(",", "."));
    if (Number.isFinite(lido)) onCommit(Math.min(max, Math.max(0, lido)));
    else setTexto(numero(valor, 1));
  };
  return (
    <input
      className="api-pesos-campo"
      inputMode="decimal"
      step={passo}
      aria-label={rotulo}
      value={texto}
      onFocus={() => setAEditar(true)}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function mostrar(campo: CampoDaConfig, valor: number) {
  if (campo.formato === "forca") return valor === 0 ? "desligado" : `× ${numero(valor)}`;
  if (campo.formato === "pct") return `${Math.round(valor * 100)}%`;
  if (campo.formato === "inteiro") return String(valor);
  if (campo.formato === "interruptor") return valor >= 0.5 ? "ligado" : "desligado";
  return numero(valor);
}

function Controlo({ campo, config, onChange }: { campo: CampoDaConfig; config: ConfigDoMotorApi; onChange: (secao: SecaoEscalar, campo: string, valor: number) => void }) {
  const id = `config-api-${campo.secao}-${campo.campo}`;
  const valor = (config[campo.secao] as unknown as Record<string, number>)[campo.campo];
  const fabrica = (CONFIG_PADRAO[campo.secao] as unknown as Record<string, number>)[campo.campo];
  const alterado = Math.abs(valor - fabrica) > 1e-9;
  if (campo.formato === "interruptor") {
    return (
      <label className="motor-barra" htmlFor={id} title={campo.ajuda}>
        <span className="motor-barra-topo"><b>{campo.nome}</b><output htmlFor={id}>{mostrar(campo, valor)}</output></span>
        <input id={id} type="checkbox" checked={valor >= 0.5} onChange={(e) => onChange(campo.secao, campo.campo, e.target.checked ? 1 : 0)} />
        <small>{campo.ajuda}</small>
      </label>
    );
  }
  return (
    <label className="motor-barra" htmlFor={id} title={campo.ajuda}>
      <span className="motor-barra-topo"><b>{campo.nome}{alterado ? " ·" : ""}</b><output htmlFor={id}>{mostrar(campo, valor)}</output></span>
      <input id={id} type="range" min={campo.min} max={campo.max} step={campo.passo} value={valor} onChange={(e) => onChange(campo.secao, campo.campo, Number(e.target.value))} />
      <small>{campo.ajuda}{alterado ? ` (de fábrica: ${mostrar(campo, fabrica)})` : ""}</small>
    </label>
  );
}

/** O que a calibração nas partidas reais diz, e o botão que a aplica. */
function BlocoDaCalibracao({ calibracao, onCalibrar }: { calibracao: ResultadoDaCalibracao | null | undefined; onCalibrar?: (pesos: PesosCalibrados) => void }) {
  if (!calibracao) return <p className="regras-da-api-estado">Calibração nas partidas reais: ainda sem resultado (corre uma vez por dia, depois de as partidas passarem ao formato compacto).</p>;
  const q = calibracao.qualidade, p = calibracao.pesos;
  return (
    <div className="regras-da-api-estado" aria-label="Calibração nas partidas reais">
      <p>
        <b>Calibração nas partidas reais</b> — {calibracao.amostras.validacao.toLocaleString("pt-PT")} partidas recentes de validação:
        acerta {(q.acerto * 100).toFixed(1)}% (ao acaso, 50%); perda {q.logLoss.toFixed(4)} contra {q.referencia.toFixed(4)} ao acaso e {q.soForca.toFixed(4)} só com a força dos brawlers.
        Pesos medidos: força {p.forca.toFixed(2)}, counter {p.counter.toFixed(2)}, sinergia {p.sinergia.toFixed(2)} (1 = a conta já está calibrada).
      </p>
      {calibracao.aprovada
        ? onCalibrar && <button type="button" onClick={() => onCalibrar(p)}>Aplicar calibração</button>
        : <p>Não aprovada: {calibracao.motivo}</p>}
    </div>
  );
}

export function PainelDoMotorApi({ config, preset, onCampo, onPick, onProporcao, onPreset, onRepor, calibracao, onCalibrar }: {
  config: ConfigDoMotorApi;
  preset: IdDoPreset | "personalizado";
  onCampo: (secao: SecaoEscalar, campo: string, valor: number) => void;
  onPick: (pick: number, campo: keyof DistribuicaoDoPick, valor: number) => void;
  onProporcao: (pick: number, valor: number) => void;
  onPreset: (id: IdDoPreset) => void;
  onRepor: () => void;
  calibracao?: ResultadoDaCalibracao | null;
  onCalibrar?: (pesos: PesosCalibrados) => void;
}) {
  return (
    <section className="api-analise regras-da-api" aria-label="Configuração do motor da API">
      <h3>Distribuição de pontos</h3>
      <p>
        Cada pick reparte 100% entre a força do mapa (Vitória e Uso) e o que o draft em curso acrescenta (Counter e Sinergia).
        Ao mudar um valor, os outros três ajustam-se para a linha continuar a somar 100%.
      </p>
      <div className="draft-rules-actions" role="group" aria-label="Presets">
        {PRESETS_DA_CONFIG.map((p) => (
          <button key={p.id} type="button" title={p.ajuda} aria-pressed={preset === p.id} onClick={() => onPreset(p.id)} disabled={preset === p.id}>{p.nome}</button>
        ))}
        <span>{preset === "personalizado" ? "Personalizado — guardado neste navegador." : "Preset ativo."}</span>
      </div>
      <BlocoDaCalibracao calibracao={calibracao} onCalibrar={onCalibrar} />
      <div className="api-pesos-scroll">
        <table className="api-pesos">
          <thead>
            <tr><th>Pick</th>{CAMPOS_DO_PICK.map((c) => <th key={c}>{NOMES_DAS_COLUNAS[c]}</th>)}<th>Soma</th><th title="Soma máxima dos bônus, em múltiplos da força do mapa">Teto dos bônus ×</th></tr>
          </thead>
          <tbody>
            {config.picks.map((pick, i) => (
              <tr key={i}>
                <th>{i + 1}</th>
                {CAMPOS_DO_PICK.map((c) => (
                  <td key={c}><CampoNumerico valor={pick[c]} rotulo={`${NOMES_DAS_COLUNAS[c]} no pick ${i + 1}`} onCommit={(v) => onPick(i, c, v)} /></td>
                ))}
                <td>{numero(CAMPOS_DO_PICK.reduce((s, c) => s + pick[c], 0), 1)}</td>
                <td><CampoNumerico valor={config.tetoDosBonus.proporcao[i]} max={6} rotulo={`Teto dos bônus no pick ${i + 1}`} onCommit={(v) => onProporcao(i, v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {GRUPOS_DA_CONFIG.map((grupo) => (
        <details key={grupo.id} className="api-analise" open={grupo.id === "bonus" || grupo.id === "desbonus"}>
          <summary><b>{grupo.titulo}</b></summary>
          <div className="motor-grelha">
            {CAMPOS_DA_CONFIG.filter((campo) => campo.grupo === grupo.id).map((campo) => (
              <Controlo key={`${campo.secao}.${campo.campo}`} campo={campo} config={config} onChange={onCampo} />
            ))}
          </div>
        </details>
      ))}
      <p>Os bônus e desbônus aparecem em cada cartão como pontos percentuais. As percentagens são estimativas do modelo; não garantem o resultado da partida.</p>
      <div className="draft-rules-actions">
        <span>Guardado neste navegador. Os valores de fábrica são os da v181.</span>
        <button type="button" onClick={onRepor} disabled={preset === "padrao"}><RotateCcw size={15} /> Restaurar padrão</button>
      </div>
    </section>
  );
}
