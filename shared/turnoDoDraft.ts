/**
 * As contas do turno do Draft, fora da página para se poderem testar.
 *
 * - qual é o próximo passo pendente depois de uma escolha;
 * - qual é o passo que «Desfazer» retira;
 * - como se escreve o turno ("Pick 5 de 6", "Vez da equipa azul");
 * - o exemplo de revisão passado no endereço (`?picks=`).
 */

type Passo = { kind: "ban" | "pick"; team: "blue" | "red" };

/** O primeiro passo ainda por resolver (nem escolhido, nem ignorado). */
export function proximoPassoPendente(escolhas: readonly (string | null)[], ignorados: readonly boolean[]): number | null {
  const indice = escolhas.findIndex((escolha, i) => escolha === null && !ignorados[i]);
  return indice === -1 ? null : indice;
}

/**
 * O passo que «Desfazer» retira: o último resolvido pela ordem em que foi
 * resolvido. Um passo do histórico que entretanto já foi limpo (tocar na vaga
 * também a limpa) é saltado. Sem histórico útil, recua para o passo resolvido
 * mais avançado da sequência.
 */
export function ultimoPassoResolvido(
  historico: readonly number[],
  escolhas: readonly (string | null)[],
  ignorados: readonly boolean[],
): number | null {
  const resolvido = (indice: number) => Boolean(escolhas[indice]) || Boolean(ignorados[indice]);
  for (let i = historico.length - 1; i >= 0; i -= 1) {
    if (resolvido(historico[i])) return historico[i];
  }
  for (let i = escolhas.length - 1; i >= 0; i -= 1) {
    if (resolvido(i)) return i;
  }
  return null;
}

/** "Pick 5 de 6" — a posição do passo entre os do mesmo tipo. */
export function rotuloDoTurno(sequencia: readonly Passo[], indice: number | null): string | null {
  if (indice === null || !sequencia[indice]) return null;
  const passo = sequencia[indice];
  const doMesmoTipo = sequencia.filter((candidato) => candidato.kind === passo.kind);
  const posicao = sequencia.slice(0, indice + 1).filter((candidato) => candidato.kind === passo.kind).length;
  return `${passo.kind === "ban" ? "Ban" : "Pick"} ${posicao} de ${doMesmoTipo.length}`;
}

export function vezDaEquipa(passo: Passo | null | undefined): string | null {
  if (!passo) return null;
  return passo.team === "blue" ? "Vez da equipa azul" : "Vez da equipa vermelha";
}

/**
 * O exemplo de revisão: `?picks=Damian,Nori,Brock,Piper` preenche os picks
 * por ordem e passa os bans, para começar o draft a meio sem dez toques.
 *
 * Só aceita nomes do catálogo do mapa, sem repetidos, e nunca mais nomes do
 * que picks. Devolve `null` quando não há nada válido a aplicar — e nesse
 * caso a página abre como sempre.
 */
export function exemploDaRota(
  sequencia: readonly Passo[],
  pedido: string | null | undefined,
  catalogo: readonly string[],
): { escolhas: (string | null)[]; ignorados: boolean[]; historico: number[] } | null {
  if (!pedido) return null;
  const porNome = new Map(catalogo.map((nome) => [nome.toLocaleLowerCase("pt-PT"), nome]));
  const nomes: string[] = [];
  for (const parte of pedido.split(",")) {
    const nome = porNome.get(parte.trim().toLocaleLowerCase("pt-PT"));
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  if (!nomes.length) return null;
  const escolhas: (string | null)[] = sequencia.map(() => null);
  const ignorados = sequencia.map(() => false);
  const historico: number[] = [];
  let proximo = 0;
  for (let indice = 0; indice < sequencia.length && proximo < nomes.length; indice += 1) {
    if (sequencia[indice].kind === "ban") { ignorados[indice] = true; historico.push(indice); continue; }
    escolhas[indice] = nomes[proximo];
    historico.push(indice);
    proximo += 1;
  }
  return { escolhas, ignorados, historico };
}
