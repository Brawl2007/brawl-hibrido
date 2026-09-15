# Auditoria de fontes de counters — 6 de Setembro de 2026

A sincronização manual executada através do mesmo pipeline do Heartbeat terminou com sucesso e gravou a versão `counter-1788664132636`, com 5.771 relações persistidas no snapshot principal.

| Fonte | Tratamento actual | Cobertura observada | Estado |
|---|---|---:|---|
| PL Prodigy | Snapshot literal importado, preservando `targets` e `counteredBy` publicados | 105 entradas importadas | Incluída sem inferência de direcção |
| BrawlScope | Snapshot literal reconciliado, preservando `counteredBy` e `targets` | 105 entradas legíveis no conjunto auditado; 106 nomes únicos no ficheiro de pesquisa | Incluída sem inverter listas, com adaptação explícita para Ruffs |
| Brawl Calculator | Recolha externa no ciclo de sincronização | A página pública anuncia guias completas para 105 brawlers | Consultada no refresh |
| Brawl Planet | Recolha externa por índice e páginas individuais | O parser exige pelo menos 100 fichas válidas antes de aceitar a leitura | Consultada no refresh |

A direcção das relações é normalizada como `attacker -> defender`: `targets` produz counter e `counteredBy` produz counterado. O pipeline mantém a última snapshot válida quando uma fonte dinâmica falha; as fontes literais não são removidas por uma leitura dinâmica incompleta. Após a persistência, o snapshot é transmitido pelo canal realtime aos clientes activos e o frontend mantém polling de recuperação a cada cinco segundos.

As páginas públicas consultadas foram [PL Prodigy Guides](https://powerleagueprodigy.com/guides), [BrawlScope — 8-Bit](https://brawlscope.com/counters/8-bit), [Brawl Calculator](https://brawlcalculator.com/) e [Brawl Planet — Meg](https://www.brawlplanet.com/brawlers/meg). O pipeline não inventa relações para brawlers ou fontes que não publiquem dados verificáveis.
