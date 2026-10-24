# Calibração por pick e influência de bans — v179

Registro da v179. Os ajustes atuais de escala e escassez estão em [MOTOR_API_V180.md](MOTOR_API_V180.md).

A v179 mantém a viabilidade de mapa e terreno da v178 e corrige três controles distintos: a divisão Vitória/Uso dentro da base, a participação da base diante de counters e sinergias e a confiança nas interações observadas.

## Pesos

A divisão da base é 70/30, 75/25, 80/20, 85/15, 90/10 e 95/5. O sinal de vitória é a força Bayesiana do próprio mapa; o de uso é o logaritmo da razão à média do mapa, limitado entre −2 e 2. O uso acima da média contribui positivamente. Os dois sinais são combinados uma vez, na proporção do pick, com ajuste de terreno. Não há outra penalidade de uso somada depois. O prior conservador para pouca evidência e a proibição de importar vitória de outro terreno pelo modo permanecem.

A participação global começa com base 1, counter 0 e sinergia 0. Nos demais picks, a base de referência passa por 0,92 / 0,84 / 0,76 / 0,68 / 0,60, somada aos pesos configurados de counter e sinergia e normalizada. Esses pesos são diferentes da divisão Vitória/Uso. Tanto “Melhores agora” como “Melhores no mapa” usam o pick atual; a pool viável continua baseada no mapa completo, sem mudar após bans, pesquisas ou restrição pessoal.

Os bônus positivos permanecem limitados pela adequação ao mapa. O primeiro pick conserva pelo menos 70% da contribuição positiva na base; o teto contextual cresce progressivamente nos picks seguintes. Nichos abaixo de 30% do uso médio só podem ser liberados no fechamento, com terreno viável e dois counters fortes comprovados.

## Confiança das interações

O residual do resultado observado desconta as forças individuais do mapa. Uma única ponderação `N/(N+K)` mistura esse residual com a matriz de apoio: K=15 para counter, 25 para dupla e 40 para trio. N usa jogos efetivos ponderados; a parcela do modo fora do mapa continua contribuindo com 35%, sem contar o mapa novamente. Não se aplica outra suavização ao residual antes dessa mistura. Com quatro jogos, o counter observado recebe cerca de 21%; com 45, 75%.

Duplas e trios positivos recebem só 20% do bônus quando a vitória individual suavizada do candidato é inferior a 47%. Poucos jogos isolados não bastam para um veto de hard-counter ou para desbloquear nicho: exige-se amostra de pelo menos 15 jogos efetivos no mapa ou confirmação forte pela matriz. A penalidade gradual da interação continua disponível antes desse limiar.

## Bans e escassez

Bans são explicitamente passados ao motor, retirados das ameaças e deduplicados. Um counter frequente do mapa banido concede alívio proporcional ao seu uso e ao quadrado da desvantagem que causava. A remoção de opções viáveis da mesma função pode gerar um pequeno bônus de escassez, somente se a função ainda estiver em falta.

Ambos os benefícios têm limites prévios proporcionais à base e à adequação, para não promover uma escolha ruim por bans. Depois desses limites, multiplicam-se por `(3 - inimigos revelados)/3`, preservando o decaimento de 100%, 2/3, 1/3 e zero. Esses termos ficam separados dos demais bônus no relatório. Bans de ameaças raras ou incompatíveis não concedem esses benefícios.

A centralização usa uma referência estável do catálogo, incluindo candidatos banidos como hipóteses para comparar custos; eles nunca aparecem nas sugestões nem nas ameaças. Com três inimigos revelados, todos os fatores de cada candidato restante são idênticos com e sem bans. Isso evita influência residual por mudança na média dos candidatos.

## Interface e preferências

Os cartões mostram a divisão Vitória/Uso vigente e os impactos percentuais de caminho livre e escassez. A visão inimiga recebe os mesmos bans e configurações, no próximo turno real dela. O painel da API permite ajustar a escada de vitória, counter, sinergia e a influência dos bans.

Preferências antigas com a escada de fábrica 90/85/80/72/65/55 migram para a nova escada, preservando os demais ajustes. Preferências explicitamente salvas na v179 recebem uma marca de calibração e não voltam a ser migradas.

As porcentagens continuam sendo estimativas do modelo, sem validação preditiva em partidas futuras. Os testes cobrem mistura exata, progressão, confiança de pares, anti-carona, efeitos e decaimento de bans, integração do Draft e preservação das restrições da v178.

Na amostra pública já capturada de 949 partidas de Bridge Too Far, a abertura passou a liderar com Colt e 8-bit, mantendo o Top 8 sem tanques, lançadores ou assassinos. Contra Colt e Colette revelados, a ordem mudou, preservando a viabilidade de terreno. Essa amostra verifica sensibilidade às regras, sem medir acurácia preditiva.
