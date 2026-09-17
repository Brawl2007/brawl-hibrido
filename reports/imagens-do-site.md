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

## Como resolver de vez

Põe os ficheiros em `client/public/manus-storage/`, com estes nomes exatos:

| Ficheiro | Onde aparece |
|---|---|
| `brawl-hibrido-logo_6c9584aa.png` | logótipo, em quase todas as páginas |
| `brawl-hibrido-hero_c38f757c.jpg` | imagem principal da entrada |
| `brawl-hibrido-map-bg_531ad86a.jpg` | fundo dos mapas |
| `brawl-hibrido-texture_3661e183.jpg` | textura de fundo |
| `brawl-stars-draft-background_4a31ad8d.webp` | fundo do tabuleiro de Draft |

São servidos como qualquer outro recurso estático: sem chave, sem API e sem
invocação de função. É o caminho mais barato e o único que não depende de uma
plataforma que já não se usa.

Os nomes têm de ser estes porque são os que o código pede. Mudar o nome obriga
a mudar `Home.tsx`, `Draft.tsx`, `BrawlerDetail.tsx` e o `index.css`.

## Enquanto não houver ficheiros

A resposta passou a ser **404 com um dia de cache**, em vez de 500. O navegador
percebe que não existe e deixa de insistir — um 500 convida à repetição, um 404
encerra o assunto.

Quem ainda tiver as variáveis da plataforma antiga pode defini-las: o
reencaminhamento continua a funcionar como recurso, e é tentado quando não há
ficheiro local.

## Onde estavam as originais

Segundo `reports/draft-background-asset.md`, o fundo do Draft veio de
`/home/ubuntu/webdev-static-assets/brawl-stars-draft-background.webp` — uma
máquina da plataforma anterior. Se não houver cópia dessa pasta, as imagens têm
de ser refeitas ou substituídas.
