import { trpc } from "@/lib/trpc";

/**
 * Esta sessão é a do dono do site?
 *
 * POR QUE ISTO EXISTE
 *
 * O site não tem contas: tem visitantes e tem um dono. Quase tudo é para
 * visitantes — o Draft, a matriz, o catálogo, os mapas. O que é só do dono são
 * os comandos que mexem nos dados: "Atualizar agora", o diagnóstico das fontes,
 * a chave da API e a colagem de fichas.
 *
 * Até aqui essa diferença só existia no servidor, que recusava o pedido. No
 * ecrã, um visitante via os botões do dono como se fossem dele — e a recusa
 * chegava depois de clicar, em forma de expulsão para a página de entrada. Um
 * botão que não é para ti é melhor não estar lá.
 *
 * `auth.me` é público de propósito: perguntar quem está nesta sessão nunca
 * precisa de sessão. Devolve `null` para quem não entrou, e isso é uma
 * resposta, não um erro — por isso esta pergunta nunca faz ninguém aterrar no
 * formulário de entrada.
 */
export function useEhDono(): boolean {
  const meQuery = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const sessao = meQuery.data as { role?: string } | null | undefined;
  return sessao?.role === "admin";
}
