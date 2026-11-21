/**
 * Uma volta da recolha de partidas Ranked, no GitHub Actions.
 * Ver `server/recolhaNoGithub.ts` e `.github/workflows/recolher-partidas.yml`.
 */
import { recolherNoGithub } from "../server/recolhaNoGithub";

recolherNoGithub()
  .then(({ codigo, texto }) => {
    console.log(texto);
    // A ligação à base fica aberta: sem isto o processo não terminava.
    process.exit(codigo);
  })
  .catch((erro: unknown) => {
    console.log(`::error::A recolha rebentou: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exit(1);
  });
