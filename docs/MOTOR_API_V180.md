# Escala de Vitória/Uso e escassez após bans — v180

A v180 corrige duas distorções da v179. Os pesos por pick continuam em 70/30, 75/25, 80/20, 85/15, 90/10 e 95/5.

O sinal de uso é `0,175 × clamp(ln(max(0,02, razãoUso)), −2, 2)`, com amplitude de −0,35 a +0,35. Essa faixa aproxima o uso da escala habitual da força de vitória em log-odds. Uso médio permanece neutro, uso acima da média contribui positivamente e a progressão logarítmica é preservada dentro do limite. A combinação ponderada aplica cada peso uma única vez. Na abertura, 58% de vitória com razão de uso 1,5 supera menos de 50% de vitória com razão 4, inclusive se o sinal de uso do segundo atingir o teto. O exemplo de 60%/1,4 contra 48%/4,5 também passa a favorecer a maior vitória.

O bônus de escassez considera a fração das opções viáveis da função removidas pelos bans, sem uma segunda divisão pela quantidade restante. Antes do decaimento por picks inimigos, aplica-se `min(0,06; 10% da base adequada; pesoBan × 0,2 × removidos / antes)`. O teto 0,06 é expresso em log-odds, não em pontos percentuais. Com isso, a contribuição cresce gradualmente e permanece um desempate pequeno. Função preenchida, base negativa e escolhas incompatíveis continuam sem esse bônus. O decaimento por inimigos restantes continua em 100%, 2/3, 1/3 e zero.

Os testes de regressão em `server/motorApiPerfeito.test.ts` reproduzem os dois exemplos do anexo, verificam a ordem no ranking real, a amplitude e o sinal do uso, a progressão da escassez até restar uma opção, seus tetos e seu decaimento. O teste de troca de ordem por pick usa agora candidatos de 59% e 60%, preservando o papel do uso como desempate entre desempenhos próximos.

Validação: 1.425 testes aprovados e dois ignorados em 140 arquivos; 10 testes do simulador da extensão aprovados; `pnpm check` e `pnpm build` concluídos com sucesso.

As porcentagens apresentadas continuam sendo estimativas do modelo. A correção de escala e os testes não constituem validação preditiva em partidas futuras.
