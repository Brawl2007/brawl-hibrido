# Migrações antigas, postas de lado

Estes ficheiros estavam na pasta `drizzle/` e eram a causa de
`drizzle-kit migrate` falhar com exit code 1 — sem criar tabela nenhuma.

## O que estava mal

A pasta tinha **três migrações iniciais diferentes**:

```
0000_gigantic_ted_forrester.sql
0000_overconfident_shinobi_shaw.sql
0000_warm_mojo.sql
```

Três ficheiros a dizer "cria a base de dados do zero", cada um de uma
reinicialização diferente do projeto. E o diário (`meta/_journal.json`) apontava
para um quarto nome que **não existia na pasta**:

```json
{ "idx": 0, "tag": "0000_typical_avengers" }
```

Faltavam também os ficheiros de fotografia (`meta/0000_snapshot.json` e
seguintes), que são o que permite ao `drizzle-kit generate` comparar o estado
anterior com o novo. Sem eles, cada `generate` produz uma migração que tenta
criar tudo outra vez — foi isso que gerou o `0001_square_sabra.sql`.

Resumindo: o histórico de migrações estava irrecuperável. Não havia nenhuma
sequência de ficheiros que descrevesse corretamente o caminho até ao esquema
atual.

## O que passou a ser feito

`pnpm db:push` deixou de usar migrações. Passa a correr `drizzle-kit push`, que
compara o ficheiro `drizzle/schema.ts` **diretamente com a base de dados** e
aplica a diferença. Não precisa de diário, nem de fotografias, nem de histórico.

Para um projeto com uma só base de dados e um só dono, é a escolha certa: o
esquema em código é a verdade, e a base de dados passa a igualá-lo.

## Estes ficheiros servem para alguma coisa?

Só como leitura, se algum dia quiseres ver o que existiu. Não são aplicados por
nada. Podem ser apagados sem consequência.

Se um dia o projeto precisar de migrações a sério — mais do que um ambiente,
mais do que um responsável — o caminho é começar um histórico novo a partir do
esquema atual, com `drizzle-kit generate` numa pasta limpa, e nunca mais mexer
nos ficheiros gerados à mão.
