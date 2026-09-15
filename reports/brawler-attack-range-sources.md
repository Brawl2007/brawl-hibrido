# Fontes de Alcance de Ataque Principal

Esta nota preserva as fontes usadas pelo importador de alcance do Draft.

| Fonte | URL | Uso no projeto |
|---|---|---|
| Brawl Stars Stats | https://brawlstars-stats.azurewebsites.net/Brawlers | Tabela individual de `Attack Range` para o catálogo de brawlers. A importação usa o maior valor numérico publicado no campo de ataque principal e aplica o limiar estrito `> 4`. |
| Brawl Planet — Attack Range | https://www.brawlplanet.com/tier-list/attack_range | Validação complementar dos tiers de alcance: C começa em 5,0 blocos; A e S representam alcance ainda superior. |
| NoFF — Bolt | https://www.noff.gg/brawl-stars/brawler/bolt | Consulta complementar para Bolt, cujo campo de alcance está ausente na tabela primária; a página descreve o alcance como `Short`. |

O bónus de abertura é concedido apenas quando a fonte permite confirmar que o ataque principal ultrapassa quatro blocos. Não se infere alcance a partir de função, tier ou counter.

## Consulta complementar de classe

- URL: https://api.brawlapi.com/v1/brawlers
- Consultado em 2026-08-15 para procurar uma classificação estruturada de Lançador.
- Limitação: o endpoint expõe o campo `class`, mas apresenta `Unknown` em entradas recentes; por isso não é usado isoladamente para decidir a exceção de Lançadores.

## Exceção de Lançadores (Artillery)

- Fonte de definição oficial: https://support.supercell.com/brawl-stars/en/articles/brawler-classes.html — a classe **Artillery** cobre brawlers que lançam projéteis sobre obstáculos.
- A exclusão usa uma lista auditada: Barley, Dynamike, Grom, Juju, Larry & Lawrie, Sprout e Tick. Estes brawlers não recebem o bónus de abertura de +7%, mesmo quando o alcance principal ultrapassa quatro blocos.
