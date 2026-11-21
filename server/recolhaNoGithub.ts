import { garantirArranque } from "./arranque";
import { recolherSeForAltura } from "./observedMatchCollection";

/**
 * A recolha de partidas, corrida pelo GitHub Actions e não pela Vercel.
 *
 * POR QUE ISTO EXISTE
 *
 * A Vercel pausou o site a 19/11/2026: o plano Hobby passou o limite de CPU
 * ativa. A recolha corria lá a cada 15 minutos. O repositório é público, por
 * isso o GitHub Actions corre isto sem custo, e a Vercel fica só a servir
 * páginas.
 *
 * Precisa só da base de dados (`DATABASE_URL`, `DATABASE_CA_CERT`): a chave da
 * API está guardada na própria base e o arranque carrega-a. Os pedidos saem
 * pelo proxy da RoyaleAPI, porque os IPs do GitHub mudam a cada corrida.
 */
export async function recolherNoGithub(ambiente: NodeJS.ProcessEnv = process.env): Promise<{ codigo: number; texto: string }> {
  if (!ambiente.DATABASE_URL?.trim()) {
    // Sem o segredo ainda posto: avisar sem falhar, para não chegar um email a cada 15 minutos.
    return { codigo: 0, texto: "::warning::Falta o segredo DATABASE_URL no GitHub: a recolha não correu." };
  }
  await garantirArranque();
  const resultado = await recolherSeForAltura("scheduled");
  const texto = JSON.stringify(resultado);
  if (resultado.ok || "saltada" in resultado) return { codigo: 0, texto };
  return { codigo: 1, texto: `::error::A recolha falhou: ${texto}` };
}
