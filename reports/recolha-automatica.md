# Recolha automática na Vercel

## O que estava parado

Desde a mudança para a Vercel, **nenhuma fonte se atualizava sozinha**: TopBrawl,
Brawl Planet, Brawl Calculator, PL Prodigy e as batalhas observadas. O que se via
era o catálogo do repositório mais o que fosse importado à mão.

Havia dois caminhos e nenhum funcionava:

| Caminho | Porque não funcionava |
|---|---|
| `startLiveSync()` — temporizadores | Monta `setInterval` dentro do processo. Na Vercel não há processo de pé, há uma função que acorda e volta a dormir: o temporizador nunca dispara |
| `/api/scheduled/*` | Pedem autenticação do SDK da plataforma anterior, e ninguém os chama |

## O que passa a acontecer

O cron da Vercel chama `GET /api/cron/sync` uma vez por dia, às 05:00 UTC.

A rota **espera** pela recolha antes de responder. Isto é o contrário do que o
resto do site faz — lá um pedido arranca o trabalho e responde já —, e é
deliberado: numa função, a resposta congela o processo, por isso trabalho
deixado para trás nunca termina.

## É preciso definir o CRON_SECRET

Sem ele a rota responde **503** e não recolhe nada. É o que impede qualquer
pessoa de mandar o site recolher à vontade.

Na Vercel: **Settings → Environment Variables** → `CRON_SECRET` com um valor
longo e aleatório. O cron da Vercel envia-o sozinho no cabeçalho `Authorization`.

A comparação é feita em tempo constante, para o tempo de resposta não deixar
adivinhar o segredo caractere a caractere.

## Porque os counters ficam de fora

Só a rotação Ranked corre sempre. São cerca de vinte páginas com duas em
paralelo — cabe folgadamente no tempo de uma função.

Uma recolha completa de counters são centenas de páginas espaçadas no tempo:
**minutos**. Não cabe, e cortada a meio não grava nada, porque a função é morta
sem aviso. Fica atrás de um sinal explícito:

- `GET /api/cron/sync?counters=1`
- ou `CRON_SYNC_COUNTERS=true`

Só faz sentido com um plano que dê tempo suficiente à função.

Isto não afeta o BrawlScope, que responde 403 ao servidor e já era importado à
mão pela extensão.

## Frequência

No plano **Hobby** o cron dispara uma vez por dia. Num plano com mais folga
muda-se uma linha no `vercel.json`:

```json
"crons": [{ "path": "/api/cron/sync", "schedule": "0 * * * *" }]
```

Custo de uma passagem diária: **1 invocação por dia**. Para comparar, um único
carregamento do site gasta mais do que isso.

## Variáveis

| Variável | Para quê | Sem ela |
|---|---|---|
| `CRON_SECRET` | autorizar o cron | a rota responde 503 e nada recolhe |
| `CRON_SYNC_COUNTERS` | incluir counters | só corre a rotação Ranked |
| `CRON_SYNC_BUDGET_MS` | orçamento de tempo (por omissão 240000) | 240 segundos, com margem para os 300 da plataforma |

## Uma armadilha do `vercel.json`, paga com horas

Este projeto usa `services` no `vercel.json`. Nessa forma, a propriedade
`functions` — a que define `maxDuration` — vive **dentro de cada serviço**, não
no topo do ficheiro.

Pô-la no topo invalida a configuração inteira. E a Vercel falha **antes de criar
o deploy**: o painel mostra "Deployment failed", a lista de deploys fica vazia
como se nada tivesse sido tentado, e o site continua a servir a versão anterior
sem nada indicar que algo mudou.

Foi exatamente o que aconteceu, e o rasto apontava para todo o lado menos para o
ficheiro: parecia projeto em pausa, parecia ligação ao GitHub partida, parecia
exigência de commits assinados.

Por isso o `maxDuration` **não** é declarado aqui. O tempo máximo é o que a
plataforma der, e quem precisar de apertar o orçamento da recolha usa
`CRON_SYNC_BUDGET_MS`. Há um teste que recusa `functions` no topo.
