# Brawl Híbrido — partidas a zero e falha de recolha

## Base e âmbito

- Repositório: `Brawl2007/brawl-hibrido`.
- Base examinada: `e49ef5606498ceda608fde554fc19e5c3b335dce`.
- Não alterar main, publicar em produção, apagar dados ou repetir o coletor em ciclo.
- Não havia PRs abertos no momento da verificação.

## Evidência em produção (22/10/2026)

- A execução Actions `39662900297` tinha um job, `recolher`, que durou 8 segundos. O pedido HTTP falhou com 500 e curl terminou com código 22.
- A API pública `observedMatches.status` respondeu 200: 752 266 partidas e 13 540 788 observações de confronto. A chave oficial estava configurada.
- A última conclusão guardada foi `2026-10-16T05:01:02.000Z`, marcada como sucesso. Isso não prova que as tentativas seguintes tenham funcionado.
- Uma única chamada controlada a `/api/partidas/recolher` reproduziu o HTTP 500. Falhou o UPDATE de `observed_match_collection_config` que reserva a janela, antes da leitura de jogadores. A resposta expunha SQL e parâmetros, mas omitia a causa interna do driver.
- A consulta de partidas com `dias: 1` devolveu 0. Com `dias: 30`, devolveu 60 000, 30 mapas e 107 brawlers; `limiteAtingido: true`. O limite de 60 000 já existia.
- Os logs internos da Vercel não estavam acessíveis à ligação disponível (403). Não foi possível confirmar se a escrita é recusada por espaço, modo de leitura, permissões ou outro motivo. Não afirmar uma dessas hipóteses como causa provada.

## Alterações

- A falha da reserva passa a devolver um erro estruturado e sanitizado, incluindo a etapa. Causas conhecidas do driver são classificadas sem devolver consultas, parâmetros ou credenciais.
- Falhas ao gravar o próprio estado de erro deixam de esconder o diagnóstico original da recolha.
- As leituras das partidas, mapas e cobertura propagam indisponibilidade em vez de fabricar listas vazias ou totais zero. Os fallbacks do catálogo das outras fontes mantêm-se.
- O workflow preserva o código de saída do curl e mostra o diagnóstico público. Respostas antigas sem diagnóstico sanitizado e páginas HTML não são despejadas no log.
- O painel distingue carregamento, erro e filtro realmente vazio. Um botão limpa período/rank/modo/mapa para consultar os dados guardados. O resumo é consultado a cada três minutos com a página ativa; o estado da recolha mantém o ciclo de um minuto.
- O aviso de atraso deixa de atribuir a falha apenas ao agendador: o servidor também pode ter recusado a recolha.

## Validação local

- 45 testes dirigidos passaram em 9 ficheiros: diagnóstico e proteção de dados, leituras da base, reserva concorrente, erro de escrita secundário, workflow bash com respostas simuladas, renderização do painel, agendamento, ID MySQL, configuração TLS e handler assíncrono existente.
- TypeScript estrito passou para `db.ts`, diagnóstico e os testes da base/diagnóstico/workflow, com as dependências locais de verificação.
- Transpilação esbuild passou nos quatro módulos de entrada/recolha/interface alterados.
- `git diff --check` passou.
- A cópia local contém os ficheiros necessários à verificação, obtidos do commit-base pelo conector. Não é um checkout integral; o clone Git privado não estava autenticado. Não se executou a build completa nem toda a suite localmente. O workflow existente `Testes` deve executar tipos, imports, CSS, suite completa, simulador da extensão e build no PR.

## Pendente — não declarar resolvido em produção

1. Rever o CI integral e validar a alteração num ambiente de teste com acesso autorizado à base.
2. Ler o novo `errorCode`/diagnóstico da reserva ou a causa interna no alojamento. Desbloquear a escrita conforme a evidência, sem apagar partidas ou aumentar custos automaticamente.
3. Confirmar uma recolha concluída, novo horário de conclusão e inserção de partidas reais; zero inserções pode ser legítimo se todas forem duplicadas.
4. Confirmar os filtros no painel e o erro de indisponibilidade quando apropriado.
5. Merge/publicação de produção continuam pendentes de autorização. Este patch corrige diagnóstico e apresentação, mas não demonstra que a causa externa da escrita foi removida.

## Consulta imediata no site atual

Selecionar 30 dias e todos os ranks/modos/mapas permite consultar dados históricos existentes. Não os apresentar como dados novos: a recolha continua atrasada até a escrita voltar a funcionar.
