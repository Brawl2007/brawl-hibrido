/**
 * Entrada do dono por palavra-passe.
 *
 * POR QUE ISTO EXISTE
 *
 * O login deste site era o do Manus: OAuth contra os servidores deles, com a
 * aplicação registada para um endereço `.manus.space`. Funcionava bem — desde
 * que o site vivesse lá. No momento em que muda de casa, o endereço muda, o
 * OAuth deixa de reconhecer o retorno, e ninguém entra. E sem entrar não há
 * "Atualizar agora", nem diagnóstico, nem colar fichas: é tudo só para o dono.
 *
 * Esta entrada não substitui contas de utilizadores — o site não tem nenhuma.
 * Tem um dono, que é uma pessoa só. Para isso, uma palavra-passe guardada no
 * alojamento chega, e não depende de mais ninguém.
 *
 * O openId é fixo de propósito: é sempre a mesma pessoa, e assim a sessão
 * sobrevive a reinícios e a mudanças de alojamento sem perder o perfil de dono.
 */

export const OWNER_LOGIN_OPEN_ID = "owner_local";

/** Onde vive o formulário de entrada, no cliente. */
export const OWNER_LOGIN_PATH = "/entrar";

/** Mínimo aceitável para a palavra-passe do dono. */
export const OWNER_PASSWORD_MIN_LENGTH = 8;
