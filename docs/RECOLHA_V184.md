# Recolha de mais partidas — v184

Antes: 120 jogadores por volta (60 da lista, 60 dos rankings de troféus), ~60 mil partidas novas por dia. A lista tem ~50 mil jogadores e cada um era lido uma vez a cada ~8 dias, enquanto a API só guarda as últimas 25 partidas de cada.

## O que mudou

- **Uma leitura falhada deixa de ser «não jogou Ranked».** `fetchOfficialBattleLog` informa o motivo (código HTTP, `rede` ou `tempo`). Um jogador cuja leitura falhou não é gravado como leitura vazia (que adiava a próxima até 3 dias): volta a ser lido na volta seguinte. Um 404 tira o jogador da lista. Se nenhuma leitura de uma volta teve resposta, a volta falha com um diagnóstico claro (403: IP/chave; 401: chave; 429: limite; 5xx/rede) em vez de «sucesso» com zero partidas.
- **Mais jogadores, ritmo com freio.** A recolha começa em 240 jogadores por volta e 10 pedidos em simultâneo (`server/ritmoDaRecolha.ts`). Cada volta limpa sobe 60 jogadores (e 1 pedido) até 720/12; com três ou mais respostas 429, ou 2% dos pedidos, corta para metade. Se o tempo de leitura (60 s) acabar antes de ler todos, pede menos. O estado fica em `app_settings` (`ritmoDaRecolha`). **O ritmo só sobe depois da migração para os pacotes** (v182): enquanto as partidas ainda se gravam nas tabelas antigas, mais leituras enchiam a base mais depressa.
- **Lugares.** A lista leva todos os lugares a que tem direito (os jogadores à espera), os rankings guardam pelo menos 12% para descobrir gente nova — antes eram sempre 50/50.
- **Visibilidade.** `observedMatches.status.recolha` e «Estado da recolha» (Draft e Partidas) mostram jogadores lidos e pedidos, falhas por motivo, partidas novas, próximo ritmo e a fila (quantos esperam leitura).

## Estimativa, a confirmar em produção

Com 720 jogadores por volta e a lista a ser lida quase toda, as leituras da lista passam de ~5,8 mil para dezenas de milhares por dia. Se a API aguentar o ritmo máximo, o resultado esperado é uma ordem de grandeza mais de partidas novas por dia; o limite de pedidos da Supercell não é público, por isso o freio automático é que o descobre.

## Não alterado

A cadência de 15 minutos, o agendador e a partilha de janelas. A chave e o caminho (direto ou proxy da RoyaleAPI) são os de sempre.
