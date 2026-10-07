# v166 — cálculos do Draft e dados da API

Selecionar PL Prodigy ou MetaPick passa a mostrar a ordem dos pontos do motor
escolhido. Os cartões usam os fatores desse motor, distinguem a diferença
medida em pontos percentuais (pp), a soma ponderada e os pontos finais.

## Correções

- Preset Masters+ do PL atualizado: uso 4%, vitória 20%, counter 40%,
  encaixe 13%, sinergia 10%, ban 13%. Pesos personalizados já guardados no
  navegador não são sobrescritos; o botão Masters+ aplica o novo preset.
- No modelo PL, bans removem counters identificados na fonte ativa, incluindo
  a API. Não dependem das janelas Top 25/30 do Híbrido. A contribuição de ban
  fica a zero quando os três inimigos estão revelados.
- Counter, sinergia e ban sem sinal já não recebem a contribuição neutra
  artificial que resultava de normalizar uma lista só de zeros.
- O risco do modelo Meta usa a perda do candidato contra os adversários
  ainda disponíveis no catálogo do mapa. Usa a perspetiva do candidato;
  a vantagem do adversário tem outra taxa habitual e não é o seu inverso.
- Com a API ativa, perfis sem confrontos observados não herdam relações das
  fontes externas. Durante a carga inicial não se usa uma base externa.
- Ao mudar mapa, período ou rank, a consulta de confrontos/sinergias não
  apresenta os dados da chave anterior como se fossem do novo mapa.
- O motor Híbrido conserva as suas regras próprias. Os presets dos motores
  não alteram o período/rank de recolha nem o agendamento.

## O que foi confirmado nos sites e o que é uma estimativa

Verificação da interface pública em 29/09/2026:

| Observação | Resultado |
|---|---|
| [PL Prodigy](https://powerleagueprodigy.com/plprodigy), Masters+ | 4 / 20 / 40 / 13 / 10 / 13 na ordem uso, vitória, counter, encaixe, sinergia, ban |
| PL, Diamond and Below | 9 / 27 / 32 / 9 / 14 / 9 |
| PL, ajuda de Ban Rate | Bónus quando bans removem counters ao candidato; apenas enquanto a equipa inimiga não está toda revelada |
| [MetaPick](https://metapick-ai.com/draft-tool), ajustes visíveis | Sinergia 1,2; counter 2,5; mínimos 0,2; penalização 0,5; top counters 5 |
| MetaPick, ajuda de Top Counter Limit | Descreve o número de opções apresentado; não confirma a regra local de bónus para os N melhores por inimigo |

As fórmulas completas não foram confirmadas. Min-max por candidatos, a
logística do PL, a unidade 0,2 = 2 pp e o risco/top N do modelo Meta são
adaptações locais. A curva logística conservada aproxima dez exemplos da
investigação anterior; esses exemplos não provam uma fórmula privada.
Pesos iguais com amostras e modelos diferentes não garantem o mesmo resultado.
Os pontos de recomendação não são uma probabilidade de vitória.

## Recolha sem navegador

Teste realizado com a aba do Brawl Híbrido desta sessão fechada. A tarefa
existente do GitHub foi executada novamente e respondeu em 29/09/2026 às
23:14:42 UTC: 120 jogadores consultados, 282 partidas novas guardadas e 5.076
observações de pares. A bola de neve leu 60 jogadores da lista e 60 dos
rankings, acrescentando 81 à lista.

[Registo da execução, tentativa 3](https://github.com/Brawl2007/brawl-hibrido/actions/runs/36638838334).
A recolha independe de manter o site aberto. O cron está configurado para
15 minutos, mas as duas execuções automáticas encontradas nessa verificação
não demonstram essa cadência: ocorreram com cerca de quatro horas de intervalo
e ambas saltaram a recolha por estar dentro do intervalo mínimo. Um job verde
com `saltada:true` não significa que guardou partidas. O teste acima confirma
a recolha através do GitHub, não a precisão do horário automático.
