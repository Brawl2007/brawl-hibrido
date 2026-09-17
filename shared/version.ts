/**
 * A versão que está mesmo a correr.
 *
 * POR QUE ISTO EXISTE
 *
 * O site é publicado carregando um ficheiro para o GitHub e esperando que o
 * alojamento repare na mudança. Quando alguma coisa não funciona como esperado,
 * a primeira pergunta é sempre a mesma — "esta é a versão nova ou a antiga?" — e
 * não havia forma de responder sem ir ver registos de build.
 *
 * Com o número à vista num canto do ecrã, essa pergunta responde-se de relance,
 * e deixa de se perder tempo a corrigir um problema que já estava corrigido.
 *
 * SOBE SEMPRE que sai uma versão nova.
 *
 * "Versão nova" é CADA alteração publicada, não um conjunto delas. Duas
 * correções seguidas com o mesmo número deixam quem está ao computador sem
 * maneira de saber qual das duas está no ar — e foi exatamente isso que
 * aconteceu: várias correções subiram com o número parado, e a única forma de
 * confirmar o que estava publicado passou a ser ir ver registos de build, que é
 * precisamente o trabalho que este número existe para poupar.
 *
 * Se o que mudou chega para publicar, chega para subir o número.
 */
export const VERSAO_DO_SITE = "v80";
