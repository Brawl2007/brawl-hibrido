# Matriz de confrontos observados — metodologia

> **Fonte exclusiva:** registos de batalha devolvidos pela API oficial de Brawl Stars da Supercell. Nenhum valor de counter, Score Híbrido ou guia externo é usado para preencher esta matriz.

Cada registo elegível é uma partida `soloRanked` ou `teamRanked` 3v3 com duas equipas completas e resultado `victory` ou `defeat`. Para cada brawler de uma equipa, contabiliza-se uma observação contra cada brawler da equipa adversária. Se a equipa do primeiro brawler venceu, soma-se uma vitória; caso contrário, uma derrota.

Isto produz um **confronto por par dentro de uma partida 3v3**, e não a alegação de um duelo isolado de lane. A página deverá explicitar esta distinção em todos os estados de dados.

| Regra | Aplicação |
|---|---|
| Unidade de observação | Um par de brawlers em equipas opostas numa partida Ranked 3v3. |
| Segmentação | Mapa e modo quando disponíveis; a consulta “todos os mapas” agrega apenas observações reais. |
| Taxa exibida | `vitórias / (vitórias + derrotas) × 100`. |
| Limiar | Só exibir uma percentagem a partir de 30 observações. |
| Abaixo do limiar | Mostrar `amostra insuficiente`, contagem e W–L; não mostrar percentagem estimada. |
| Dados ausentes | Nenhuma inferência, inversão de counters ou preenchimento artificial. |

O gerador `server/scripts/generate-observed-matchups.mjs` remove tags de jogadores e exporta apenas as contagens agregadas necessárias à interface.

