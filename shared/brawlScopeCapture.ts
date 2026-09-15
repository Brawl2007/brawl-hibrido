import { z } from "zod";
import { brawlScopeSlugFromName } from "./brawlScopeSlugs";

export const captureViews = ["overall", "gemGrab", "brawlBall", "knockout", "heist", "hotZone", "bounty"] as const;
const name = z.string().trim().min(1).max(64);
const delta = z.number().finite().min(-100).max(100);
const row = z.object({ opponent: name, rate: z.number().min(0).max(100), average: z.number().min(0).max(100), delta });
const literal = z.object({ brawler: name, delta });
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Typed captures keep row boundaries and the source's published delta. */
export const brawlScopeCaptureSchema = z.object({
  url: z.string().url().max(500),
  brawler: name,
  view: z.enum(captureViews),
  capturedAt: z.string().datetime(),
  expectedCount: z.number().int().min(1).max(300),
  rows: z.array(row).min(1).max(300),
  counteredBy: z.array(literal).max(20),
  targets: z.array(literal).max(20),
  synergies: z.array(literal).max(20),
}).superRefine((profile, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  let url: URL;
  try { url = new URL(profile.url); } catch { fail("Endereço inválido."); return; }
  if (url.protocol !== "https:" || !["brawlscope.com", "www.brawlscope.com"].includes(url.hostname) || url.port || url.username || url.password) fail("Origem da ficha inválida.");
  const slug = url.pathname.match(/^\/counters\/([^/]+)\/?$/)?.[1];
  if (slug !== brawlScopeSlugFromName(profile.brawler)) fail("O endereço não corresponde ao brawler.");
  if ((url.searchParams.get("mode") || "overall") !== profile.view) fail("Modo diferente do endereço.");
  if (url.searchParams.has("rank") && url.searchParams.get("rank") !== "legendary") fail("Esta matriz requer Legendary+.");
  if (profile.rows.length !== profile.expectedCount) fail("Tabela incompleta: faltam confrontos.");
  const seen = new Set<string>();
  for (const item of profile.rows) {
    if (key(item.opponent) === key(profile.brawler) || seen.has(key(item.opponent))) fail("Adversário repetido ou igual ao dono da ficha.");
    seen.add(key(item.opponent));
    if (Math.abs(item.rate - item.average - item.delta) > 0.21) fail("Delta incompatível com as percentagens publicadas.");
  }
  // A pertença à lista vem do título publicado, não do sinal do delta.
  // O delta compara o adversário com a sua média; não é a ordenação da lista.
  for (const list of [profile.counteredBy, profile.targets]) {
    const names = new Set<string>();
    for (const item of list) {
      const match = profile.rows.find(r => key(r.opponent) === key(item.brawler));
      if (!match || Math.abs(match.delta - item.delta) > 0.01 || names.has(key(item.brawler))) fail(`Lista de counters incompatível com a matriz: ${profile.brawler} · ${profile.view} · ${item.brawler}.`);
      names.add(key(item.brawler));
    }
  }
  if (new Set(profile.synergies.map(x => key(x.brawler))).size !== profile.synergies.length || profile.synergies.some(x => key(x.brawler) === key(profile.brawler))) fail("Sinergia repetida ou com o próprio brawler.");
});

export const brawlScopeCaptureFileSchema = z.object({
  format: z.literal("brawlhibrido-captures-v1"),
  profiles: z.array(brawlScopeCaptureSchema).max(2500),
});
export type BrawlScopeCapture = z.infer<typeof brawlScopeCaptureSchema>;

export function reviewCaptureBatch(input: unknown) {
  const envelope = brawlScopeCaptureFileSchema.extend({ profiles: z.array(z.unknown()).max(2500) }).parse(input);
  const profiles: BrawlScopeCapture[] = [];
  const rejected: string[] = [];
  envelope.profiles.forEach((value, index) => {
    const result = brawlScopeCaptureSchema.safeParse(value);
    if (result.success) profiles.push(result.data);
    else rejected.push(`Ficha ${index + 1}: ${result.error.issues[0]?.message}`);
  });
  return { profiles, rejected };
}
