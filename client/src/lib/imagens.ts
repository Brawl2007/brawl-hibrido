/**
 * Onde estão as imagens do site — e o que fazer enquanto não estiverem.
 *
 * O QUE ACONTECEU
 *
 * O logótipo, a imagem principal, o fundo dos mapas, a textura e o fundo do
 * tabuleiro nunca estiveram neste repositório. Viviam na plataforma anterior e
 * eram pedidos a uma API com chave, por `/manus-storage/...`. Fora dela esses
 * endereços não respondem, e o histórico do repositório confirma que os
 * ficheiros nunca cá entraram: não há de onde os recuperar.
 *
 * COMO ISTO FICA RESOLVIDO
 *
 * O logótipo é o único que aparecia PARTIDO, por ser uma `<img>`: um ícone de
 * imagem falhada em todas as páginas e no separador do navegador. Passa a
 * apontar para um ficheiro que existe aqui — um monograma provisório, sem
 * pretensões de ser a marca final, mas que é servido como qualquer recurso
 * estático e não custa uma invocação de função.
 *
 * Os outros quatro eram decorativos e estavam SEMPRE por baixo de um gradiente
 * que já sustenta o aspeto sozinho. Ficam a `null`: o gradiente fica como está e
 * poupam-se quatro pedidos falhados por cada carregamento de página.
 *
 * QUANDO HOUVER OS ORIGINAIS
 *
 * Põe os ficheiros em `client/public/` e troca os endereços aqui. É o único
 * sítio que precisa de mudar — antes, os mesmos endereços estavam repetidos em
 * quatro páginas, no `index.html` e no `index.css`. Os nomes que a plataforma
 * anterior usava estão em `reports/imagens-do-site.md`.
 */
export const LOGO = "/marca/logo-provisorio.svg";

/** Decorativas. `null` significa "só o gradiente", que é o que se vê hoje. */
export const IMAGEM_PRINCIPAL: string | null = null;
export const FUNDO_DE_MAPA: string | null = null;
export const TEXTURA: string | null = null;

/**
 * Junta uma imagem a um gradiente, quando a imagem existe.
 *
 * Escrever `url(null)` no CSS não é inofensivo: o navegador pede mesmo o
 * endereço "null", falha, e fica-se com o pedido perdido que se queria evitar.
 */
export function fundoCom(gradiente: string, imagem: string | null) {
  return imagem ? `${gradiente}, url(${imagem})` : gradiente;
}

/** Fundo do tabuleiro de Draft. Mesma regra das outras decorativas. */
export const ARENA: string | null = null;
