import {
  AJUSTES_METAPICK,
  LIMITES_METAPICK,
  LIMITES_PL_PRODIGY,
  PESOS_PL_PRODIGY,
  type AjustesMetaPick,
  type ConfigDoMotor,
  type MotorDoDraft,
  type PesosPLProdigy,
} from "@shared/motoresDoDraft";

/**
 * Escolher o motor do Draft e afinar as barras dele. Os nomes e os valores de
 * partida são os das definições do PL Prodigy e do MetaPick.
 */

export const NOMES_DOS_MOTORES: Record<MotorDoDraft, string> = {
  hibrido: "Brawl Híbrido",
  plprodigy: "PL Prodigy",
  metapick: "MetaPick",
};

const MOTORES: Array<{ id: MotorDoDraft; resumo: string }> = [
  { id: "hibrido", resumo: "Score do mapa × (1 + bónus). O meta do mapa manda; counters e sinergias afinam a ordem." },
  { id: "plprodigy", resumo: "Soma pesada de seis partes, cada uma de 0 a 100. O counter pesa mais do que a vitória." },
  { id: "metapick", resumo: "Força no mapa + counter × 2,5 + sinergia × 1,2, ignorando o ruído e com os 5 melhores counters." },
];

const BARRAS_PL: Array<{ chave: keyof PesosPLProdigy; nome: string; ajuda: string }> = [
  { chave: "uso", nome: "Uso", ajuda: "Quanto é escolhido neste mapa." },
  { chave: "encaixe", nome: "Encaixe", ajuda: "A função dele no modo do mapa e na tua equipa." },
  { chave: "vitoria", nome: "Vitória", ajuda: "Taxa de vitória neste mapa." },
  { chave: "sinergia", nome: "Sinergia", ajuda: "Com os aliados já escolhidos." },
  { chave: "counter", nome: "Counter", ajuda: "Contra os picks inimigos." },
  { chave: "ban", nome: "Ban", ajuda: "Counters dele que foram banidos. As fontes não publicam a taxa de ban de cada brawler." },
];

const BARRAS_META: Array<{ chave: keyof AjustesMetaPick; nome: string; ajuda: string }> = [
  { chave: "sinergia", nome: "Peso da sinergia", ajuda: "Multiplica a sinergia com os aliados." },
  { chave: "counter", nome: "Peso do counter", ajuda: "Multiplica os confrontos contra os picks inimigos." },
  { chave: "minSinergia", nome: "Sinergia mínima", ajuda: "Abaixo disto (em dezenas de pontos: 0,2 = 2 pp) a sinergia não conta." },
  { chave: "minCounter", nome: "Counter mínimo", ajuda: "Abaixo disto (0,2 = 2 pp) o confronto não conta." },
  { chave: "penalizacaoBan", nome: "Penalização de ban", ajuda: "Tira pontos pelos counters dele que o adversário ainda pode escolher." },
  { chave: "topCounters", nome: "Limite de top counters", ajuda: "Só os N melhores counters de cada inimigo recebem o bónus." },
];

function Barra({ id, nome, ajuda, valor, min, max, passo, sufixo, onChange }: { id: string; nome: string; ajuda: string; valor: number; min: number; max: number; passo: number; sufixo: string; onChange: (valor: number) => void }) {
  const casas = passo < 1 ? 2 : 0;
  return (
    <label className="motor-barra" htmlFor={id} title={ajuda}>
      <span className="motor-barra-topo">
        <b>{nome}</b>
        <output htmlFor={id}>{valor.toLocaleString("pt-PT", { minimumFractionDigits: casas, maximumFractionDigits: casas })}{sufixo}</output>
      </span>
      <input id={id} type="range" min={min} max={max} step={passo} value={valor} onChange={(evento) => onChange(Number(evento.target.value))} />
      <small>{ajuda}</small>
    </label>
  );
}

export function PainelDoMotor({ config, onChange }: { config: ConfigDoMotor; onChange: (config: ConfigDoMotor) => void }) {
  const somaDosPesos = Object.values(config.pl).reduce((total, valor) => total + valor, 0);
  return (
    <div className="motor-painel">
      <div className="motor-escolha" role="radiogroup" aria-label="Motor do Draft">
        {MOTORES.map((motor) => (
          <button
            key={motor.id}
            type="button"
            role="radio"
            aria-checked={config.motor === motor.id}
            className={`motor-cartao ${config.motor === motor.id ? "is-active" : ""}`}
            onClick={() => onChange({ ...config, motor: motor.id })}
          >
            <strong>{NOMES_DOS_MOTORES[motor.id]}</strong>
            <span>{motor.resumo}</span>
          </button>
        ))}
      </div>

      {config.motor === "plprodigy" ? (
        <section className="motor-barras" aria-label="Pesos do PL Prodigy">
          <p className="mesa-painel-nota">Soma dos pesos: <b>{somaDosPesos}%</b>{somaDosPesos !== 100 ? " — o Draft reparte-os na mesma proporção." : "."} Resultado de 0 a 100.</p>
          <div className="motor-grelha">
            {BARRAS_PL.map((barra) => (
              <Barra key={barra.chave} id={`motor-pl-${barra.chave}`} nome={barra.nome} ajuda={barra.ajuda} valor={config.pl[barra.chave]} min={LIMITES_PL_PRODIGY.min} max={LIMITES_PL_PRODIGY.max} passo={LIMITES_PL_PRODIGY.passo} sufixo="%" onChange={(valor) => onChange({ ...config, pl: { ...config.pl, [barra.chave]: valor } })} />
            ))}
          </div>
          <button type="button" className="motor-repor" onClick={() => onChange({ ...config, pl: PESOS_PL_PRODIGY })}>Repor os valores do PL Prodigy</button>
        </section>
      ) : null}

      {config.motor === "metapick" ? (
        <section className="motor-barras" aria-label="Ajustes do MetaPick">
          <p className="mesa-painel-nota">Pontos = força no mapa (0–100) + 10 × (counter × peso + sinergia × peso − risco × penalização). Os valores contam em dezenas de pontos percentuais: +10 pp = 1,0.</p>
          <div className="motor-grelha">
            {BARRAS_META.map((barra) => (
              <Barra key={barra.chave} id={`motor-meta-${barra.chave}`} nome={barra.nome} ajuda={barra.ajuda} valor={config.meta[barra.chave]} min={LIMITES_METAPICK[barra.chave].min} max={LIMITES_METAPICK[barra.chave].max} passo={LIMITES_METAPICK[barra.chave].passo} sufixo="" onChange={(valor) => onChange({ ...config, meta: { ...config.meta, [barra.chave]: valor } })} />
            ))}
          </div>
          <button type="button" className="motor-repor" onClick={() => onChange({ ...config, meta: AJUSTES_METAPICK })}>Repor os valores do MetaPick</button>
        </section>
      ) : null}

      <p className="mesa-painel-nota">
        Nem o PL Prodigy nem o MetaPick publicam a fórmula: estes motores seguem os nomes e os valores das definições deles, com os dados
        deste site — as fontes, ou as partidas da API com «API oficial» ligado. Os bans, a janela de counters e as regras de sequência do
        Draft continuam as mesmas.
      </p>
    </div>
  );
}
