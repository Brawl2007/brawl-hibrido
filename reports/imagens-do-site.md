# Imagens do site

## O que aconteceu

O logótipo, a imagem principal, o fundo dos mapas, a textura e o fundo do
tabuleiro de Draft nunca estiveram neste repositório. Ficaram alojados na
plataforma anterior (Manus) e eram pedidos a uma API com chave, através de
`/manus-storage/...`.

Fora dessa plataforma as variáveis `BUILT_IN_FORGE_API_URL` e
`BUILT_IN_FORGE_API_KEY` não existem, e cada imagem respondia **500**.

Não era só uma questão de aspeto: cada um destes pedidos é uma invocação de
função. São quatro a cinco por cada carregamento de página, todas a falhar, e o
navegador volta a tentar. Gastava-se quota a servir erros.

## O que ficou feito

O histórico do repositório foi verificado: estes ficheiros **nunca** cá
entraram, por isso não há de onde os recuperar.

Dos cinco, só um aparecia partido: o logótipo, por ser uma `<img>` — um ícone
de imagem falhada em todas as páginas e no separador do navegador. Passou a
apontar para `client/public/marca/logo-provisorio.svg`, um monograma que existe
aqui, servido como recurso estático. Não pretende ser a marca final; serve para
o site deixar de parecer avariado.

Os outros quatro eram decorativos e estavam sempre por baixo de um gradiente
que já sustenta o aspeto sozinho. Ficaram desligados: o gradiente é o que se vê,
e poupam-se quatro pedidos falhados por cada carregamento de página.

Os endereços estavam repetidos em quatro páginas, no `index.html` e no
`index.css`. Passaram a viver num sítio só: `client/src/lib/imagens.ts`.

## Quando houver os originais

Põe os ficheiros em `client/public/` e troca os endereços em
`client/src/lib/imagens.ts`. É o único ficheiro que precisa de mudar. Os nomes
que a plataforma anterior usava eram estes:

| Ficheiro | Onde aparecia |
|---|---|
| `brawl-hibrido-logo_6c9584aa.png` | logótipo, em quase todas as páginas |
| `brawl-hibrido-hero_c38f757c.jpg` | imagem principal da entrada |
| `brawl-hibrido-map-bg_531ad86a.jpg` | fundo dos mapas |
| `brawl-hibrido-texture_3661e183.jpg` | textura de fundo |
| `brawl-stars-draft-background_4a31ad8d.webp` | fundo do tabuleiro de Draft |

Os nomes deixaram de ser obrigatórios: como só há um sítio a apontar para eles,
qualquer nome serve.

## O proxy de armazenamento

Continua a responder **404 com um dia de cache** a `/manus-storage/...`, para o
caso de algum endereço antigo sobreviver num marcador ou numa cache. Um 500
convida à repetição; um 404 encerra o assunto.
