/**
 * Verificação da palavra-passe do dono. Ver `shared/ownerLogin.ts` para o
 * motivo de esta entrada existir.
 *
 * A palavra-passe vem de `OWNER_PASSWORD`, definida no alojamento. Não pode vir
 * da base de dados como a chave da API: essa guarda-se pelo site, e pelo site
 * só se lá chega depois de entrar. Alguém tem de ser o primeiro, e é o
 * alojamento.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { OWNER_PASSWORD_MIN_LENGTH } from "@shared/ownerLogin";

export type OwnerLoginCheck =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "too-short" | "wrong" | "locked"; retryAfterMs?: number };

/** A palavra-passe configurada, ou undefined se não houver. */
function palavraPasseConfigurada() {
  const valor = process.env.OWNER_PASSWORD ?? "";
  return valor.length > 0 ? valor : undefined;
}

export function isOwnerPasswordConfigured() {
  return palavraPasseConfigurada() !== undefined;
}

/**
 * Uma palavra-passe curta de mais é recusada aqui, e não no formulário.
 *
 * O formulário protege contra enganos; isto protege contra uma configuração
 * fraca no alojamento. Um site público com "1234" à porta não é uma questão de
 * conveniência de quem escreve o formulário.
 */
export function isOwnerPasswordStrongEnough() {
  const configurada = palavraPasseConfigurada();
  return configurada !== undefined && configurada.length >= OWNER_PASSWORD_MIN_LENGTH;
}

/**
 * Comparação de tempo constante.
 *
 * Comparar com `===` demora mais quanto mais letras acertarem no início, e essa
 * diferença é medível através da rede. Comparar resumos do mesmo tamanho tira
 * essa pista — e passar pelo resumo resolve também o problema de `timingSafeEqual`
 * rebentar quando os dois lados têm comprimentos diferentes.
 */
function iguais(a: string, b: string) {
  const resumoA = createHash("sha256").update(a, "utf8").digest();
  const resumoB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(resumoA, resumoB);
}

/**
 * Travão de tentativas.
 *
 * O endereço do site é público e o formulário tem um campo só. Sem travão, uma
 * máquina experimenta milhares de palavras por minuto. Com ele, cinco enganos
 * seguidos custam um minuto, e cada série seguinte custa o dobro, até quinze.
 *
 * A contagem vive na memória do processo: reiniciar o site limpa-a. É uma
 * fraqueza conhecida e aceite — quem reinicia o site é quem tem acesso ao
 * alojamento, e essa pessoa já sabe a palavra-passe.
 */
const TENTATIVAS_ATE_BLOQUEAR = 5;
const BLOQUEIO_BASE_MS = 60_000;
const BLOQUEIO_MAX_MS = 15 * 60_000;

let falhasSeguidas = 0;
let bloqueadoAte = 0;
let bloqueioAtualMs = BLOQUEIO_BASE_MS;

/** Só para os testes: repõe o travão entre casos. */
export function resetOwnerLoginThrottle() {
  falhasSeguidas = 0;
  bloqueadoAte = 0;
  bloqueioAtualMs = BLOQUEIO_BASE_MS;
}

export function checkOwnerPassword(candidata: unknown, agora = Date.now()): OwnerLoginCheck {
  if (agora < bloqueadoAte) {
    return { ok: false, reason: "locked", retryAfterMs: bloqueadoAte - agora };
  }

  const configurada = palavraPasseConfigurada();
  if (configurada === undefined) return { ok: false, reason: "not-configured" };
  if (configurada.length < OWNER_PASSWORD_MIN_LENGTH) return { ok: false, reason: "too-short" };

  if (typeof candidata !== "string" || candidata.length === 0 || !iguais(candidata, configurada)) {
    falhasSeguidas += 1;
    if (falhasSeguidas >= TENTATIVAS_ATE_BLOQUEAR) {
      bloqueadoAte = agora + bloqueioAtualMs;
      const proximo = { ok: false as const, reason: "locked" as const, retryAfterMs: bloqueioAtualMs };
      bloqueioAtualMs = Math.min(bloqueioAtualMs * 2, BLOQUEIO_MAX_MS);
      falhasSeguidas = 0;
      return proximo;
    }
    return { ok: false, reason: "wrong" };
  }

  falhasSeguidas = 0;
  bloqueadoAte = 0;
  bloqueioAtualMs = BLOQUEIO_BASE_MS;
  return { ok: true };
}

/** Only call after cryptographic session verification. This identity is never persisted. */
export function ownerFromVerifiedSession(session: { openId: string; appId: string; name: string }): import("../drizzle/schema").User | null {
  if (session.openId !== "owner_local" || session.appId !== "brawl-hibrido" || !isOwnerPasswordStrongEnough()) return null;
  const now = new Date();
  return { id: -1, openId: session.openId, name: "Dono", email: null, loginMethod: "password", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now };
}
