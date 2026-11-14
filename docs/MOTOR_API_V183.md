# Distribuição de pontos configurável — v183

Com «API oficial» ligada, o motor passa a ler **toda** a sua distribuição de pontos de uma configuração (`shared/configDoMotorApi.ts`), editável no painel «Regras %» do Draft. Os valores de fábrica são os da v181: sem mexer em nada o ranking é o mesmo (`server/configDoMotorApi.test.ts` compara o motor com e sem a configuração, e as suítes da v177–v181 passam sem alterações).

## Distribuição por pick

Cada pick reparte 100% entre **Vitória** e **Uso** (a força do mapa) e **Counter** e **Sinergia** (o que o draft em curso acrescenta). Mudar um valor reequilibra os outros três na proporção que já tinham. De fábrica (calculada das regras da v181):

| Pick | Vitória | Uso | Counter | Sinergia |
|---|---|---|---|---|
| 1 | 70,0 | 30,0 | 0 | 0 |
| 2 | 65,7 | 21,9 | 7,6 | 4,8 |
| 3 | 66,6 | 16,6 | 9,9 | 6,9 |
| 4 | 66,0 | 11,6 | 14,3 | 8,2 |
| 5 | 63,7 | 7,1 | 18,8 | 10,4 |
| 6 | 60,0 | 3,2 | 26,3 | 10,5 |

Quem já tinha pesos por pick e a influência dos bans guardados (v170–v182) parte deles: a primeira configuração é derivada dessas preferências. Cada pick tem ainda o seu **teto dos bônus** (múltiplo da força do mapa).

## Bônus e desbônus

Cada um tem uma **força** (0 = desligado, 1 = fábrica, até 3):

- **Counter** (bônus quando ele ganha de um inimigo já escolhido) e **Counterado** (desbônus quando um inimigo já escolhido ganha dele) — separados; o cartão mostra as duas linhas.
- **Sinergia** e **Anti-sinergia**, separadas da mesma forma.
- **Hard-counter** (força, fator, acréscimo do veto e se a escolha fica «não recomendada»), **risco de counter futuro** (às cegas e melhor resposta), **equilíbrio da equipa** (força geral e por parte: Mid/lane, mesma classe, paredes, anti-tanque, cofre).
- **Bans**: caminho livre, função escassa, influência, tetos; e os bans sugeridos (expoente da presença, peso da ameaça).
- Novos, desligados de fábrica: **Counter já coberto** (um aliado já countera aquele inimigo: o bônus repetido cai X%, salvo se responde a dois inimigos) e **Pressão por aliado** (o inimigo que o countera também countera um aliado: o desbônus agrava X).
- **Quem pode ser recomendado**: tamanho e limites do grupo viável, limite de nicho, e se nichos e fora do grupo são bloqueados ou só penalizados.
- **Confiança**: jogos imaginários do counter, da dupla e do trio; teto dos bônus; tetos da proteção e da resposta à composição.

Presets: Padrão (v181), Counter forte, Mapa primeiro; qualquer alteração passa a «Personalizado». A configuração fica no navegador (`brawl-hibrido:config-motor-api:v1`).

## O que não mudou

O painel das regras das fontes (Híbrido, PL Prodigy, MetaPick) é o mesmo quando a API está desligada. Ficam fixos: o peso de 35% da evidência do modo, a mistura Vitória/Uso em log-odds, a reserva mecânica (15 jogos) e a zona morta de ruído. As percentagens continuam a ser estimativas do modelo, sem validação preditiva.
