# Recomendações da API por mapa — v178

Histórico da v178. A calibração por pick e os efeitos dos bans estão em [MOTOR_API_V179.md](MOTOR_API_V179.md).

A v178 impede que resultados de outro terreno, falta de confrontos ou bônus de composição promovam escolhas incompatíveis com o mapa. A ingestão e a suavização única dos pares da v177 continuam ativas.

## Referência e força do mapa

O cliente preserva as linhas originais do mapa antes de substituir as taxas pelas da API. As referências incluem vitória, uso, score e compatibilidade com o terreno. A ficha do servidor recebe as referências da mesma snapshot. Nomes são normalizados e as referências abrangem o catálogo completo, incluindo quem não apareceu nos battlelogs, mantendo as médias iguais entre ficha e Draft.

A força individual usa `(vitórias do mapa + 30 * prior do mapa) / (jogos do mapa + 30)`. O modo não entra nesse prior. A vitória publicada do mapa é a âncora principal; sem taxa publicada, usa-se o score próprio do mapa. Sem essas referências, uma amostra própria com pelo menos 30 jogos pode sustentar a âncora; abaixo disso o prior é conservador, 43%. Pouco uso relativo limita o prior a 40–43%. Incompatibilidade de terreno também limita o prior. Ausência de presença e score não permite promover uma taxa publicada isolada.

O uso observado e o publicado são convertidos separadamente em razões à média positiva do próprio mapa, antes de combinados. Não se misturam unidades. A contribuição da amostra cresce com o volume do mapa, até 80%. Bans, filtros e pool pessoal não redefinem a média nem o Top 25.

O índice de adequação combina 70% de vitória normalizada e 30% de uso normalizado, multiplicado pela adequação ao terreno. A força base inclui a vitória ajustada e esse índice. Na abertura, os bônus positivos somados têm teto de `base positiva * 3/7 * adequação`; a base representa pelo menos 70% da evidência positiva. No fechamento, o teto aumenta, continuando multiplicado pela adequação. Penalidades e vetos permanecem ativos. Não há compressão `tanh`, nem limite artificial de 72% sobre a probabilidade exibida.

## Terreno, risco e pool viável

A grelha de `terrenoDoMapa.ts`, com suas correções humanas/IA, determina abertura, paredes e mato. Para os sete mapas citados no anexo existe um perfil geométrico de recurso. Uma classificação automática apenas por cor é combinada conservadoramente com esse perfil; uma grelha corrigida ou rotulada por IA prevalece. Sem geometria conhecida, o desempenho próprio do mapa continua sendo necessário. Alcances vêm dos catálogos existentes.

O grupo de abertura cruza o Top 25 de adequação com o Top 25 de presença (preservando empates de uso) e exige adequação ao terreno de pelo menos 0,6, razão de uso de pelo menos 0,35 e vitória ajustada de pelo menos 44%. Fora desse conjunto, só se libera uma escolha a partir do quarto pick com dois counters fortes (residual de pelo menos 0,22, apoiado por amostra do mapa ou matriz), adequação de pelo menos 0,6 e vitória ajustada de pelo menos 40%. Um único counter ou sinergia não libera um nicho.

Confrontos desconhecidos recebem custo de incerteza; não equivalem a risco zero. Bônus centrados de segurança, composição e uso exigem pelo menos 12 jogos próprios, uso relativo de pelo menos 0,7 e compatibilidade de terreno. A simulação futura considera ameaças do conjunto viável do mapa. Essas escolhas são regras conservadoras do recomendador, não limites de confiança estatísticos.

A lista principal mostra escolhas viáveis. A pesquisa ainda permite encontrar e escolher manualmente um candidato bloqueado, com o motivo visível. A visão inimiga, lanes e fichas usam a mesma referência. Estimativas continuam a depender da qualidade e da cobertura das fontes, sem garantia do resultado da partida.

## Validação

Testes de regressão cobrem os três mapas abertos na abertura; os quatro fechados no primeiro e sexto pick; subida de counters do mesmo mapa ao Top 3 contra um, dois e três inimigos; ausência de prêmio por dados faltantes; estabilidade após bans/pool pessoal; dois counters para liberar nichos; precedência da grelha; prior consistente entre ficha e Draft; e ausência de compressão dos fatores.

Auditoria adicional com a snapshot pública e 949 partidas de Bridge Too Far: os oito primeiros picks ficaram sem tanques, lançadores ou assassinos. A inclusão de Colt e Colette inimigos alterou a lista, mantendo escolhas compatíveis com o mapa. Essa conferência verifica sensibilidade e restrições; não mede acurácia preditiva.
