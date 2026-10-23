# Motor da API oficial — v176

No Draft, ligar **API oficial** ativa o ranking em log-odds. Os motores Híbrido, PL Prodigy e MetaPick continuam disponíveis com a API desligada. Preferências personalizadas existentes são preservadas; as novas predefinições podem ser recuperadas no painel de regras.

Cada partida contribui com elo (0,35 / 1 / 1,8 / 3), poder dos seis jogadores (1 ou 0,15) e meia-vida de 14 dias. As contagens brutas continuam nos resultados, ao lado das ponderadas. Os priors do modo usam o mesmo período e filtro de rank do mapa. Dados de outros modos ou fontes não entram no motor oficial.

O prior do modo tem 40 jogos neutros; o do mapa tem 30 do modo e 20 neutros. Pares usam 25 jogos do modo e 25 da expectativa derivada das forças individuais, com o prior de modo de 35 descrito no documento. Menos de 6 jogos efetivos zera o efeito; confiança de volume usa K=35 para counter e K=50 para dupla. O filtro de ruído e a trava anti-carona precedem o ranking.

No fecho, a sinergia de trio é o residual sobre as forças individuais e as três duplas, com K=75 para não contar a mesma evidência duas vezes. Essa extensão complementa o código do documento, que só somava duplas. Os sete fatores exibidos somam exatamente o score antes da sigmoide; a redução por pouco uso aparece uma única vez.

O risco cego considera todos os disponíveis, excluindo bans e picks. A simulação de resposta considera os 15 mais ameaçadores após excluir o candidato e respeita o próximo turno inimigo na ordem 1-2-2-1. A pool pessoal opcional restringe as sugestões para o utilizador, sem restringir artificialmente o adversário. As lanes completas avaliam as seis permutações; as parciais também evitam atribuir o mesmo adversário duas vezes.

Os números são estimativas do modelo, ainda sem calibração empírica. Battlelogs registam resultados de equipas, não duelos de lane. A interface distingue ambos. A Matriz mantém a taxa medida e a habitual para auditoria, mas o destaque e a ordenação passam a usar o efeito residual ponderado.

No Híbrido, o risco de um inimigo revelado completa o delta negativo até ao piso configurado (12% por omissão), em vez de cobrar o mesmo delta duas vezes. Dois inimigos desfavoráveis acrescentam a pressão configurada (15%). O campo legado `counterMinimo` continua a usar a unidade já existente, percentagem do confronto centrada em 50%; copiar o valor 0,20 do exemplo para esse campo significaria um limiar de apenas 20%, não um efeito de 0,20 logits. O novo motor usa os limiares de log-odds próprios do documento.

A instalação da base acrescenta somente `observed_battle_quality`, através do instalador idempotente existente. Não altera tabelas nem apaga histórico. Poder 11 desconhecido em partidas antigas recebe peso conservador de 0,15; releituras da API podem preencher o metadado sem duplicar a partida. Datas inválidas têm peso zero. A validação local cobre a persistência por SQL simulado; não foi executada contra a base de produção.

Validar a partir da raiz do repositório, com Node 24 e o pnpm fixado pelo Corepack:

```sh
export COREPACK_HOME=/workspace/.cache/corepack
corepack pnpm run check
corepack pnpm test --maxWorkers=2 --minWorkers=1
DISABLE_MANUS_RUNTIME=1 corepack pnpm build
DISABLE_MANUS_RUNTIME=1 BRAWL_LIVE_SYNC_ENABLED=false BRAWL_RANKED_SYNC_ENABLED=false corepack pnpm start
```

Publicar o ambiente de desenvolvimento não publica o site na Vercel. O deploy de produção segue a integração do repositório com a Vercel, após o envio à branch de produção.
