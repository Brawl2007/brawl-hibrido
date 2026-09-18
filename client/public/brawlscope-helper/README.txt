Brawl Híbrido v95 — recolha rápida, importação em lote e rotação automática

1. Publica este projeto v58 no teu alojamento habitual.
2. Extrai o ZIP no computador. No Chrome abre chrome://extensions, ativa Modo de programador e escolhe Carregar sem compactação. Seleciona a pasta extraída que contém manifest.json.
3. Entra como dono no site. No Draft, abre Estado das fontes e Importação em lote. Escolhe o percurso (todas as vistas ou uma vista) e exporta a fila pendente.
4. Clica no ícone da extensão, carrega brawlscope-fila.json e clica Iniciar. A extensão visita uma página de cada vez, abre Every matchup somente se estiver fechada, verifica a quantidade de linhas e guarda os números publicados e as listas literais.
5. Mantém o Chrome aberto. Podes usar outros separadores. Pausar interrompe a fila; um reinício do Chrome deixa-a pausada para retomar. O progresso fica no armazenamento local da extensão (não depende desta conversa nem do Render).
6. Exporta brawlscope-resultados.json, mesmo se só parte estiver pronta. No Draft importa esse ficheiro. O site valida brawler, modo, linhas e deltas, envia até 20 fichas por grupo e só avança após confirmação de persistência. Mantém o Draft aberto durante esta etapa. Para retomar, reabre o mesmo JSON.
7. A matriz atualiza a cada gravação. As listas dos perfis são republicadas no final do lote ou da pausa. Há também Publicar fichas para repetir uma publicação que tenha falhado.

A rotação Ranked entra sozinha (novo)
- A fila do site traz, à frente dos mapas, a página do índice da rotação: https://topbrawl.com/rankeds
- É essa página que diz QUAIS são os mapas de agora. Enquanto ela não era lida, a fila saía de uma lista escrita à mão no projeto — e quando a Supercell mudava a rotação, a extensão continuava a recolher os mapas que já tinham saído e nunca pedia os que entraram.
- Não tens de fazer nada de diferente: corre a fila como sempre. A rotação viaja no MESMO ficheiro dos mapas (topbrawl-mapas.json) e é aplicada quando o importas.
- Quando entram mapas novos, eles aparecem na fila SEGUINTE. Por isso, numa rotação nova, vale a pena correr a fila duas vezes: a primeira aprende a rotação, a segunda recolhe os mapas novos.
- Uma leitura do índice com poucos mapas é recusada e a rotação anterior mantém-se. Isso é de propósito: um parser partido lê zero mapas, e zero mapas tomado por verdade significaria "a rotação acabou".

Limites honestos
- Não resolve nem contorna HTTP 403, CAPTCHA, verificações ou restrições do BrawlScope. A fila pausa se encontrar esses sinais. Não muda IP, fingerprint, user-agent nem extrai cookies.
- Recolhe apenas páginas que o navegador consegue abrir normalmente. A fonte pode recusar automação; nesse caso é preciso acesso autorizado/API do fornecedor.
- Não promete 106 ou 108 fichas: a fila vem do roster do teu site. Páginas inexistentes, vistas sem amostra e mudanças no formato aparecem como erros, não dados inventados.
- Usa Legendary+ (o padrão da fonte). Outras seleções de rank são rejeitadas pelo importador para não misturar amostras.
- Recolhe counters e sinergias mantendo os deltas publicados. O total de linhas tem de coincidir com Every matchup. Não mistura o Top 10 com a tabela completa.
- A extensão não entra na tua conta do site; apenas exporta JSON. Não pede acesso a cookies, passwords, histórico ou outros domínios.
- Carregar outra fila substitui o progresso local da extensão: exporta os resultados primeiro. A importação no site é repetível e atualiza apenas o par brawler/vista enviado. Não apaga as restantes fichas.
- A função da extensão precisa de validação no teu Chrome com o BrawlScope atual. Testes locais não demonstram que todas as páginas da fonte são acessíveis.

Atualizar a extensão existente
- Antes de atualizar, exporta os resultados e pausa a fila.
- Substitui os ficheiros na MESMA pasta da extensão e clica Recarregar em chrome://extensions. Não removas a extensão: isso pode apagar o progresso.
- Só atualizar o ZIP do site no Render não atualiza a extensão instalada no Chrome.

Rapidez v61
- Uma página de cada vez, com avanço 250 ms depois do carregamento; a tabela dinâmica é observada em vez de verificada por intervalos fixos.
- Páginas lentas podem carregar até 3 minutos; falhas temporárias de leitura são tentadas automaticamente até 3 vezes. Bloqueios e verificações continuam a pausar a fila.
- Importação de até 20 fichas por gravação confirmada.
- Publicar fichas utiliza os resultados importados, sem consultar novamente as fontes externas.
- O tempo real depende do carregamento, do navegador e do banco. Não há garantia de uma duração fixa.
