# Motor da API — v177

Histórico da calibração anterior. A viabilidade por mapa está em [MOTOR_API_V178.md](MOTOR_API_V178.md).

A v177 corrige a atenuação excessiva dos confrontos e das sinergias da v176. A ingestão continua a ponderar elo, Poder 11 e meia-vida de 14 dias. A força individual mantém o prior hierárquico de modo e mapa. Os motores Híbrido, PL Prodigy e MetaPick mantêm as regras e os pesos da v176.

## Uma suavização por interação

O tamanho do prior de cada tipo de par é `clamp(3 * sqrt(mediana dos jogos ponderados), 4, 12)`. A posterior mistura os resultados observados com a expectativa das forças individuais e o residual das matrizes existentes do modo. Para evitar duplicação, o modo contribui com 35% apenas da amostra fora do mapa. A proporção das matrizes é `K / (N + K)` e tende a zero à medida que a API acumula evidência. Não há corte mínimo de seis jogos nem outro multiplicador de volume. A zona de ruído é de 0,01.

Counters têm peso 1,35; sinergias, 1. A trava anti-carona reduz para 30% o bônus positivo de candidatos com vitória individual suavizada abaixo de 46%. Trios usam um residual sobre as forças individuais e as três duplas, com um único prior de pelo menos dez jogos.

## Uso, riscos e restrições

O uso é dividido pela média positiva do próprio mapa, mantendo o resultado quando todos os valores são convertidos entre fração, presença e porcentagem. A referência permanece estável ao pesquisar, filtrar, escolher ou banir candidatos. Sem dados de uso, a razão é neutra.

Risco de resposta, custo tático e ajuste de uso são centrados na média dos candidatos viáveis. Sem evidência diferenciadora, a estimativa permanece em 50%. Evidência positiva passa por saturação suave de 72%; essa faixa é uma escolha do modelo, ainda sem validação preditiva em partidas futuras. Os sete fatores continuam a somar exatamente a estimativa, e seus impactos percentuais partem de 50%.

Hard-counters têm custo quadrático e veto. Nichos ficam abaixo dos candidatos viáveis na abertura e só são liberados a partir do quarto pick com counter positivo. O fecho exige Mid verdadeiro, anti-tanque e, em Roubo, dano ao cofre. A simulação respeita o próximo turno inimigo na sequência 1-2-2-1; a pool pessoal não limita as opções do adversário.

O pareamento procura simultaneamente posições e confrontos, ancorando o Mid verdadeiro de ambas as equipes no centro. As três rotas mostram vantagem estimada de resultados de equipes; o battlelog não registra duelos individuais de lane.

## Interface e verificação

Ao ligar a API, o Draft abre em “Melhores agora”. A ordem “Melhores no mapa” continua disponível. Cartões, radares e visão inimiga usam os mesmos resultados do motor. Fatores aparecem em pontos percentuais com nomes de jogo; impactos que arredondariam para zero são ocultados. Bans podem proteger o primeiro pick pretendido, inclusive contra um counter clássico sem partidas observadas no mapa.

Auditoria de uma resposta pública de 1 dia para o mapa `15000025`: 1.096 partidas, 2.816 confrontos. Usando a mesma amostra e as mesmas forças individuais, o motor v176 zerou 2.114 residuais; o v177, com matrizes de apoio, zerou 60. As listas mudaram ao acrescentar Rico inimigo ou Gus aliado. A amostra serve para verificar sensibilidade e volume; não mede acurácia preditiva.

A regra de incrementar `shared/version.ts` em cada publicação fica registrada em `AGENTS.md`.

```sh
COREPACK_HOME=/workspace/.cache/corepack corepack pnpm check
COREPACK_HOME=/workspace/.cache/corepack corepack pnpm test --maxWorkers=2 --minWorkers=1
DISABLE_MANUS_RUNTIME=1 COREPACK_HOME=/workspace/.cache/corepack corepack pnpm build
```
