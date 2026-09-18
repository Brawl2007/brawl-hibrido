/**
 * A versão da extensão que este site espera.
 *
 * POR QUE ISTO EXISTE
 *
 * Três vezes seguidas a mesma coisa: publiquei uma correção na extensão, disse
 * "atualiza e recarrega", e o que continuou a correr foi a versão antiga. Da
 * última vez só percebi porque a mensagem de erro que me chegou era, palavra a
 * palavra, uma frase que já não existe no código — descobri por acaso, ao
 * procurá-la e não a encontrar.
 *
 * Ninguém tem culpa disso: não havia forma de ver, do lado do site, qual é a
 * extensão que produziu um ficheiro. O site recebia os dados e calava-se.
 *
 * Agora a extensão carimba a versão dela no que exporta, e o site compara com
 * este número. Um ficheiro sem carimbo nenhum também diz alguma coisa: foi
 * feito por uma extensão anterior a isto existir.
 *
 * SOBE quando a extensão muda — o teste em `extensaoEmpacotada.test.ts` não
 * deixa este número afastar-se do `manifest.json`.
 */
export const VERSAO_DA_EXTENSAO = "98.0.0";

/** Compara `1.2.3` com `10.0.0` por número, e não por ordem alfabética. */
export function versaoEAnterior(recebida: string | null | undefined, esperada = VERSAO_DA_EXTENSAO) {
  if (!recebida) return true; // Sem carimbo: é anterior ao carimbo existir.
  const partes = (valor: string) => valor.split(".").map((n) => Number(n) || 0);
  const [a, b] = [partes(recebida), partes(esperada)];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const esquerda = a[i] ?? 0;
    const direita = b[i] ?? 0;
    if (esquerda !== direita) return esquerda < direita;
  }
  return false;
}

/** A frase que o ecrã mostra, para o site e a extensão não discordarem. */
export function avisoDeVersao(recebida: string | null | undefined) {
  if (!versaoEAnterior(recebida)) return null;
  return recebida
    ? `Este ficheiro foi feito pela extensão v${recebida}, e a atual é a v${VERSAO_DA_EXTENSAO}. Os dados foram guardados na mesma, mas descarrega o ZIP e carrega Recarregar em chrome://extensions antes da próxima corrida.`
    : `Este ficheiro foi feito por uma extensão anterior à v${VERSAO_DA_EXTENSAO} — não traz a versão dela. Os dados foram guardados na mesma, mas descarrega o ZIP e carrega Recarregar em chrome://extensions antes da próxima corrida.`;
}
