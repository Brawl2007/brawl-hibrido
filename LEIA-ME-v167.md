# v167 — recolha em janelas de 15 minutos

O workflow já usava `*/15`, mas os registos consultados mostraram chamadas automáticas separadas por horas. GitHub Actions pode atrasar ou descartar jobs agendados. Alterar apenas o cron não garante a frequência.

## Alterações

- Uma volta por janela de 15 minutos, com 30 segundos de tolerância na passagem de quarto de hora. Variações de poucos segundos já não fazem saltar a volta seguinte.
- A reserva da janela é uma atualização condicional na base de dados: duas instâncias não iniciam a mesma volta. Uma recolha presa deixa de bloquear as seguintes.
- `/api/partidas/agendar` responde `202` imediatamente, incluindo em arranque a frio. O trabalho continua com `waitUntil` oficial da Vercel e guarda o resultado na base. `202` confirma a receção, não as partidas guardadas.
- `/api/partidas/recolher` continua síncrono para GitHub/Vercel; falhas de recolha devolvem HTTP 503.
- GitHub pede a reserva nos minutos 03/18/33/48, afastados do início da hora. Falhas HTTP/JSON são erros; uma janela já atendida é identificada como recolha não executada.
- Partidas e o diagnóstico do Draft mostram último início, conclusão, próxima hora prevista e atrasos. O cron diário dos mapas já não aparece como horário das partidas.
- A versão visível passa para v167. Não altera os motores do Draft nem elimina partidas existentes.

## Ativação do agendador principal — necessária

Os ficheiros do projeto não criam uma conta nem ativam um job num serviço externo. O agendamento dedicado só fica ativo depois de guardar a configuração nessa conta.

Em https://console.cron-job.org/ cria um cronjob com:

| Campo | Valor |
|---|---|
| Título | Brawl Híbrido — partidas a cada 15 minutos |
| URL | `https://brawl-hibrido.vercel.app/api/partidas/agendar` |
| Ativo | Sim |
| Método | GET |
| Intervalo | A cada 15 minutos: 00, 15, 30, 45 |
| Fuso horário | UTC |
| Guardar respostas | Sim |

Não precisa de palavra-passe ou chave da Supercell no agendador. A chave fica no site. `scripts/cron-job-partidas.json` contém a configuração equivalente para a API do serviço; não é um ficheiro de resultados do BrawlScope nem um importador do Draft.

O cron-job.org gratuito espera no máximo 30 segundos; por isso a nova rota confirma a receção e mantém o trabalho em segundo plano. Para confirmar recolha efetiva, consulta o estado e as partidas novas guardadas em duas voltas consecutivas. Uma resposta `202`, um cron declarado ou um job verde não comprovam a cadência sozinhos.

O plano Hobby da Vercel só aceita cron diário. `vercel.json` mantém os crons diários compatíveis; não exige mudança de plano. O workflow GitHub é uma reserva e não garante horários exatos. A hora real pode variar ou falhar se o agendador, API ou base estiverem indisponíveis; o painel assinala esse atraso.

## Referências oficiais

- GitHub: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- Vercel cron: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel waitUntil: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil
- cron-job.org: https://cron-job.org/en/faq/
- Configuração do serviço: https://docs.cron-job.org/rest-api.html
