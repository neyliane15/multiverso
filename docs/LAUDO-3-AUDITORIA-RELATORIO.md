# Laudo — Agente 3 (auditoria do montador e do revisor)

Branch `claude/clever-mccarthy-nnbtas`. Nada empurrado, nenhum PR aberto.
Seis commits locais meus de código, de `ac32ebc` a `51ea07e`, mais este laudo.

Banco próprio: **`auditoria_vendas`**, montado do zero (24 migrações + as 5
cargas + dados meus). `multiverso`, `multiverso_app` e `revisao_vendas` não
foram usados como prova — o `multiverso` só existe porque é o banco que a
própria suíte da casa (`npm run test:banco`) cria e destrói.

A pilha local é minha também: PostgREST 12.2.12 na 54325, portão na 54321 e
vite na **5174**, todos apontando para `auditoria_vendas`.

Dados de venda do Bar do Zeca: **meus**. Quatro lançamentos fechados de 69
fichas (10/09, 17/09, 24/09, 01/10), um cancelado, um aberto, e duas notas —
uma no dia da foto anterior (31/08, que tem de ficar de fora) e uma dentro
(15/09). O relatório resultante tem **904 linhas**. Mais três restaurantes
sintéticos (`Auditoria`, `Auditoria Vazia`, `Auditoria Nova`) para as bordas e
para o caso da casa recém-criada.

> **Nota de honestidade sobre o meio do caminho:** o contêiner foi recriado no
> meio desta auditoria e levou o primeiro banco, a primeira pilha local e todo
> o rascunho. Tudo que está escrito abaixo foi **medido de novo** depois disso,
> no banco atual e com o código atual. Nenhum número aqui veio da memória.

---

## Sumário

| Nº | Classe | Achado | De quem | O que fiz |
|---|---|---|---|---|
| 1 | **GRAVE** | O rodapé do dashboard negava o que o KPI da mesma tela afirmava, sobre as mesmas 526 linhas — e negava errado | montador | **Consertei** (`1389df3`) |
| 2 | **GRAVE** | O zero inventado mandava comprar: 36 linhas, R$ 309,97 de R$ 424,16 (73%) de compra sugerida sobre estoque que ninguém contou | montador (as duas pontas); revisor viu e não consertou | **Consertei** (`1389df3`) |
| 3 | **GRAVE** | Venda fechada não era imutável no cabeçalho: `referencia` mudava por API e movia a venda de relatório | montador (escreveu "imutável"); revisor mediu e deixou | **Consertei** (`ac32ebc`) |
| 4 | **GRAVE** | O relatório não paginava: 64.679 nós no DOM, 344.896 px de altura, 11 s de interface congelada ao limpar a busca | montador; revisor mediu e deixou | **Consertei** (`de567de`) |
| 5 | AJUSTE | `vendas_consideradas` dizia "3" sem dizer que em 2 deles o insumo não saiu — a coluna, não a fórmula | montador; revisor chamou de bug da fórmula | **Consertei** (`1389df3`), e **discordo** do diagnóstico dele |
| 6 | AJUSTE | A tabela rolava na horizontal em toda largura de desktop, inclusive 2560 | montador (errou a direção); revisor mediu certo e deixou | **Consertei** (`de567de`) |
| 7 | AJUSTE | O guarda de rota do revisor erra para o lado seguro, mas fechava a porta do próprio operador (barra no fim, maiúscula) | revisor | **Consertei** (`dd27c94`) |
| 8 | AJUSTE | `/contagem/<id de outro restaurante>` mostrava "JSON object requested, multiple (or no) rows returned" para quem conta estoque | montador (rota antiga), exposto pela lista branca | **Consertei** (`dd27c94`) |
| 9 | AJUSTE | `vendas_ref_unica` chegava à tela como "Já existe um registro com esse nome ou código" | montador | **Consertei** (`5f77aaf`) |
| 10 | **GRAVE** | O tema escuro não escurece: superfície clara + paleta escura = texto de alerta a **1,53:1** | **de ninguém dos dois** — é anterior, e está em `/` e `/cmv` também | **Não consertei** — blindei só a marca que eu criei (`5f77aaf`) |
| 11 | NOTA | Reaplicar **só** a 0023 desfaz, em silêncio, as duas metades do conserto de RLS do revisor | revisor (e o modelo de migração da casa) | Medido e registrado |
| 12 | NOTA | A 0024 copiou a função inteira e jogou fora todos os comentários dela | revisor | Registrado; a 0026 devolve os comentários |
| 13 | NOTA | **Prova refeita e confirmada**: `DIFERENÇA = VENDAS − CONSUMO` em 897 de 897 linhas computáveis, erro 0 | — | Medido com dados meus |
| 14 | NOTA | **Prova refeita e confirmada**: as 13 bordas da sugestão, uma a uma | — | Medido com cenário meu |
| 15 | NOTA | **Passou**: restaurante sem contagem, sem ficha e sem venda tem três telas honestas | montador (a favor dele) | Medido |
| 16 | NOTA | **Passou**: salvar e fechar venda não rebaixa o catálogo (4 e 2 idas ao servidor) | montador (a favor dele) | Medido |
| 17 | NOTA | A mensagem "venda e ficha de restaurantes diferentes" quase nunca era verdade | montador; revisor registrou e não consertou | **Consertei** (`ac32ebc`) |

---

## 1. GRAVE — a mesma tela dizia duas coisas opostas sobre as mesmas 526 linhas

No topo: **"Itens zerados 526 · 60,6% do total contado"** e um alerta
**"Por onde começar a reposição"**. No rodapé: **"526 linhas sem resposta
nenhuma — nem quantidade, nem carimbo de quem passou por ela. Elas entram
nesta leitura como zero."**

Ou elas foram contadas e deram zero (e aí reposição faz sentido), ou ninguém
respondeu (e aí não se sabe o que repor). As duas não.

A carga de outubro, medida no meu banco:

```sql
select c.referencia, count(i.*) itens,
       count(*) filter (where i.contado_em is not null) com_carimbo,
       count(*) filter (where i.quantidade = 0) qtd_zero,
       count(*) filter (where i.quantidade = 0 and i.custo_unitario > 0) zero_com_custo,
       count(*) filter (where i.quantidade > 0) qtd_positiva
  from contagens c join contagem_itens i on i.contagem_id = c.id group by 1;
```

```
 referencia | itens | com_carimbo | qtd_zero | zero_com_custo | qtd_positiva
 2026-08-31 |   868 |           0 |      517 |            455 |          351
 2026-10-01 |   868 |           0 |      526 |            464 |          342
```

**O rodapé estava errado duas vezes**, e a segunda é pior que a que o pedido
já apontava:

1. "nem quantidade" é falso: as 526 têm `quantidade = 0` escrito, e 464 delas
   com custo preenchido.
2. "nem carimbo" não separa nada: **nenhuma** das 868 tem carimbo — inclusive
   as 342 que a mesma frase chamava de respondidas. O `itens_respondidos` da
   0023 (carimbo **ou** quantidade) usa dois critérios diferentes na mesma
   folha e apresenta o resultado como se fosse um só.

**Consertado** na vista (`vw_contagem_procedencia` devolve `itens_com_carimbo`
e `itens_com_quantidade`, separados) e na frase, que passa a dizer o que é
verdade: ninguém carimbou nada, e por isso o sistema **não sabe** se o zero foi
contado ou se a linha ficou em branco.

**O que isso NÃO conserta, de propósito:** a origem. A carga
`supabase/seed/0003_contagem_outubro.sql` grava `quantidade = 0` sem
`contado_em`, então o banco continua sem poder distinguir as duas coisas.
Distinguir exigiria mexer na carga — **não mexi**. O custo, medido: são 868
linhas em 5 blocos de `insert` (linhas 1235–2127 do arquivo), e a carga **já
está aplicada na produção da cliente**, então mudar o arquivo não muda o banco
dela; seria preciso um `update` de migração carimbando as 342 linhas
preenchidas, e ainda assim ficaria sem saber quem contou. Decisão dela.

---

## 2. GRAVE — o zero inventado mandava comprar, nas duas pontas

O montador documentou **uma** ponta (§7.1 dele). O revisor achou a segunda e
mediu os dois lados, recomendou o conserto mínimo e **não o fez**. Refiz as
contas com dados meus e **concordo com a recomendação dele**, com um número a
mais que ele não tinha.

```
 linhas | anterior_inventado | anterior_com_setor | atual_inventado | atual_com_setor
    904 |                 50 |                 50 |              36 |              36
 atual_inventado_manda_comprar | reais_sobre_atual_inventado | reais_sugeridos_total
                            36 |                      309,97 |                424,16
```

As 50 e as 36 **já tinham vínculo de setor no cadastro** — a conferência
independente do revisor se reproduz. A folha anterior tinha 868 linhas para 906
produtos: ela simplesmente não os incluiu. **73% do dinheiro que a tela mandava
comprar repousava num estoque que ninguém mediu.**

E um número que o revisor não tem: o zero inventado **não fica quieto na
coluna dele**. No meu cenário de bordas, um insumo que está só na folha de
agora sai assim:

```
 produto       | ant | compras | vendas | atu | consumo | ideal | diferenca
 A_SO_NA_ATUAL |   0 |       0 |      0 |   4 |      -4 |     0 |         4
```

**Consumo −4.** Consumo negativo é "saiu do estoque menos que nada", que não
existe. É o zero inventado aparecendo na coluna que manda o gerente procurar
furto. Na carga real do Zeca são 11 linhas assim só pela ponta do anterior.

### O que eu decidi, e por quê

A regra da casa (0005) diz que número errado é pior que número ausente, e ela
se aplica — mas aplicada inteira ela esvaziaria 86 das 904 linhas, e o
argumento do montador (nulo cala justamente sobre o insumo que acabou de
entrar) também é verdadeiro. Então separei o que o número faz:

- **Mandar comprar é ação com preço.** `sugestao` e `precisa_comprar` voltam
  **nulos** quando o estoque de hoje foi lido por ausência. Depois do conserto:
  R$ 424,16 → **R$ 114,19**, e `ainda_sugere_sobre_zero_lido = 0`.
- **Informar um diagnóstico não é.** O zero continua em CONSUMO, IDEAL e
  DIFERENÇA — mas **marcado**, em coluna (`anterior_lido_como_zero`,
  `atual_lido_como_zero`), não em texto solto.

A identidade do gabarito continua valendo depois da mudança: **897 de 897**.

### A tela, sem a parede vermelha

O print `zeca-2-relatorio.png` mostrava três linhas de texto vermelho por
produto, e era só isso que separava um zero medido de um zero inventado. Agora
a marca vai **no próprio número** (`0 lido`, com o motivo no `title` e no texto
só-leitor, e legenda abaixo da lista). Com as duas frases fora da `pendencia`,
as linhas com texto vermelho embaixo do nome do insumo caem de **68 para 7** —
as outras 61 viraram marca de uma palavra em cima do próprio número. A parede
some porque deixou de existir, não porque foi escondida.

```sql
select count(*) filter (where pendencia is not null)                      as com_pendencia_agora,
       count(*) filter (where pendencia is not null
                          or anterior_lido_como_zero or atual_lido_como_zero) as como_era_antes
  from mv_relatorio_de_contagem('<contagem de 01/10>');
-- com_pendencia_agora = 7 · como_era_antes = 68
```

---

## 3. GRAVE — venda fechada não era imutável no cabeçalho

Medido no meu banco, numa venda **fechada**, sem tocar na tela:

```
update vendas set referencia = '2026-07-20', total_valor = 1 where id = <fechada>;
antes:  2026-10-01 · fechada · R$ 2.070,0000
depois: 2026-07-20 · fechada · R$     1,0000
```

`referencia` é a coluna que decide **em que relatório a venda cai**. O laudo 1
diz "venda fechada é imutável, como contagem fechada"; o gatilho da 0023
protege só `venda_itens`.

**Consertado** (`t_vendas_cabecalho_bloqueio`, no molde de
`mv_contagem_bloqueada`): numa venda fechada, `restaurante_id`, `referencia`,
`inicio`, `titulo`, `origem`, `origem_arquivo`, `total_itens`, `total_valor`,
`criado_por` e `criado_em` são recusados com
`venda ja fechada: reabra o lancamento para mudar periodo, titulo ou total`.
Continuam passando: reabrir, cancelar, e editar com a venda reaberta —
conferidos um a um na suíte.

**O que deixei de propósito:** apagar uma venda fechada continua possível para
quem administra. É ação explícita, com diálogo próprio e política própria,
igual a apagar contagem. O que fechei foi a mudança **silenciosa**.

**E o que fica aberto, de novo:** `contagens` tem o mesmo buraco no cabeçalho
(o revisor notou). Não mexi: contagem tem `mv_mudar_referencia`, uma tela que
usa isso e um fluxo de reabertura que eu não auditei. Fica apontado.

---

## 4. GRAVE — o relatório não paginava (e desenhava tudo duas vezes)

Medido nesta árvore, viewport 390 px, CPU 4× freada, mesmo dado (904 linhas),
**antes e depois da mesma medida**, no mesmo servidor de desenvolvimento:

| | antes | depois |
|---|---|---|
| nós no DOM | 64.679 | **746** |
| `<tr>` + cartões desenhados | 904 + 921 | 0 + 8 |
| altura da página | 344.896 px | **2.600 px** |
| filtrar "limao" | 1.604 ms | **166 / 251 / 225 ms** |
| limpar a busca | 11.086 ms | **144 / 178 / 136 ms** |
| "Só o que comprar" | 2.311 ms | **535 / 1.060 / 1.087 ms** |
| erros de console | nenhum | nenhum |

O "antes" é uma execução — ele deixou de existir no instante em que o
conserto entrou, e não dá para repeti-lo sem desfazer o commit. O "depois"
são três execuções, feitas **depois do último commit de código**, para que a
variação do contêiner apareça em vez de ser escondida. Mesmo no pior caso das
três, limpar a busca ficou **62× mais rápido** e a contagem de nós no DOM e a
altura da página se repetiram idênticas (746 nós, 2.600 px) nas três.

A peça é a da tela de insumos (`janelaDeLinhas` + dois espaçadores), e
`useTelaLarga` passa a decidir **no JavaScript** qual das duas árvores existe —
antes as duas eram montadas e o CSS escondia uma.

A janela conta em pixels, então a altura da linha é fixa. Não chutei: varri a
lista inteira medindo o conteúdo de cada linha em cada posição de rolagem.

```
cartões 390px: {"n":7914,"min":343,"p50":343,"p95":343,"max":373}
linhas 1480px: {"n":2356,"min":76,"p50":76,"p95":76,"max":76}
```

Com 376 e 76, a varredura de confirmação dá **0 linha cortada em 10.928
medidas**. Para o cartão fechar nessa altura, ele parou de repetir a fórmula de
cada coluna (84 px por cartão): a mesma tela já traz as três fórmulas no cartão
"Como esta conta é feita", que abre no celular também.

Rolar até o fim por teclado funciona (`PageDown` leva o contêiner de 0 a 535 e
a janela redesenha), e a lista ganhou `tabIndex` e nome acessível para não
depender do foco automático em contêiner rolável, que é recente e só do Chrome.

---

## 5. AJUSTE — "média das 3 últimas vendas": o revisor acertou o fato e errou o diagnóstico

Ele montou o caso (CACHAÇA vendida em 1 de 3) e chamou de **"sugestão 7,3×
menor"**, listando-o como alerta confirmado de um defeito. **Discordo do
diagnóstico, e a discordância tem conta.**

Para prever a compra da semana, a média sobre os **períodos** é a conta certa:
quem vende numa semana de três consome, em média, menos por semana. Dividir
pelas **aparições** inflaria exatamente o item que menos sai. O montador está
certo e escreveu isso (§2.4 dele).

O que estava errado é a **coluna**, que afirmava "3 vendas consideradas" sem
dizer que em dois dos três o insumo não saiu. Quanto isso vale, na carga real:

```
 saiu_em | linhas | reais pela média de 3 | reais se dividisse pelas aparições
       1 |     19 |                 15,40 |                              46,20
       3 |     56 |                 98,80 |                              98,80
```

Ou seja: a discussão inteira vale **R$ 30,80 de R$ 114,19**, e está concentrada
em **19 linhas** — que agora a tela nomeia. Onde o insumo saiu nos três, as
duas leituras dão o mesmo número, e não há o que decidir.

**Consertado** com `vendas_com_saida`, e a tela escreve "saiu em 1 de 3"
embaixo da média, só quando há o que dizer. A tela mostra a média sobre os três
períodos — a leitura que prevê compra — e diz, na mesma linha, a informação que
permite discordar dela.

**O que a cliente precisa escolher** (uma frase, sem termo técnico):

> Quando um insumo entra no cardápio no meio do mês, a sugestão de compra dele
> deve considerar as semanas anteriores (em que ele ainda não existia) como
> semanas de venda zero, ou deve olhar só as semanas em que ele já estava à
> venda?

Hoje o sistema faz a primeira. A segunda é defensável e **não** está
implementada — e, se ela for a escolhida, o sistema vai precisar saber desde
quando cada ficha existe, que é informação que ele tem (`fichas.criado_em`) mas
que a função não olha.

---

## 6. AJUSTE — a tabela rolava de lado em toda largura

O montador disse "abaixo de ~1500px" e sugeriu subir o corte para `2xl`. O
revisor mediu e mostrou que era em **todas**. Refiz em nove larguras, antes e
depois:

| largura | antes | depois |
|---|---|---|
| 1280 | tabela 1374 / caixa 982 → rola | 1174 / 982 → rola **dentro da caixa** |
| 1440 | 1374 / 1142 → rola | 1174 / 1142 → rola dentro da caixa |
| 1600 | 1374 / 1302 → rola | **1302 / 1302 → não rola** |
| 1920 | 1374 / 1350 → rola | **1350 / 1350 → não rola** |
| 2560 | 1374 / 1350 → rola | **1350 / 1350 → não rola** |

A calha caiu de 12 px para 8 px, e o nome do insumo e a categoria passaram a
truncar de verdade (com `title`), que é o que uma tabela de largura automática
não faz sozinha. Abaixo de 1600 nenhuma tabela de onze colunas cabe — ali a
rolagem continua, mas dentro da caixa. **A página em si nunca rolou de lado, e
continua não rolando**, em nenhuma das nove larguras.

---

## 7. AJUSTE — o guarda de rota: o revisor acertou o lado perigoso e deixou o outro torto

Ataquei a lista branca dele com `matchRoutes` de verdade (react-router-dom
7.18.4, as rotas como o `App.tsx` as declara), em 35 formas de endereço: barra
no fim, barra dupla, `%2e%2e`, maiúscula na página e no prefixo, uuid em
maiúscula, query, hash, dois níveis.

**Zero furos** — inclusive em duas formas que ele não testou e que derrubariam
a lista negra que existia antes, porque o roteador **decodifica** antes de
casar:

```
/contagem/%64ashboard  ->  rota casada: DASHBOARD  |  guarda: false  (barrado)
/contagem/d%61shboard  ->  rota casada: DASHBOARD  |  guarda: false  (barrado)
```

Uma lista negra comparando texto cru diria "isto não é o nome de página
nenhuma" e liberaria — exatamente o furo da maiúscula, com outra roupa. **A
decisão dele de trocar negra por branca está certa, e é mais certa do que ele
provou.**

O que estava torto é o outro lado do mesmo desencontro. O roteador ignora barra
no fim e não olha maiúscula; o guarda comparava texto cru:

```
/contagem/historico/   -> o roteador ABRE o histórico, o guarda mandava embora
/contagem/Historico    -> o roteador ABRE o histórico, o guarda mandava embora
/contagem/<uuid>/      -> o roteador ABRE a folha dele, o guarda mandava embora
```

Não é furo (erra para o lado de negar), mas é a porta do próprio operador
batendo na cara dele por causa de uma barra sobrando num link colado.
**Consertado**: o guarda normaliza como o roteador normaliza. Depois: 0 furos e
0 portas próprias fechadas nos mesmos 35 ataques. Conferido também no
navegador, entrando como operador preso ao setor Bar:

```
/contagem/dashboard   -> /contagem      /contagem/historico   -> abre
/contagem/Dashboard   -> /contagem      /contagem/historico/  -> abre
/contagem/DASHBOARD   -> /contagem      /contagem/Historico   -> abre
/contagem/%64ashboard -> /contagem      /contagem/<uuid dele> -> abre
/contagem/relatorio   -> /contagem      /contagem/<UUID dele> -> abre
/contagem/vendas      -> /contagem      /cmv, /fichas, /cadastros/insumos -> /contagem
```

---

## 8. AJUSTE — a porta que a lista branca abre de propósito

`/contagem/<id>` passa por forma, e id de contagem de **outro restaurante**
também tem forma de id. A RLS faz o certo e devolve zero linha. A tela, não:

```
Não deu para carregar
JSON object requested, multiple (or no) rows returned
```

Isso é o `.single()` do PostgREST aparecendo para quem conta estoque. A recusa
estava certa; a frase era de outra profissão. **Consertado**: "Esta contagem
não existe neste restaurante", com o caminho de volta. Conferido no navegador
com o operador de setor e com o admin.

---

## 9. AJUSTE — `vendas_ref_unica` não é "nome ou código"

A tradução genérica do 23505 mandava procurar um nome repetido quando o que
estava repetido era a **data de fim do período**. Agora:

> Já existe um lançamento de vendas que termina nesta data. Cancele o outro
> antes, ou escolha outra data de fim.

**Sobre a pergunta "erro de usuário ou armadilha?"** (item 6 do pedido): a
unicidade em si é **decisão certa e deliberada** do montador — dois lançamentos
para a mesma data são a planilha duplicada, e o relatório somaria as duas. O
caminho que o revisor achou (descancelar uma venda cujo dia foi reocupado)
**existe no banco** e eu o reproduzi:

```
update vendas set status='cancelada' where referencia='2026-09-10';  -- UPDATE 1
insert into vendas (... referencia='2026-09-10' ...);                -- INSERT 0 1
update vendas set status='aberta'    where referencia='2026-09-10' and titulo like 'semana%';
ERROR:  duplicate key value violates unique constraint "vendas_ref_unica"
```

Mas **não há caminho de tela para descancelar** — `mv_reabrir_venda` exige
`status = 'fechada'`, e a tela não oferece outro. Então hoje é armadilha de
API, não de usuário. O que ficava ruim de verdade era a frase, e é ela que
consertei; quando a importação de PDV ou um botão de descancelar nascer, a
mensagem já estará dizendo a coisa certa.

---

## 10. GRAVE — o tema escuro não escurece (e não é dos dois)

Isto ninguém tinha olhado, e é o achado mais feio desta auditoria.

O sistema tem dois lugares que decidem cor: a **marca do restaurante** (fundo,
superfície, texto — vêm do banco) e a **paleta semântica** (alerta, erro,
sucesso — vêm do CSS, por `:root[data-tema=...]`). O botão "Usar tema escuro"
muda `data-tema`, e **só a segunda metade vira**:

```
data-tema .................. escuro
fundo do corpo ............. rgb(249, 241, 232)   <- claro, veio da marca
--mv-superficie ............ #FFFFFF              <- claro, veio da marca
--mv-alerta-texto .......... #f0be54              <- amarelo claro, para fundo escuro
```

O resultado, medido:

```
texto de alerta (KPI 24px) ..... 1,53:1    (mínimo 3:1)
texto de erro   (KPI 24px) ..... 2,03:1
selo (fundo + texto) ........... 9,18:1    (o par vira junto, e esse está bom)
```

Não é das telas novas: as mesmas **1,53:1** aparecem em `/` ("Falta a contagem
de…") e em `/cmv` ("sem CMV"), que são anteriores a este trabalho. É o sistema
de tema. O print `nav/escuro-relatorio.png` mostra a tela inteira clara com os
números de alerta lavados.

**Não consertei**, e explico por quê: o conserto mexe em como a marca da
cliente é aplicada em **todas** as telas de **todos** os restaurantes, e isso é
decisão dela (a marca é dela, e a validação de contraste da marca já existe em
`validarMarca`). O que fiz foi não piorar: a marca "lido" que eu criei virou
selo (fundo + texto), que atravessa os dois temas — 5,62:1 no claro, 9,18:1 no
escuro.

**O resto da acessibilidade das três telas passou**, medido nas três, nos dois
temas: 0 controles sem nome acessível, 0 ids repetidos, selos de status entre
5,43:1 e 9,18:1, foco visível com contorno de 2px em todos os pontos de tabulação,
e o atalho "Pular para o conteúdo" leva ao conteúdo em 1 tecla. Dois detalhes:
há **dois** `select` com o nome "Restaurante em foco" (o do menu lateral e o da
barra de cima, um deles escondido por CSS), e a barra lateral tem 22 pontos de
tabulação antes do conteúdo — o atalho existe justamente para isso.

---

## 11. NOTA — reaplicar só a 0023 desfaz o conserto de RLS do revisor, em silêncio

O comentário dele na 0024 diz que `drop function` leva o grant junto e por isso
ele re-outorga. Ele viu metade do problema e escreveu a observação ao lado da
outra metade. Medido:

```
-- com a 0024 aplicada
recusa de setor na funcao: true
politica vendas_ler: (mv_pode_operar(restaurante_id) AND (NOT mv_restrito_a_setores()))

-- reaplicando SO a 0023 (o `supabase db push` com o histórico atrás do banco,
-- que é o caso que a própria casa viveu na 0011)
recusa de setor na funcao: false
politica vendas_ler: mv_pode_operar(restaurante_id)
```

As duas metades do GRAVE nº 2 dele voltam ao estado anterior **sem erro
nenhum**, porque a 0023 refaz a função e recria as políticas com o texto antigo.
A suíte não pega isso: ela aplica tudo em ordem, duas vezes, e nessa ordem o
estado final está certo.

Não é defeito da 0024 sozinha — é o modelo de migração da casa (toda migração
recria o que toca). Registro como nota porque a mitigação é de processo, não de
código: **reaplicar uma migração antiga sozinha não é seguro neste repositório**.
A 0026 herda a mesma propriedade, e por isso ela repete, inteira, a recusa de
acesso de setor da 0024 — se eu a tivesse copiado da 0023, teria desfeito o
conserto dele sem que nada acusasse.

Efeito colateral do meu trabalho, que vale dizer: como a 0026 muda a assinatura
da função, reaplicar a 0024 sozinha agora **falha com erro** em vez de reverter
calada (`cannot change return type of existing function`). Falhar alto é melhor
que reverter baixo, mas não é projeto meu — é consequência.

---

## 12. NOTA — a 0024 jogou fora os comentários da função que copiou

A 0024 redefine `mv_relatorio_de_contagem` inteira para acrescentar quatro
linhas de recusa no topo. Comparando o corpo das duas cópias, ignorando
comentários, a diferença é exatamente a recusa e o `grant` — **o código é
fiel**. Mas a cópia perdeu os ~60 comentários da 0023, numa casa onde o
comentário é onde mora a decisão. Quem ler a definição viva da função hoje não
encontra mais o parágrafo que explica por que o intervalo é `(anterior, atual]`.
A 0026 devolve os comentários, porque herdei a cópia inteira.

---

## 13. NOTA — refiz a prova central: a identidade vale em todas as linhas

Sem olhar como eles fizeram, com dados meus, antes e depois das minhas
mudanças:

```
 linhas | computaveis | identidade_ok | identidade_falha | maior_erro
    904 |         897 |           897 |                0 |   0.000000
 consumo_discorda | ideal_discorda | dif_discorda | nulo_incoerente
                0 |              0 |            0 |               0
```

As 7 linhas em que a identidade é **vazia** (não falha) são as de unidade que
não converte, e o padrão de nulos delas é coerente: onde `contagem_atual` é
nulo, `consumo` e `diferenca` também são, e `ideal` — que não depende do atual —
continua afirmado. Confirmo os dois laudos neste ponto.

---

## 14. NOTA — refiz as bordas da sugestão, uma a uma

Cenário meu (restaurante "Auditoria"), números conferíveis de cabeça:

| Borda | Esperado | Medido |
|---|---|---|
| maior (atual 5 > média 2) | não precisa comprar | `pc=f`, sugestão 0 |
| **igual** (atual 2 = média 2) | cai no "senão", sugestão exatamente 0 | `pc=t`, `0.000000` |
| menor (atual 0,5 < média 2) | média − atual | `1.500000` |
| **média nula** (zero venda fechada) | pendência, nunca "não precisa" | média, sugestão e `pc` **nulos** + "nenhuma venda fechada ate 01/08/2026" |
| primeira contagem da casa | nulos + pendência | ant/compras/vendas/consumo/ideal/dif **nulos** + frase |
| venda **cancelada** (10.000 un.) | não entra | `vendas = 0` |
| venda **aberta** (20.000 un.) | não entra | `vendas = 0` |
| venda **de outro restaurante** (50.000 un., data que dominaria o top-3) | não entra | média segue 2, `nv = 3` |
| venda **fora do período** (30.000 un. em 15/08) | não entra | `vendas = 0` |
| venda **no dia da foto anterior** (777 un. em 01/07) | não entra (intervalo aberto no início) | `vendas = 0` |
| nota **no dia da foto anterior** (99 KG em 31/08) | não entra | compras do limão = 7, não 106 |
| 4ª venda mais recente (900 un.) | entra em `vendas`, não na média | `vendas = 906`, média `2` |
| sugestão negativa | impossível pela regra | 0 linhas em 904 |

E, em 904 linhas: `precisa_comprar = false` sem que `contagem_atual > media` →
**0**; `precisa_comprar = true` com `contagem_atual > media` → **0**.

Confirmo os dois laudos. Acrescento as duas bordas que faltavam nos dois: o
insumo que está **só** numa das duas folhas — que é o achado nº 2.

---

## 15. NOTA — o restaurante recém-criado (o caso da cliente hoje)

Com o master trocando de restaurante, nas três telas, sem erro de console:

- **Sem nada** (`Auditoria Nova`): o dashboard diz "Nenhuma contagem ainda" e
  oferece abrir a primeira; o relatório diz que precisa de duas fotos e manda
  para a folha; as vendas dizem "Nenhuma ficha de venda cadastrada" **e**
  explicam que venda se lança em ficha, não em insumo.
- **Com contagem e sem venda** (`Auditoria Vazia`): dashboard e relatório
  abrem; a sugestão inteira vem "Não se sabe", com o motivo certo.

Isto é crédito do montador, e passou sem retoque.

---

## 16. NOTA — salvar venda não rebaixa o catálogo

O pecado do `754bbfe` (derrubar o catálogo inteiro a cada gravação) **não se
repete**. Contadas as idas ao servidor no navegador:

```
abrir a tela de vendas ..... 10  (sessão + vendas + fichas)
abrir o formulário .........  0
escolher uma ficha .........  0
SALVAR o lançamento ........  4  (POST vendas, GET vendas, GET venda_itens, GET vendas)
FECHAR o lançamento ........  2  (rpc/mv_fechar_venda, GET vendas)
```

Nenhuma releitura de `vw_fichas_completas` nem de produtos. A invalidação é por
chave: salvar item mexe só no lançamento; fechar derruba o prefixo `relatorio`,
que é o certo, porque fechar muda a média de três semanas de uma vez. Uma sobra
pequena: `GET vendas` acontece duas vezes ao salvar (duas invalidações da mesma
chave). Não consertei — é uma leitura de uma linha por período.

---

## 17. NOTA — "venda e ficha de restaurantes diferentes" quase nunca era verdade

O revisor registrou no último commit dele que o operador preso a setor recebia
essa frase ao tentar inserir item numa venda. A suíte da casa mostra que o caso
é mais amplo: o teste "ficha de outro restaurante não entra na venda" passava
por essa mesma frase, e **sob RLS a Maia nem enxerga a ficha da Prova** — o
gatilho não tinha restaurante nenhum para comparar. A frase afirmava uma causa
que o gatilho não mediu, e mandava procurar defeito num cadastro correto.
**Consertado**: o gatilho nomeia as duas possibilidades ("não encontrado, ou
fora do seu acesso") e mantém "restaurantes diferentes" para quem enxerga os
dois lados.

---

## O que eu NÃO consegui provar

1. **Que algum zero inventado específico esconde um estoque diferente de
   zero.** Provei que o produto existia, que tinha setor, e que a folha o
   omitiu. Qual era o estoque real naquele dia não existe em lugar nenhum — é
   exatamente por isso que o número não deve ser afirmado.
2. **Que a carga 0003 pode ser corrigida sem risco.** Não mexi nela e não a
   testei em cópia da produção da cliente. O custo que escrevi em §1 é leitura
   do arquivo, não experimento.
3. **Desempenho em aparelho real.** As medidas de celular são Chromium neste
   contêiner, com CPU 4× freada e **servidor de desenvolvimento** — o build de
   produção é mais rápido nos dois lados. O que a comparação sustenta é a
   razão entre antes e depois, não o número absoluto.
4. **O tema escuro de ponta a ponta.** Medi contraste calculado em amostras de
   texto nas três telas novas e em duas antigas. Não auditei as 20 telas da
   casa, nem os gráficos do CMV.
5. **Que a rolagem horizontal sumiu em monitor de verdade.** Medi em nove
   larguras de viewport no mesmo navegador; não tenho monitor físico.
6. **O teto de 10 níveis, a importação de PDV e o isolamento entre
   restaurantes.** O revisor mediu os três; não refiz — ele mostrou comando e
   saída, e meus próprios testes de isolamento (restaurante "Auditoria Outra"
   na janela da média) são consistentes com o que ele relatou.
7. **Que o `GET vendas` duplicado não aparece em outras telas.** Medi a tela de
   vendas; não varri o resto.
