/**
 * A versão dos dados de que o motor do Draft depende.
 *
 * POR QUE EXISTE
 *
 * O motor lê quatro estados guardados em memória de módulo, cada um com o seu
 * setter: os dados de counters (`setCounterSyncSnapshot`), a leitura geral ou
 * por modo do BrawlScope (`setBrawlScopeReading`), as matrizes ao vivo
 * (`setBrawlScopeLiveMatchups`) e os papéis ajustados à mão
 * (`setDraftRoleOverrides`). Enquanto nenhum deles muda, a mesma pergunta ao
 * motor tem sempre a mesma resposta — e é isso que permite guardá-la.
 *
 * Cada setter avança este número. Uma cache que guarde a versão com que foi
 * preenchida sabe, só por comparar dois inteiros, se ainda pode responder ou
 * se tem de recalcular. Sem isto, guardar resultados do motor seria trocar
 * velocidade por números velhos — exatamente o tipo de defeito que não dá
 * erro e só se vê quando alguém repara que o Draft não mudou.
 *
 * Quem acrescentar um quinto estado mutável ao motor tem de avançar esta
 * versão no setter dele. O teste `motorComCache.test.ts` verifica os quatro.
 */
let versao = 0;

export function versaoDoMotor() {
  return versao;
}

export function avancarVersaoDoMotor() {
  versao += 1;
}
