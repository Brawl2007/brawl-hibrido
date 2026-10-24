# Interações mecânicas e proteção do próximo pick — v181

A v181 acrescenta apoio tático ao ranking da API para pares escassos e proteção antecipada de aliados. Mantém a escala Vitória/Uso corrigida na v180, os pesos 70/30 → 95/5, os priors do próprio mapa, a confiança de pares 15/25/40 e os limites de bans. Os três primeiros picks continuam ancorados na base do mapa; a participação global de counter aumenta ao longo do draft.

## Pares com poucos jogos

`shared/estrategiaTatica.ts` descreve mobilidade, guarda-costas, defesa curta, fuga, baixo DPS sustentado, anti-tanque, quebra de parede, alcance e escudos/spawners. O residual mecânico é antissimétrico e limitado a ±0,9 log-odds. Ele considera lançadores contra alvos sem quebra de parede, invasores contra lançadores/snipers frágeis, tanques contra baixo DPS, anti-tanques contra tanques, defesa contra invasores, alcance em mapas abertos e resposta de quebra de parede.

As referências originais do mapa agora carregam sua abertura geométrica. Bônus dependentes de paredes exigem evidência da geometria do mapa atual; não se presumem paredes quando ela é desconhecida. Destruição programada desativa essas regras. A incompatibilidade de terreno continua impedindo tanques e lançadores nos mapas abertos, mesmo no último pick.

Com `N` jogos efetivos do par no mapa, a falta de evidência é `f = max(0, 1 − N/15)`. Quando existe uma interação mecânica, ela recebe `60% × f` da reserva, com a matriz de fontes no complemento. Se não existe fonte, a reserva é `f × mecânica`. A partir de 15 jogos no mapa, a mecânica deixa de alterar a reserva. O residual observado continua combinado uma única vez por `Nefetivo/(Nefetivo+15)`, incluindo a parcela já existente de evidência do modo. Exclusões manuais das fontes também impedem reintroduzir aquele par pela mecânica.

Essas regras são hipóteses contextuais: não criam partidas, não alteram contagens da ficha e não são apresentadas como resultados observados. A sinergia medida continua protegida pelos limites de confiança e pela trava anti-carona da v179.

## Ataque e guarda-costas

Após um aliado vulnerável, um protetor pode receber `guardaCostasLogit` se houver assassinos ou tanques ainda disponíveis e viáveis no mapa. O benefício combina a ameaça ao aliado, a capacidade do candidato de responder e o uso relativo dos agressores. Bans e escolhas já feitas retiram ameaças; a pool pessoal restringe sugestões, sem apagar as opções do adversário. Uma cobertura já oferecida por outro aliado não recebe bônus duplicado.

O sinal começa reduzido nos picks 2/3 e chega à força total nos picks 4/5. Zera no sexto pick e quando os três inimigos já foram escolhidos. Seu limite bruto é 0,35 log-odds, sujeito também ao teto contextual do mapa. Os cartões mostram quem seria protegido e quais respostas ainda abertas o protetor cobre. Isso reduz exposição, sem garantir invulnerabilidade a qualquer último pick.

`respostaTaticaLogit` registra duas decisões de composição: abrir paredes usadas pelo adversário, sem premiar a destruição das paredes do próprio aliado; e explorar, no sexto pick, uma composição completa sem anti-tanque ou sem invasor/quebra de parede. O especialista ainda precisa de terreno compatível e base adequada. As penalidades de hard-counter e composição permanecem ativas.

## Limites de influência

Nos picks 1–3, preserva-se o teto contextual anterior. A partir do quarto, candidatos viáveis também usam uma capacidade absoluta limitada por vitória no mapa e terreno: de zero a 100% entre 44% e 60% de vitória, multiplicada pela adequação. Isso evita que uma diferença de um ponto entre dois bons brawlers transforme o mínimo da normalização em capacidade quase zero. O teto global continua proporcional à base; os limites próprios de alívio e escassez de bans da v180 permanecem separados.

## Validação

`server/estrategiaApiV181.test.ts` cobre as interações mecânicas, a transição para evidência robusta, exclusões, a integração real do Draft e três simulações completas na ordem 1-2-2-1. Os cenários verificam tanque contra baixo DPS no fechamento, lançador contra uma composição sem invasão/quebra de parede e guarda-costas no quinto pick após lançador no quarto. Também verificam bans, proteção já existente, pool pessoal, inimigos completos e os três mapas abertos do catálogo.

O cenário antigo da v178 que isola a reação à API desativa explicitamente a reserva mecânica, preservando sua comparação entre ausência e presença de resultados observados. As novas simulações testam a camada mecânica com nomes reais.

Validação completa: 1.445 testes aprovados e dois ignorados em 141 arquivos, incluindo os 20 novos casos da v181. `pnpm check`, `pnpm build` e os 10 testes do simulador da extensão concluíram com sucesso.
