# Calibração nas partidas reais e chance da equipa — v185

Até aqui as percentagens do Draft com a API eram estimativas do modelo, com pesos escolhidos à mão e nada que as comparasse com o resultado das partidas. A v185 mede, nas partidas guardadas, quanto cada parte realmente ajuda a prever quem ganha.

## O que se mede

Para cada partida (duas equipas de três), com as funções do próprio motor (`calcularWinRateBayesiano`, `calcularDeltaCounterPuro`, `calcularDeltaSinergiaPura`):

- **força**: soma da força (logit da vitória) dos brawlers da equipa menos a da outra;
- **counter**: soma, nos nove confrontos, do que cada um ganha além do esperado;
- **sinergia**: as três duplas da equipa menos as três da outra.

Ajusta-se `P(vence) = σ(wForça·força + wCounter·counter + wSinergia·sinergia)` por regressão logística (sem termo independente: a equipa de «cima» é escolhida ao acaso por partida).

## Sem vazamento

- As estatísticas vêm só das partidas de **treino** (dias 8–30).
- Para ajustar os pesos retira-se das estatísticas **a própria partida** (deixar-um-de-fora). Num ensaio com dados sem qualquer sinal, desligar isto fazia o peso do counter sair 2,0; com isto sai ~0. O teste `server/calibracaoDoMotorApi.test.ts` falha se o vazamento voltar.
- A qualidade mede-se nos **últimos 7 dias** (validação), que as estatísticas nunca viram: perda logarítmica, acerto e uma curva previsto/observado em dez faixas. Compara-se também com o acaso (ln 2) e com um modelo só com a força dos brawlers, para ver o que counters e sinergias acrescentam.
- Com volumes grandes, as estatísticas usam uma amostra repetível (≤ 1,5 milhões de partidas); a validação nunca é amostrada.

## Aprovação e uso

A calibração só é **aprovada** com pelo menos 20 000 partidas de validação e um ganho real sobre o acaso (≥ 0,002 de perda). Corre uma vez por dia no cron diário (depois das partidas passarem ao formato compacto), guarda o resultado em `app_settings` (`calibracaoDoMotorApi`) e `observedMatches.calibracao` devolve-o.

- **Painel «Regras %»**: mostra o acerto, as perdas e os pesos medidos (1 = a conta já está calibrada). Se aprovada, o botão **Aplicar calibração** cria uma configuração com a força de counter e de sinergia (e dos seus desbônus) multiplicada pelos pesos medidos, entre 0,25× e 4×. É uma escolha sua: não muda nada sozinho.
- **Chance da equipa** (`calcularChanceDaEquipa`): no cartão de análise, com os picks já feitos e os pesos medidos. Um lugar por escolher conta como o brawler médio, por isso começa em 50%. **Só aparece com a calibração aprovada** — sem ela não se mostra um número inventado.

## Limites

Estima-se P(equipa vence) a partir de picks e resultados; não vê o jogo (posição, execução, mudanças de equilíbrio). Os pesos descrevem o passado recente e podem mudar de dia para dia. Calibrar não torna as recomendações por brawler (cartões) em probabilidades medidas: corrige a força relativa de counters e sinergias.
