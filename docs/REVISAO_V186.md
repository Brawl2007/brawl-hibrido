# Revisão v186 — percursos de toque

Versão de revisão a partir da v185 (`b9ccef4`), seguindo o kit «Brawl Híbrido —
Kit com Gestos». Feita primeiro a parte que se verifica com o polegar: os seis
percursos do `COMECA-AQUI-CLAUDE.md`. **Não publicar em produção antes da
aprovação.**

## Como rever

| Percurso | Endereço de partida | O que fazer |
|---|---|---|
| 1. Hard Rock Mine | `/?map=hard-rock-mine` | Arrastar na estampa para o lado; «Estampa»/«Terreno»; régua com as setas; «Ver ranking»; «Abrir Draft». |
| 2. Ring of Fire | `/?map=ring-of-fire` (ou «Testar pesos em Ring of Fire») | Tocar em Draco; 70/30 → 85/15 → 95/5; arrastar a régua. |
| 3. Center Stage | `/draft?map=center-stage&picks=Damian,Nori,Brock,Piper` | Escolher Willow, tocar outra vez, «Desfazer», Willow, Sprout, «Abrir Quadro». |
| 4. Quadro | o mesmo draft, com Willow e Sprout | Faixa «Direita»; Início → Meio → Fim; arrastar uma ficha no Meio; mudar de momento a meio do movimento. |
| 5. Alcance e Matriz | `/brawlers?aba=alcance&q=Sprout,Willow,Angelo` | Abrir Willow, «Ver Matriz de Willow», Counters e Castiga; voltar. |
| 6. Partidas | `/partidas` (desenvolvimento, sem base) | 1 contra 1 com Lumi; Equipas 3v3; «Só com 30+ jogos»; «Limpar filtro». |

`?picks=` é uma ajuda de revisão: preenche os picks pela ordem e passa os bans.
Só aceita nomes do catálogo do mapa.

## Números de controlo (motor e dados deste checkout)

| Situação | Resultado |
|---|---|
| Ring of Fire, fontes 50/50, Star Player desligado | Draco 6.º (71,24) → 2.º (85,62) → 1.º (95,21) com Vitória 70/85/95 %. |
| Hard Rock Mine | Só Score publicado: Bolt 73,18 lidera; a régua dá lugar a «Score publicado». |
| Center Stage, faixa direita | Willow × Sprout, índice da equipa azul 44,85 / 100, «BrawlScope -5,15% (tabela geral)». |
| Willow nas fontes | Angelo +7,45 % «Angelo tem vantagem»; Pam −17,15 % «Willow tem vantagem». |
| Alcance (Brawl Planet) | Sprout 5,0–6,4; Willow 6,5–7,9; Angelo 9,5–10,9 blocos; régua comum 0–11. |
| Partidas de teste | Bull + Colette + Lumi 2V · 1D; Lumi × Surge 2V · 1D da equipa de Lumi; 30+ jogos → 0 resultados. |
| Ficha de Willow | Melhor registo Triple Dribble, 68,45. |

Todos estes valores estão presos em `server/percursosV186.test.ts`.

## Verificação feita

- `pnpm check`, `pnpm test` (155 ficheiros, 1568 testes) e `pnpm build` passam.
- Chromium (Playwright) a 320, 390, 414, 768, 1024 e 1440 px nas oito rotas: sem
  transbordo horizontal; os alvos novos têm pelo menos 44 × 44 px.
- Movimento normal e reduzido: com `prefers-reduced-motion` a estampa troca de
  face no fim do gesto, a régua passa a interruptor, as linhas trocam de lugar
  sem deslizar, não há voo do retrato e as fichas do Quadro saltam.
- Voltar/Avançar, recarregar, duas trocas de mapa seguidas, mapa removido
  (`?map=pit-stop` abre outro mapa com aviso), «Usar no Draft» com `?brawler=`.
- **Não medido:** Safari num iPhone físico, fluidez (fps), latência, bytes da
  abertura fria/com cache. A gravação entregue é emulada em Chromium a 414 px.
  O CDN da Brawlify estava bloqueado no ambiente de teste: mapas e retratos
  aparecem como substitutos/iniciais nas capturas.

## Desvios em relação ao kit

1. **Papel só nas partes novas.** O mapa em destaque e o ranking do Início estão
   em papel `#F5F2E9`; a barra de cima, o resto do Início e as outras páginas
   mantêm o visual escuro da v185. O redesenho completo das oito rotas fica para
   as próximas passagens.
2. **Estampa desenhada em SVG** por modo (gema, bola, estrela, cofre, zona,
   escudo), com luz e nervuras. O projeto não tem estampas ilustradas como as do
   kit.
3. **Terreno inteiro**: a imagem do mapa aparece completa e na orientação dele
   (no kit está recortada).
4. **Mapa de abertura**: sem `?map=`, o Início continua em Beach Ball, como na
   v185.
5. **Draft**: mantém o tabuleiro completo (bans, picks, três vistas centrais e
   sete painéis). O voo do retrato só acontece quando a vaga está no ecrã; no
   telemóvel a lista fica por baixo das equipas e o voo muitas vezes não se vê.
6. **Quadro**: a vista plana passou a ser a de partida (o 3D fica a um toque e a
   escolha é lembrada). Sem um plano do jogador para Meio e Fim, as fichas não
   mudam de sítio entre momentos — o motor devolve as posições do Início. Os seis
   trajetos do kit eram um plano simulado. Seta, Símbolo e Apagar continuam no
   3D; a vista plana mostra as setas e deixa mover fichas (arrastar e teclado).
7. **Matriz**: sem o cartão grande com os dois retratos; o beneficiário aparece
   em todas as linhas de confronto.
8. **Partidas**: o trio aparece como linha da tabela, não como cartão.

## Fora desta passagem

Média da rotação com mapas por brawler, reorganização de Entrar/administração,
recuperação em `NotFound` com pesquisa, faixa de Partidas com o teclado aberto
num iPhone real, medições de desempenho e a gravação num telemóvel físico.

## Correção de caminho

`pnpm dev` abria uma página em branco na v185: `server/_core/vite.ts` espalhava
a configuração do Vite, que é uma função assíncrona, e a raiz `client/` perdia-se.
Corrigido para a configuração ser resolvida antes.

## v187 — contraste medido

Contraste do texto medido sobre o fundo composto, nas oito rotas. Duas subidas:
a legenda do mapa no turno do Draft (4,38 → 7,45:1) e as fichas esbatidas do
Quadro plano (3,88:1 → acima de 4,5:1). «Falar» e «Pular» ficam a 4,28:1 só
quando o draft está fechado e estão desativados (exceção da regra 1.4.3); o
estilo é o da v185.

## v188 — revisão independente de UX e acessibilidade

Um revisor só de leitura apontou 12 defeitos; todos confirmados e corrigidos:
nome acessível no polegar da régua de pesos; `aria-selected` inválido nas linhas;
o foco já não salta para uma linha deixada (só volta depois de um reordenamento);
predefinições acima do máximo ficam desativadas com Star Player ligado; o gesto da
estampa captura o ponteiro logo no toque (um arrasto que acabava fora da moldura
bloqueava os seguintes); a região viva da estampa só fala quando a face muda;
«Desfazer» usa `aria-disabled` e não perde o foco; «Mapa e ajustes» é um botão
que leva o foco à secção sem entrada nova no histórico; voltar para outro mapa no
Draft limpa o draft; o draft guardado só é lido com os dados prontos; no Quadro
plano, um arrasto não escolhe faixa, mover com as setas é anunciado, o retrato que
falha é escondido sem tirar o nó ao React e a animação usa sempre a grelha atual.
