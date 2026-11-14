# Partidas compactas — v182

Abrir o Draft com «API oficial» ligada percorria o histórico inteiro (1,1 milhão de partidas, mais de 200 consultas) e refazia todas as contas em memória, duas vezes. A v182 guarda as partidas num formato compacto e serve o Draft com um resumo só do mapa escolhido e do modo dele.

## O que mudou

- **Pacotes** (`observed_battle_packs`, `shared/partidasCompactas.ts`): cada partida é uma lista curta de números (~30 bytes), agrupada por mapa, modo e dia (UTC). Os nomes dos brawlers vão uma vez por pacote. A recolha compara com o que já está no mesmo mapa/modo/dia para não repetir partidas e junta as partes de um dia quando passam de seis; os dias fechados são juntados a cada volta.
- **Resumos** (`server/partidasResumo.ts`): `observedMatches.draft` (um mapa + o apoio do modo, trios com menos de 3 jogos ficam de fora) e `observedMatches.mapas` (contagens por brawler de todos os mapas) substituem as duas chamadas gerais do Draft. O último resumo calculado fica em memória e na tabela `observed_summary_cache`; quem pede recebe-o de imediato e o recálculo corre em segundo plano (validade de 10 minutos, serve até 12 h).
- **Migração sem perda** (`server/migracaoCompacta.ts`), automática e volta a volta:
  1. `legado` → `a_migrar` na primeira volta depois da publicação. A recolha continua a gravar só nas tabelas antigas; o histórico antigo deixa de expirar durante a cópia.
  2. No fim de cada volta copia até 25 s de histórico (lotes de 4 000, por ordem de id). Um lote interrompido a meio é refeito com deduplicação.
  3. Quando a cópia alcança o fim, compara a contagem (partidas desde o dia de corte no histórico antigo menos as ignoradas por equipas estragadas = partidas nos pacotes). Só se forem iguais passa a `compacto`; se não, fica em `a_migrar` e o painel mostra a diferença.
  4. Em `compacto`, a recolha grava só nos pacotes (já não faz as ~18 escritas de agregados por partida) e expira os pacotes com mais de 31 dias, uma vez por dia.
- Enquanto está em `a_migrar`, Draft e página Partidas continuam a ler o histórico antigo: nada muda para quem usa. O estado aparece em «Estado da recolha» (Draft e Partidas) e em `observedMatches.status.armazenamento`.
- O aviso de confronto do Draft (`observedMatches.matchup`) passa a sair do resumo do mapa depois da migração, porque os agregados antigos deixam de crescer.

## Não alterado

As tabelas antigas (`observed_battles`, `observed_battle_ranks`, `observed_battle_quality`, `observed_matchup_aggregates`) ficam intactas. Apagá-las para libertar espaço é um passo à parte, só depois de confirmar o funcionamento em `compacto`.

## Validação

`server/partidasCompactas.test.ts`, `pacotesDePartidas.test.ts`, `migracaoCompacta.test.ts`, `resumoDosPacotes.test.ts` e `recolhaCompacta.test.ts` cobrem o formato, a deduplicação e a junção de partes, a migração (retomada, conferência, equipas estragadas), os resumos por mapa/modo/rank/período e a recolha nos três estados. Os tempos esperados (Draft com API em 1–2 s) são uma estimativa a confirmar em produção.
