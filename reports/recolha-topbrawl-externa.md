# Recolha do TopBrawl fora do alojamento

## O problema, provado

O `topbrawl.com` responde **403 Forbidden** aos pedidos vindos do alojamento.

```
[RankedSync] Índice do TopBrawl inacessível: 403 Forbidden
```

Não é o pedido que incomoda. A prova está na sequência:

| | Resultado |
|---|---|
| Plataforma anterior, User-Agent que se anunciava como robot | ✅ funcionava |
| Alojamento novo, o mesmo User-Agent | ❌ 403 |
| Alojamento novo, cabeçalhos de navegador completos | ❌ 403 |

Se só o local mudou e só um leva 403, **é a origem da rede**. Gamas de centro de
dados ficam de fora, e o alojamento novo está nelas. Nenhum cabeçalho resolve
isso — tentar foi o que o confirmou.

## A solução

A recolha corre onde a porta está aberta e envia o resultado para o site.

```
GitHub Actions  ──lê as 134 páginas──>  topbrawl.com
       │
       └──POST /api/ranked/import──>  site  ──>  ranked_map_captures
                                                        │
                                       a sincronização lê daqui primeiro
```

É o mesmo desenho que o BrawlScope já obrigou a adotar, com uma diferença que
interessa a quem usa o site: **não é preciso ninguém fazer nada**. Quem lê as
páginas é uma tarefa agendada, não uma pessoa.

## O que é preciso configurar

Dois segredos em **GitHub → Settings → Secrets and variables → Actions**:

| Segredo | Valor |
|---|---|
| `SITE_URL` | `https://brawl-hibrido.vercel.app` |
| `RANKED_IMPORT_SECRET` | um valor longo e aleatório |

E o **mesmo** `RANKED_IMPORT_SECRET` nas variáveis de ambiente da Vercel. Sem
ele, a rota responde 503 e não guarda nada — é o que impede qualquer pessoa de
escrever nos dados do site.

## Como confirmar que funciona

**GitHub → Actions → "Recolha TopBrawl" → Run workflow.**

O trabalho diz quantos mapas leu. Se ler zero, **falha a vermelho** de
propósito: uma recolha vazia que passasse por sucesso deixava meses a acreditar
que estava tudo bem enquanto os números não mexiam.

Zero mapas significa que esta rede também está bloqueada pela fonte. Nesse caso
o caminho é o do BrawlScope: ler as páginas no navegador de quem usa o site,
com a extensão.

## Como está desenhado

**Um só interpretador.** `shared/topBrawlParser.ts` é lido pelos dois lados — o
servidor e a recolha externa. Duas cópias acabariam sempre com uma a ficar para
trás quando a fonte mudasse a marcação, e essa divergência é silenciosa: os
números continuariam a aparecer, só que errados. Há um teste que corre os dois
caminhos sobre a mesma página e exige resultado idêntico.

**Uma linha por mapa.** Guardar um mapa não obriga a reescrever os outros 133,
pela mesma razão que as fichas coladas têm linha própria.

**O que veio de fora não é pedido outra vez.** Só um mapa sem recolha é tentado
em direto — e se essa porta estiver fechada, falha depressa sem estragar o que
já se tem.

**Uma página sem linhas não é guardada.** Apagaria uma leitura boa anterior e
passaria por recolha feita; um mapa a zeros é indistinguível de um mapa que
ninguém joga, e essa confusão tira mapas da rotação por engano.

## Horário

Diário, às 05:20 UTC — pouco depois do cron do site, para os dados já lá estarem
quando ele correr. Muda-se a linha `cron` no ficheiro do trabalho.
