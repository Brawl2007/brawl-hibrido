# Auditoria de dados para matriz 1v1 — 15 de agosto de 2026

## Fontes públicas verificadas na descoberta

| Fonte | Cobertura identificada | Limitação para uma matriz 105 × 105 por mapa |
|---|---|---|
| [Brawlify](https://brawlify.com/) | Estatísticas de meta, eventos e win rates atualizados. | A descoberta não demonstrou percentagens observadas para cada par de brawlers no mesmo mapa. |
| [Noff.gg — Matchup](https://www.noff.gg/brawl-stars/brawler-matchup) | Ferramenta de comparação entre dois ou três brawlers e atributos de jogo. | Não foi identificada uma base de vitórias observadas por confronto direto para todos os pares e mapas. |
| [Noff.gg — mapa Block and Counter](https://www.noff.gg/brawl-stars/map/block-and-counter) | Win e pick rates por brawler no mapa, baseados em batalhas de jogadores Top 200. | São métricas individuais por mapa; não representam resultados diretos Brawler A versus Brawler B. |
| [Brawl Time Ninja](https://brawltime.ninja/) | Tier lists, win rates e mapas atualizados. | A descoberta não demonstrou matchup pairwise observável por brawler e mapa. |
| [Brawl Stars Logs & Metadata 2023](https://arxiv.org/abs/2408.17180) | O artigo cita um dataset histórico de logs e metadados usado para estudar relações de counter em modos de equipa. | É histórico, não cobre necessariamente os 105 brawlers nem a rotação Ranked atual; seria necessário obter e validar o dataset antes de o usar. |

## Conclusão provisória

Até esta etapa, não foi encontrada uma fonte pública que prove disponibilizar **percentagens observadas de vitória 1v1 para todos os 105 × 105 pares em cada um dos 27 mapas Ranked atuais**. Os dados existentes no projeto fornecem Score Híbrido individual por mapa e relações de counter literais extraídas dos guias Power League Prodigy, mas não percentagens de vitória por duelo.

Qualquer matriz construída agora deve ser designada explicitamente como **estimativa de matchup**. Valores apresentados como resultados reais exigem logs de partidas suficientemente detalhados, com mapa, composição, vencedor e amostra de confrontos, além de metodologia de controlo de composição e seleção de mapa.

## Verificação direta de páginas — 15 de agosto de 2026

> A página inicial do Brawlify apresenta win rates e melhores picks por evento, mas não revelou uma tabela ou API pública de resultados Brawler A versus Brawler B por mapa durante a inspeção.

> A página “Brawler Matchup” do Noff.gg descreve uma comparação de atributos, win rate e pick rate individuais para até três brawlers. A própria descrição indica que serve para dar uma ideia geral baseada em estatísticas de base; não afirma oferecer percentagens observadas de vitória em duelo direto nem segmentação por mapa.
