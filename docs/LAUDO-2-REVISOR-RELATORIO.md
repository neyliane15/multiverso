# Laudo — Agente 2 (Revisor) · Vendas, dashboard e relatório de contagem

Branch `claude/clever-mccarthy-nnbtas`. Nada empurrado, nenhum PR aberto.

Banco próprio: `revisao_vendas`, criado do zero com
`supabase/testes/00_ambiente_supabase.sql` + as 24 migrações. Os bancos
`multiverso` e `multiverso_app` não foram usados para prova — exceto o
`multiverso_app` no item 9 (navegador), que é a pilha local e é onde a tela
roda; ali apliquei a 0024 para o navegador exercitar o código de agora, e
desfiz a única linha de dado que criei (`perfil_setores` do `estoque@`).

Dados de venda e de compra do Bar do Zeca: **meus**, não os dele. Quatro e
depois doze lançamentos de 69 fichas, duas notas (uma dentro e uma fora do
período), construídos por `/tmp/claude-0/-home-user/ea7223e1-0cfd-5570-ae56-c7244317aec2/scratchpad/rev/dados.sql`. O
relatório resultante tem **904 linhas** (ele relatou 882 com os dados dele).

---

## Sumário

| Nº | Classe | Achado | O que fiz |
|---|---|---|---|
| 1 | **GRAVE** | O furo de rota que ele anunciou fechado continuava aberto: maiúscula passava | **Consertei** (`fb57792`) |
| 2 | **GRAVE** | A RLS não segurava nada disso: operador de setor lia e lançava venda da casa, e lia o relatório inteiro com números de uma aba só | **Consertei** (`11dfed1`) |
| 3 | **GRAVE** | O zero inventado tem DUAS pontas, não uma; a segunda não está documentada e é pior | Deixei para decisão da cliente, com os números |
| 4 | AJUSTE | "Não se sabe" culpava a venda em 100% das linhas em que a culpa era da folha | **Consertei** (`110ba1d`) |
| 5 | AJUSTE | O relatório não pagina: 882 linhas e 58.771 nós no DOM, 295.238 px de altura em 390 px; a UI congela 5,2 s | Deixei para decisão da cliente |
| 6 | AJUSTE | Venda FECHADA não é imutável: cabeçalho (inclusive `referencia`) muda por API | Deixei para decisão da cliente |
| 7 | NOTA | §7.5 dele está errada na direção: a tabela rola na horizontal em TODAS as larguras, até 1920 px | — |
| 8 | NOTA | `vendas_consideradas` global: medido um caso de subestimação de 7,3× | Confirmei o alerta dele |
| 9 | NOTA | **Falso alarme**: o desempenho que ele não mediu está em 224 ms, não perto de 2 s | Medido |
| 10 | NOTA | **Prova cruzada passou**: DIFERENÇA = VENDAS − CONSUMO em 897/897 linhas computáveis, erro 0 | Medido |
| 11 | NOTA | **Falso alarme**: a conta da explosão bate em 400 de 412 pares; as 12 restantes são arredondamento de 6·10⁻⁶ | Reescrita e comparada |

---

## 1. GRAVE — o furo de rota continuava aberto, bastava uma maiúscula

O commit `d3f76e7` anuncia "um furo de rota fechado no caminho" e troca o
prefixo liberado por uma **lista negra** dos nomes das páginas:

```ts
const PAGINAS_DE_CONTAGEM = ['historico', 'dashboard', 'relatorio', 'vendas']
...
return !PAGINAS_DE_CONTAGEM.includes(resto)
```

A lista negra compara texto cru. O React Router **não** compara texto cru:
`caseSensitive` é falso por omissão. Medido com `matchRoutes` de verdade
(react-router-dom 7.18.4, nesta árvore, com as rotas como `App.tsx` as declara):

```
/contagem/Dashboard -> rota casada: /contagem/dashboard | guarda permite: true
/contagem/DASHBOARD -> rota casada: /contagem/dashboard | guarda permite: true
/contagem/Relatorio -> rota casada: /contagem/relatorio | guarda permite: true
/contagem/Vendas    -> rota casada: /contagem/vendas    | guarda permite: true
```

O roteador monta o `DashboardDaContagem`; o guarda responde "pode". O operador
preso ao bar continuava abrindo o estoque, o consumo e a venda da casa inteira
digitando o endereço com uma letra maiúscula.

**Consertado** com lista BRANCA (`web/src/rotas.ts`): depois de `/contagem/`
passa o que tem cara de id (uuid) e nada mais. Isso fecha também o segundo furo
da forma antiga — página nova nascia **liberada**. Oito casos novos em
`rotas.test.ts`.

Verificado no navegador de verdade, entrando como operador preso ao setor Bar:

```
/contagem/dashboard  -> /contagem
/contagem/Dashboard  -> /contagem
/contagem/relatorio  -> /contagem
/contagem/Relatorio  -> /contagem
/contagem/vendas     -> /contagem
/contagem/VENDAS     -> /contagem
/cmv                 -> /contagem
/contagem/historico  -> /contagem/historico   (continua abrindo, como deve)
```

## 2. GRAVE — a RLS não era a tranca do cofre; era nada

O comentário que ele escreveu em `rotas.ts` diz por que o guarda importava:

> "A RLS continuaria recortando o que ele enxerga — e é justamente esse o
> problema: ele veria um dashboard com o total de um setor só, com cara de
> total da casa."

Isso descreve o problema e **para ali**. Medi a outra metade. Com identidade de
verdade (`set local role authenticated` + `set_config('request.jwt.claim.sub',
…, true)` **dentro** da transação), um operador preso ao setor "Bar":

```
 restrito?                        | true
 LE vendas da casa                | 10
 LE venda_itens da casa           | 30
 LE vw_contagem_procedencia       | 6
 linhas do RELATORIO (C1)         | 15      <- as MESMAS 15 do operador livre
--- consegue LANCAR venda?   INSERIU venda: 1
--- consegue por ITEM e FECHAR?   FECHOU: fechada
```

E a mesma contagem, com itens em duas abas (Bar e Cozinha), lida pelos dois:

| produto | operador livre | operador preso ao Bar |
|---|---|---|
| B_IGUAL | atual 1002,000 · consumo −902,000 · precisa_comprar **f** | atual 2,000 · consumo 98,000 · precisa_comprar **t** |
| B_MAIOR | atual 1005,000 · consumo −905,000 | atual 5,000 · consumo 95,000 |
| TOMATE  | atual 1007,000 · consumo −987,000 | atual 7,000 · consumo 13,000 |

Nenhuma coluna e nenhuma pendência diziam que faltava uma aba. É literalmente o
cenário que ele descreveu como motivo para consertar a rota — e a rota era a
única tranca que existia. "Número errado é pior que número ausente" está
escrito na 0005.

**Consertado** com a migração `20260901000024_venda_nao_e_do_operador_de_setor.sql`:

- `vendas` e `venda_itens` passam a exigir `not mv_restrito_a_setores()`, com o
  precedente exato de `contagens_criar`/`contagens_editar` (0018). Venda não tem
  setor para recortar: ou é a casa, ou é recusa.
- `mv_relatorio_de_contagem` **recusa** de cara para acesso de setor, porque ele
  atravessa setores por construção.

Medido depois: operador preso lê 0 vendas, 0 itens, leva recusa
`%acesso e de setor%` no relatório e `%row-level security%` no insert — e
**continua lendo a folha do setor dele** (14 linhas de `contagem_itens`). O caso
bom não quebrou: admin e operador livre seguem lendo e lançando. Oito casos
novos em `20_fluxos.sql`. A migração aguenta segunda e terceira passada.

## 3. GRAVE — o zero inventado tem duas pontas, e a que ele não documentou é pior

Ele marcou isto como o ponto mais contestável (§7.1) e discutiu **uma** ponta:
produto ausente da folha ANTERIOR → `contagem_anterior = 0`. A migração tem a
outra, e ela não está no laudo nem no cabeçalho da 0023:

```sql
case when atual.pid is null then
  'este item nao esta na folha desta contagem; o estoque atual foi lido como zero' end
```

### 3.1 O zero é afirmável?

Não, e dá para provar. As duas pontas se distinguem pela **escala** do numérico
(`coalesce(x, 0)` devolve escala 0; `round(sum(...), 6)` devolve escala 6):

```
B_SEM_VENDA_SEM_ESTOQUE ant=0.000000 escala=6   <- zero CONTADO
SAL                     ant=0        escala=0   <- zero INVENTADO
SO_NA_ANTERIOR          atu=0        escala=0   <- zero INVENTADO
```

O argumento dele é "o produto é novo, então tinha zero mesmo" — o caso do SAL
que entrou por nota no meio do período. Medi na carga real do Bar do Zeca, nas
50 linhas que recebem `contagem_anterior = 0` por ausência:

```
 total_50 | com_vinculo_de_setor | estava_mesmo_na_anterior
       50 |                   50 |                        0
```

Todos os 50 **já estavam no catálogo e já tinham vínculo de setor**. A folha
anterior tinha 868 linhas para 906 produtos: ela simplesmente não os incluiu. O
zero não é "o que a foto registra" — é o que o sistema escreve no lugar de uma
foto que não existe. (O `criado_em` não serve de álibi aqui: a carga carimba
todos os produtos no mesmo instante. E a função não olha `criado_em` nenhum.)

### 3.2 O que acontece com CONSUMO, IDEAL e DIFERENÇA

Caso concreto, meu cenário, com o SAL que entrou por nota de 4 KG no meio do
período e foi contado em 1 KG na foto nova:

```
 SAL | ant 0 (inventado) | compras 4 | vendas 906 | atual 1 | consumo 3 | ideal -902 | dif 903
```

Se o anterior verdadeiro fosse 10 KG, a mesma linha seria consumo **13**, ideal
**−892**, diferença **893**. Ou seja, um erro `X` no anterior entra inteiro:

- **CONSUMO** sai subestimado em `X`
- **IDEAL** sai subestimado em `X`
- **DIFERENÇA** sai **superestimada** em `X` — e diferença positiva é "sobrou
  mais do que a venda explica". O relatório manda o gerente procurar erro de
  contagem ou sobra inexplicada onde há cadastro incompleto. É exatamente a
  inversão que ele evitou de propósito no caso do limão (§2.1).

### 3.3 A ponta que ele não discutiu é pior, e custa dinheiro

Produto ausente da folha **ATUAL** não tem o álibi "é novo": ele está no
catálogo hoje. O zero ali é invenção pura, e empurra o consumo para cima
(afirma que saiu tudo) e a diferença para baixo.

Medido no relatório de 01/10 do Bar do Zeca com os meus dados (904 linhas):

| caso | linhas | consumo afirmado | compra sugerida | "precisa comprar" |
|---|---|---|---|---|
| anterior lido como zero | 50 | R$ 1.939,12 | R$ 1.720,28 | 39 |
| **ATUAL lido como zero** | 36 | R$ 1.822,28 | R$ 1.756,40 | **36 de 36** |

As 36 linhas cujo estoque nunca foi contado recebem `precisa_comprar = true`
**sem exceção**, com R$ 1.756,40 de compra sugerida sobre um número que a casa
não mediu. Na pilha local (dados dele, 882 linhas), **3 das 5** linhas de compra
do relatório — R$ 152,14 de R$ 267,65 — repousam num `contagem_atual` inventado:

```
 XAROPE DE MARACUJA | atual 0 (escala 0) | sugestao 7,96 | R$ 121,07 | atual inventado: t
 ESPUMA DE GENGIBRE | atual 0 (escala 0) | sugestao 4,64 | R$  29,61 | atual inventado: t
 XAROPE DE ACUCAR   | atual 0 (escala 0) | sugestao 4,36 | R$   1,46 | atual inventado: t
```

### 3.4 Sentença

O zero **não é afirmável** e a regra da casa ("número errado é pior que número
ausente", 0005) está do lado do nulo. Mas a troca por nulo esvazia 86 das 904
linhas e é mudança de semântica do produto, então **não a fiz**: é decisão da
cliente. O que eu recomendo, em ordem de custo:

1. **Mínimo, e eu defendo como defeito, não como escolha:** quando
   `contagem_atual` foi lido como zero por ausência, `sugestao` e
   `precisa_comprar` devem ser nulos (`sem_base`), porque recomendar compra em
   cima de estoque não medido é gastar dinheiro num chute. São 36 linhas e
   R$ 1.756,40 no meu cenário; 3 linhas e R$ 152,14 na carga dele.
2. Devolver nulo nas duas pontas, mantendo a pendência.
3. Se a cliente quiser o zero, ele precisa de álibi medido: `produtos.criado_em
   > contagem_anterior.fechada_em`. Hoje a função não olha nada.

## 4. AJUSTE — "Não se sabe" apontava para o lado errado, em 100% dos casos

`julgarSugestao` tinha dois motivos para o estado `sem_base`; o banco tem três
causas. `precisa_comprar` também é anulado quando **`contagem_atual`** é nulo —
folha lançada em unidade que não converte. Essa terceira caía na segunda por
omissão ("Algum insumo desta venda está sem conversão de unidade").

Medido no relatório de 01/10, carga real:

```
 sem_base_total | motivo_certo_sem_venda | motivo_certo_venda | motivo_ERRADO_culpa_a_venda
              5 |                      0 |                  0 |                           5
```

As 5 linhas "Não se sabe" eram **todas** do terceiro caso (APERITIVO DE CARNE
(ALCATRA) contado em UND com produto em KG, NHOQUE 150gr contado em KG com
produto em UND) e todas mandavam arrumar a ficha quando o errado era a folha. A
coluna de pendência dizia a verdade logo acima; a célula do julgamento apontava
para o outro lado. **Consertado** (`110ba1d`), com um caso novo.

## 5. AJUSTE — o relatório não pagina, e no celular isso trava a tela

A pergunta era "a tabela pagina sem perder linha?". Ela **não pagina**: desenha
as 882 linhas de uma vez, e não há paginador nenhum (`getByRole('button',
{name:/próxim|anterior|página/})` → 0). Nenhuma linha se perde — o contador diz
`882 de 882` e volta a 882 depois de limpar a busca. O custo:

```
DOM: 58.771 nós | tbody tr: 882 | cartões no DOM: 882
```

E os **dois desenhos estão sempre no DOM**: a 390 px e a 1480 px o número é o
mesmo (58.771), porque `hidden xl:table` / `xl:hidden` escondem por CSS mas
montam as duas árvores. Quem está no celular paga a tabela de onze colunas; quem
está no desktop paga os 882 cartões.

No celular, com CPU 4× mais lenta (aparelho médio) e viewport de 390 px:

```
altura da pagina: 295.238 px (viewport 844)  -> 350 telas de rolagem
filtrar para "limao":              848 ms
limpar a busca (voltar as 882):  5.164 ms    <- UI congelada
"So o que comprar":             2.099 ms
```

O print de página inteira a 390 px **estourou 30 s** e não foi tirado. Isto é
pior que o §7.5 dele (rolagem horizontal) e é justamente a largura que ele
admite não ter olhado. Não consertei: virtualização ou paginação muda a tela e é
decisão da cliente.

Do lado bom, a 390 px: **nenhuma rolagem horizontal de página** em
`/contagem/dashboard`, `/contagem/relatorio` e `/contagem/vendas`
(`scrollWidth == clientWidth == 390` nas três), nenhum elemento estourando a
calha, nenhum erro de console.

## 6. AJUSTE — venda fechada não é imutável; só os itens dela são

O laudo diz "venda fechada é imutável, como contagem fechada". O gatilho
`mv_venda_bloqueada` protege `venda_itens`. O cabeçalho de `vendas` não tem
gatilho nenhum. Como admin, dentro de transação com identidade:

```
antes:  2026-07-19 fechada R$7550.0000
DEPOIS: 2026-07-20 fechada R$1.0000
```

`referencia` mexida numa venda fechada **muda o período de relatório em que ela
cai**, e `total_valor`/`total_itens` — que existem para congelar o valor —
passam a contradizer os itens. A comparação com `contagens` é honesta (lá o
cabeçalho também é mutável), mas a palavra "imutável" promete mais do que o
banco entrega. A tela não expõe isso (`const trancado = venda?.status ===
'fechada'` desabilita os três campos), então o caminho é só por API. Deixei para
decisão da cliente: um gatilho em `vendas` seria o conserto, e vale decidir junto
o que `contagens` faz.

Nota de borda, na mesma tabela: `vendas_ref_unica` é índice parcial
(`where status <> 'cancelada'`), então duas canceladas na mesma data passam —
e **descancelar** uma venda cujo dia já foi reocupado bate em
`duplicate key value violates unique constraint "vendas_ref_unica"`. Não há hoje
caminho de tela para descancelar; se nascer um, precisa tratar esse erro.

## 7. NOTA — §7.5 dele está errada na direção

Ele diz que a tabela "rola na horizontal abaixo de ~1500px". Medido em nove
larguras:

```
  390 tabela:não (cartões)    768 tabela:não    1024 tabela:não
 1280 tabela 1426px em caixa de  982px -> rola
 1366 tabela 1426px em caixa de 1068px -> rola
 1440 tabela 1426px em caixa de 1142px -> rola
 1480 tabela 1426px em caixa de 1182px -> rola
 1600 tabela 1426px em caixa de 1302px -> rola
 1920 tabela 1426px em caixa de 1350px -> rola
```

A caixa satura em 1350 px (largura máxima do contêiner), então a tabela de onze
colunas rola **em toda largura de desktop, inclusive 1920**. Subir o corte para
`2xl`, como ele sugere, não resolveria: não existe largura em que ela caiba. A
página em si nunca estoura, o que é o certo.

## 8. NOTA — `vendas_consideradas` global: o alerta dele procede, com número

Ele avisou (§7.6) que a coluna é global e que nenhum teste cobre o caso. Montei
um: CACHAÇA vendida em **1** das 3 vendas da janela.

```
 produto | vendas    | media_3_vendas | vendas_consideradas | sugestao
 CACHACA | 13,126083 |       4,375361 |                   3 | 1,375361
 (a explosao por venda: so V3, 2026-07-19, 13,1261)
```

A coluna afirma "3 vendas consideradas" para um insumo que apareceu em uma. Se
ele é novo no cardápio, a média honesta é 13,13 e a sugestão 10,13 — contra
1,38 escrita na tela, **7,3× menos**. Não é defeito da fórmula (semana sem
vender é semana de zero, e ele está certo nisso); é que a coluna não distingue
"vendeu 0" de "não existia", e a tela não tem como avisar. Confirmo o alerta e
deixo para a cliente.

## 9. NOTA — falso alarme: o desempenho que ele não mediu

§7.4: "a casa real vende 69 fichas por semana... vale medir antes de prometer a
tela. Não medi isso". Medi, com os 906 produtos e 868 itens de contagem do Bar
do Zeca e **doze** lançamentos de 69 fichas (828 itens de venda):

```
# caso real (contagem mensal 01/10 contra 31/08: 5 dos 12 lancamentos no periodo)
Function Scan on mv_relatorio_de_contagem (actual time=177.188..177.242 rows=904)
  Buffers: shared hit=28678
  Execution Time: 177.329 ms          (repeticoes: 154 / 179 / 206 / 253 ms)

# caso duro (TODOS os 12 lancamentos dentro do periodo)
Function Scan on mv_relatorio_de_contagem (actual time=224.291..224.344 rows=904)
  Buffers: shared hit=38556
  Execution Time: 224.400 ms          (repeticao: 226,5 ms)
```

**224 ms**, não perto de 2 s. Onde está o custo, medido peça por peça:

```
mv_vendas_por_produto de UM lancamento de 69 fichas .... 16,9 ms  (103 produtos)
mv_fator_para_produto nos 868 itens da contagem atual ... 0,70 ms
mv_fator_para_produto nos 868 itens da anterior ......... 0,27 ms
```

Tudo está na explosão da árvore: ~17 ms por lançamento, e o relatório explode
(lançamentos do período + 3 da janela da média) = 15 chamadas no caso duro,
15 × 17 ≈ 255 ms, que é o que o `explain` mostra. A conversão de unidade das
1.736 linhas de contagem é ruído (<1 ms). Para passar de 2 s seriam necessários
~120 lançamentos num só período — importação diária de PDV por quatro meses
entre contagens. Se um dia for o caso, a economia óbvia está em `tres` e
`vendidas` explodirem os mesmos lançamentos duas vezes.

## 10. NOTA — a prova cruzada passou, em todas as linhas

`DIFERENÇA = VENDAS − CONSUMO` (gabarito §2), rodada contra o relatório
inteiro, duas vezes (antes e depois de eu mudar os dados no item 9):

```
 total | computaveis | identidade_ok | identidade_falha | padrao_nulo_incoerente | maior_erro
   904 |         897 |           897 |                0 |                      0 |   0.000000
```

**Zero falhas. Erro máximo 0.** Não é arredondamento sortudo: as quatro pontas
já saem de `round(..., 6)`, então as somas são exatas em 6 casas e o
arredondamento final é inócuo. Conferi também, na mesma passada:

- `consumo = anterior + compras − atual` → 0 linhas discordam
- `ideal = anterior + compras − vendas` → 0 linhas discordam
- `diferenca = atual − ideal` → 0 linhas discordam

As 7 linhas em que a identidade é **vazia** (não falha) são coerentes: `consumo`
nulo porque uma das pontas de contagem não converte de unidade, com `vendas`
afirmado e `diferenca` nulo. O padrão de nulos nunca é incoerente (coluna
`padrao_nulo_incoerente = 0`): não existe linha com diferença afirmada e venda
ou consumo ausente, nem o contrário.

As 7 linhas, com o motivo de cada:

```
 APERITIVO DE CARNE (ALCATRA)  | a contagem lancou este item em UND, que nao converte para KG
 CARNE ASSADA SANDUICHE (120g) | a contagem lancou este item em KG, que nao converte para UND
 CAVALO DO REI (250G)          | a contagem lancou este item em KG, que nao converte para UND
 FILÉ DE TILÁPIA               | a contagem anterior lancou este item em unidade que nao converte
 MASSA DE PASTEL               | a contagem lancou este item em UND, que nao converte para KG
 NHOQUE 150gr                  | a contagem lancou este item em KG, que nao converte para UND
 SACO Á VÁCUO (20x30)          | a contagem anterior lancou este item em unidade que nao converte
```

## 11. NOTA — falso alarme: a conta da explosão bate

Reescrevi `mv_vendas_por_produto` do zero (`rev_vendas_por_produto`), com CTE
recursiva descendo a árvore com um peso acumulado — não plpgsql recursivo linha
a linha — e sem olhar a implementação dele: só `ficha_itens`,
`mv_fator_para_produto` e `mv_fator_unidade`. Comparei **todos** os pares, não
cinco amostras:

```
 pares | iguais | diferentes | nulo_so_de_um_lado | marca_diferente |        maior_erro
   412 |    400 |         12 |                  0 |               0 | 0.0000343201236804
```

12 de 412 diferem, e **só** nos três insumos cuja perda não fecha em 4 casas
decimais (`perda_percentual` 28,571 / 16,667 / 11,765, que já são 2/7, 1/6 e
2/17 arredondados). A causa é o `round(r.quantidade / (1 - perda/100), 4)` dele:

```
 CEBOLA          0,0500 KG @ 28,571% -> bruta exata 0,06999958000252 -> arredondada 0,0700
 LOMBO SUÍNO     0,1000 KG @ 16,667% -> bruta exata 0,12000048000192 -> arredondada 0,1200
 PEITO DE FRANGO 0,1500 KG @ 11,765% -> bruta exata 0,17000056666856 -> arredondada 0,1700
```

Erro relativo máximo **6,0 × 10⁻⁶** (0,0006%), absoluto 3,4 × 10⁻⁵. É
arredondamento, não defeito — e na direção **boa**: o `round(...,4)` encaixa
0,06999958 em 0,0700, que é o número que a cozinheira escreveu. Decidido com
número: nada a consertar.

Os quatro casos do gabarito, com a função dele:

| Caso | Gabarito | Medido |
|---|---|---|
| A — 100 caipirinhas, 60 ML de garrafa de 965 ML | 6,2176 UND | **6,217617** |
| B — o mesmo com 10% de perda | 6,9085 | **6,908466** |
| C — 50 massas, MOLHO rende 10 KG ← TOMATE 2 KG | 3 KG de tomate | **3,000000** |
| D — 50 G de limão por UND sem conteúdo | nulo + motivo | **nulo**, `fator_ausente=t`, `"LIMAO" entra em "LIMONADA" em G, que nao converte para a unidade de compra` |

---

## 12. As bordas da sugestão de compra, uma por uma (item 2 do pedido)

Cenário meu, restaurante "Revisao", 15 produtos, 38 fichas, 10 lançamentos.
Contagem atual 01/08, anterior 01/07, **7 vendas fechadas** até 01/08.

```
      produto_nome       |    ant     | compras  |   vendas   |    atu    | consumo  |    ideal    |    dif     |  media   | nv | sugestao | pc
 B_MAIOR                 | 100.000000 |        0 | 906.000000 |  5.000000 | 95.00000 | -806.000000 | 811.000000 | 2.000000 |  3 |        0 | f
 B_IGUAL                 | 100.000000 |        0 | 906.000000 |  2.000000 | 98.00000 | -806.000000 | 808.000000 | 2.000000 |  3 | 0.000000 | t
 B_MENOR                 | 100.000000 |        0 | 906.000000 |  0.500000 | 99.50000 | -806.000000 | 806.500000 | 2.000000 |  3 | 1.500000 | t
 B_SEM_VENDA_COM_ESTOQUE |  50.000000 |        0 |          0 |  3.000000 | 47.00000 |   50.000000 | -47.000000 |        0 |  3 |        0 | f
 B_SEM_VENDA_SEM_ESTOQUE |   0.000000 |        0 |          0 |  0.000000 |  0.00000 |    0.000000 |   0.000000 |        0 |  3 | 0.000000 | t
 LIMAO                   |   5.000000 |        0 |            |  2.000000 |  3.00000 |             |            |          |  3 |          |
 SO_VENDA_CANCELADA      |   0.000000 |        0 |          0 |  0.000000 |  0.00000 |    0.000000 |   0.000000 |        0 |  3 | 0.000000 | t
 SO_VENDA_ABERTA         |   0.000000 |        0 |          0 |  0.000000 |  0.00000 |    0.000000 |   0.000000 |        0 |  3 | 0.000000 | t
 SO_VENDA_FUTURA         |   0.000000 |        0 |          0 |  0.000000 |  0.00000 |    0.000000 |   0.000000 |        0 |  3 | 0.000000 | t
 SO_VENDA_NA_BORDA       |   0.000000 |        0 |          0 |  0.000000 |  0.00000 |    0.000000 |   0.000000 |        0 |  3 | 0.000000 | t
 SAL                     |          0 | 4.000000 | 906.000000 |  1.000000 |  3.00000 | -902.000000 | 903.000000 | 2.000000 |  3 | 1.000000 | t
 SO_NA_ANTERIOR          |   9.000000 |        0 |          0 |         0 |  9.00000 |    9.000000 |  -9.000000 |        0 |  3 |        0 | t
```

| Borda pedida | Esperado pela regra literal | Medido | |
|---|---|---|---|
| **maior** (atual 5 > média 2) | "Não precisa comprar" | `pc=f`, sugestão 0 | ok |
| **igual** (atual 2 = média 2) | não é maior → cai no senão, sugestão exatamente 0 | `pc=t`, sugestão `0.000000` | ok |
| **menor** (atual 0,5 < média 2) | média − atual = 1,5 | sugestão `1.500000` | ok |
| **média nula** (nenhuma venda fechada) | pendência, nunca "não precisa comprar" | `media`, `sugestao`, `pc` **nulos** + `nenhuma venda fechada ate 15/06/2026: sem media para sugerir compra` | ok |
| **1 venda só** | média do que houver, dizendo quantas | `nv=1`, média 4/1 = `4.000000` | ok |
| **2 vendas** | idem | `nv=2`, média (4+4)/2 = `4.000000` | ok |
| **4 vendas, só as 3 últimas** | 7 vendas fechadas ≤ 01/08; média de B_MAIOR = (1+2+3)/3 | `nv=3`, média `2.000000` — e a venda de **900** de 05/07 **não** entra na média | ok |
| **venda cancelada** | não entra | 10.000 unidades em 29/07 → `vendas = 0` | ok |
| **venda aberta** | não entra | 20.000 unidades em 30/07 → `vendas = 0` | ok |
| **venda de outro restaurante** | não entra | 4 vendas de "Revisao Outra" em 21–24/07, que dominariam o top-3 se o filtro faltasse; média segue 2 e `nv=3` | ok |
| **venda fora do período** | não entra | 30.000 em 15/08 (depois do fim) → `vendas = 0`; 777 em 01/07 (= dia da foto anterior, intervalo aberto no início) → `vendas = 0` | ok |
| **primeira contagem da casa** | nulos + pendência | ant/compras/vendas/consumo/ideal/dif **nulos** + `sem contagem anterior fechada` | ok |
| **sugestão negativa** | impossível pela regra, `greatest(...,0)` protege | nenhuma linha negativa em 904 | ok |

A nota emitida **no dia** da foto anterior também fica fora, nos dois cenários:
`SAL-FORA` de 99 KG em 01/07 → `compras = 4`, não 103. No Bar do Zeca, a nota
`REV-FORA` de 99 KG em 31/08 não aparece em nenhuma das 904 linhas.

E a média usa uma janela **diferente** do período do relatório, de propósito: a
venda de 900 unidades de 05/07 entra em `vendas` (906 = 900+1+2+3) e **não**
entra na média (2). Está documentado na 0023 e confere.

## 13. Segunda passada das migrações e os grants (item 4 do pedido)

As 24 migrações aplicadas **três** vezes seguidas com `ON_ERROR_STOP=1` sobre o
banco já pronto e com a carga inteira: nenhum erro, só `NOTICE ... skipping`.
Grants de `authenticated` em `public`, lidos de `information_schema.role_table_grants`
antes da 0023, depois dela e depois da segunda passada:

```
=== DIFF ANTES vs DEPOIS (todas) ===
> venda_itens DELETE / INSERT / SELECT / UPDATE
> vendas      DELETE / INSERT / SELECT / UPDATE
> vw_contagem_procedencia SELECT
=== DIFF DEPOIS vs 2PASS ===
(identico)
```

As três vistas antigas mantêm o `SELECT` nas três leituras:

```
vw_ficha_itens        SELECT  (antes / depois / 2a passada)
vw_fichas_completas   SELECT  (antes / depois / 2a passada)
vw_produtos_completos SELECT  (antes / depois / 2a passada)
```

E os `grant execute` das funções novas sobrevivem (de `pg_proc.proacl`):

```
mv_produtos_da_ficha      authenticated=X/postgres
mv_vendas_por_produto     authenticated=X/postgres
mv_relatorio_de_contagem  authenticated=X/postgres
mv_fechar_venda           authenticated=X/postgres
mv_reabrir_venda          authenticated=X/postgres
```

A 0024 também aguenta reaplicação (rodada duas vezes isolada e mais duas vezes
dentro da suíte). Nada a reportar aqui: o item passa.

## 14. Isolamento entre restaurantes, nos dois sentidos (item 5 do pedido)

Com identidade de verdade, dentro da transação (fora dela `current_user` é
`postgres` e `auth.uid()` é nulo — conferi antes de começar, para não cair na
armadilha que a casa já viu):

| O que | Admin A olhando o B | Admin B olhando o A |
|---|---|---|
| `vendas` | 0 (e 10 do seu) | 0 (e 4 do seu) |
| `venda_itens` | 0 (e 30 do seu) | 0 (e 4 do seu) |
| `vw_contagem_procedencia` | 0 (e 6 do seu) | 0 (e 2 do seu) |
| `mv_vendas_por_produto` de uma venda do outro | 0 linhas | 0 linhas |
| `mv_relatorio_de_contagem` de uma contagem do outro | `ERROR: contagem <NULL> nao encontrada` | `ERROR: contagem <NULL> nao encontrada` |
| `insert into vendas` no restaurante do outro | `ERROR: new row violates row-level security policy for table "vendas"` | — |

## 15. Ficha de produção não se vende (item 6 do pedido)

```
-- INSERT de item com ficha de producao
ERROR:  a ficha "MOLHO" e uma producao: producao e insumo interno e nao se vende
-- UPDATE trocando a ficha de um item bom por uma producao (o gatilho e BEFORE INSERT OR UPDATE)
ERROR:  a ficha "MOLHO" e uma producao: producao e insumo interno e nao se vende
-- e producao DENTRO de outra ficha continua funcionando
MASSA AO MOLHO usa producao MOLHO -> explode em TOMATE = 0.06 KG por porcao
```

A tela também não oferece: `web/src/paginas/contagem/Vendas.tsx` monta as
candidatas de `fichas.data.filter(f => f.ativo && !f.producao)`, e o tipo
`FichaCompleta` passou a ter a coluna (o `any` que ele fechou em `d3f76e7`).

## 16. Unidade incompatível: o que a tela faz com a linha (item 7 do pedido)

No banco, confirmado: volta `quantidade` nula + motivo que nomeia o insumo,
nunca 0 (item 11, caso D). Na tela, a linha **não some e não vira zero** — ela
aparece **marcada**:

- `Numero` devolve `—` para nulo (`if (valor === null) return <span>—</span>`),
  então as células de venda, ideal e diferença ficam explicitamente vazias;
- a linha inteira recebe `bg-alerta-suave/30` (`const semResposta =
  julgarSugestao(linha).veredito === 'sem_base'`), na tabela **e** no cartão;
- a pendência aparece em texto sob o nome do insumo;
- a célula de sugestão mostra o selo "Não se sabe" com o motivo (e, depois do
  item 4, o motivo certo).
- os filtros a preservam: "Só o que comprar" guarda `sem_base` de propósito, e
  "Só com pendência" obviamente também. A ordenação joga nulo para o fim em
  qualquer coluna numérica, em vez de tratá-lo como zero.

Medido na tela: 5 linhas "Não se sabe" na tabela, 5 nos cartões, e o KPI "SEM
RESPOSTA 5". Nenhuma linha perdida.

## 17. O teto de 10 níveis (item 10 do pedido)

Ele disse que não tinha teste porque a árvore é difícil de montar. Montei duas,
inserindo de baixo para cima (o guarda de ciclo da 0022 não impede):

```
-- M1 (venda) -> M2 ... -> M11 (producao) -> FUNDO : 10 niveis de producao
FUNDO | 1.000000...      <- PASSA
-- N1 (venda) -> N2 ... -> N12 (producao) -> FUNDO : 11 niveis
ERROR:  ficha aninhada demais (mais de 10 niveis) a partir de ecd50f4b-...
```

O teto funciona e está no lugar certo (10 passa, 11 recusa). Duas observações:

1. A exceção **derruba o relatório inteiro**, não só a linha: uma ficha de 11
   níveis vendida num período faz `mv_relatorio_de_contagem` morrer para as 900
   linhas. É coerente com `mv_custo_da_producao`, mas é o único caminho pelo
   qual a tela mostra erro em vez de pendência.
2. A mensagem nomeia o uuid da ficha **onde o limite bateu** (N2, não N1), o que
   manda procurar pelo meio da árvore em vez de pela ficha vendida.

Nenhum dos dois é defeito que eu consertaria sem decisão: deixo apontado.

## 18. Os KPIs do navegador contra consulta minha ao banco (item 9 do pedido)

Chromium `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
`admin@bardozeca.com.br` / `multiverso`, pilha local na 5173 (que já estava no
ar), com a 0024 aplicada.

**Dashboard, 01/10/2026** — a tela à esquerda, a minha consulta à direita:

| Tela | Minha consulta |
|---|---|
| VALOR TOTAL EM ESTOQUE R$ 71.961,35 | `71961.35` |
| ITENS CONTADOS 868, em 21 categorias, 4 abas | `868 / 21 / 4` |
| ITENS ZERADOS 526 · 60,6% | `526 / 60.6` |
| MAIOR CATEGORIA BEBIDAS ALCOÓLICAS R$ 34.006,10 · 47,3% | `34006.10` (= 47,26% de 71961,35) |
| BEBIDAS ALCOÓLICAS 209 insumos, 144 zerados | `209 / 144` |
| rodapé 31/08/2026 · R$ 78.681,36 | `78681.36` |

**A soma da coluna de categorias bate com o KPI**: a soma de todas as
categorias é `71961.35`, igual ao VALOR TOTAL.

**Relatório, 01/10/2026** — os quatro KPIs, contra a minha reimplementação do
julgamento em SQL:

| Tela | Minha consulta |
|---|---|
| INSUMOS NO RELATÓRIO 882 | `882` |
| 339 com estoque de sobra | `tem_de_sobra 339` |
| 533 sem movimento nenhum | `sem_movimento 533` |
| PRECISAM DE COMPRA 5 · R$ 267,65 | `comprar 5 / 267.65` |
| SEM RESPOSTA 5 | `sem_base 5` |
| 46 linhas têm pendência escrita | `46` |
| FALTA NO ESTOQUE R$ 16.245,05 | `16245.05` |

339 + 533 + 5 + 5 = 882. Fecha.

**"Não precisa comprar" está nas linhas certas**: `select count(*) ... where
precisa_comprar = false and not (contagem_atual > media_3_vendas)` → **0**. Não
há uma linha marcada "não precisa comprar" sem que a contagem atual seja
estritamente maior que a média.

**Busca com e sem acento**, no mesmo campo, sem recarregar:

```
  "limao"       -> 5 linhas | 5 de 882
  "limão"       -> 5 linhas | 5 de 882
  "LIMÃO"       -> 5 linhas | 5 de 882
  "acucar"      -> 3 linhas | 3 de 882
  "açúcar"      -> 3 linhas | 3 de 882
  "maracuja"    -> 3 linhas | 3 de 882
  (limpou)      -> 882 linhas | 882 de 882
```

Sem erro de console em nenhuma das três telas, em 1480 px e em 390 px (os únicos
que apareceram foram `ERR_CERT_AUTHORITY_INVALID` das fontes do Google pelo
proxy, na tela de entrada).

---

## 18-A. `npm run verificar` depois do último conserto

Rodado **depois** dos três commits meus, por inteiro:

```
typecheck ............ ok
vitest ............... 26 arquivos, 723 testes passando
build ................ 2396 modulos transformados
vercel:conferir ...... ok
test:banco ........... 24 migracoes + carga + SEGUNDA passada + 10_rls + 20_fluxos
                       "tudo passou"
EXIT=0
```

## 19. O que eu NÃO consegui provar

1. **Que o zero inventado está errado em cada linha concreta.** Provei que o
   produto já existia e já tinha setor nas 50 linhas, e que a folha anterior o
   omitiu. Qual era o estoque de verdade naquele dia é informação que não existe
   em lugar nenhum — é justamente por isso que o número não deveria ser afirmado.
2. **Que o estado ANTES do meu conserto de rota era explorável no navegador.**
   Provei o furo no nível da função (`matchRoutes` casando `/contagem/Dashboard`
   com a rota e o guarda antigo respondendo `true`) e provei o conserto no
   navegador de verdade. Não voltei o código atrás para filmar a invasão.
3. **A importação de PDV**, que não existe (ele disse que ficou de fora, e ficou).
   A unicidade `vendas(restaurante, referencia)` vai, sim, bater nela: testado e
   confirmado que duas vendas não-canceladas na mesma data são recusadas. A
   decisão de barrar ou de mesclar é da cliente, como ele disse.
4. **Desempenho do navegador com 882 cartões num aparelho real.** Medi com CPU
   4× freada no Chromium deste container, que é uma aproximação, não um celular.
5. **A carga de 12 lançamentos num mês de verdade.** O caso duro (todos os 12
   dentro de um período) foi montado mexendo nas datas dentro de uma transação
   descartada; é uma geometria possível (importação diária), não a que a casa tem
   hoje.
6. **Os números que ele relata no §3.4** (R$ 620 do segundo restaurante, o
   lançamento criado pela tela): não refiz, porque dependem de dados dele na
   pilha local, e o meu caminho foi construir os meus.

## 20. Os comandos, para quem quiser repetir

Tudo em `/tmp/claude-0/-home-user/ea7223e1-0cfd-5570-ae56-c7244317aec2/scratchpad/rev/`:

```
aplicar.sh          as 24 migracoes 3x + captura de grants antes/depois da 0023
dados.sql           meus lancamentos e notas do Bar do Zeca
cenario.sql         restaurante "Revisao": categorias, setores, 15 produtos
fichas.sql          38 fichas, inclusive as arvores de 10 e de 11 niveis
vendas_rev.sql      as 10 vendas com todas as bordas
contagens.sql       as 6 contagens e as notas dentro/fora do periodo
minha_explosao.sql  rev_vendas_por_produto: a minha conta, do zero
rls_cruzado.sql     isolamento entre restaurantes
rls_setor.sql       o operador preso ao setor (antes da 0024)
rls_setor3.sql      o operador preso ao setor (depois da 0024)
```

E em `/tmp/claude-0/-home-user/ea7223e1-0cfd-5570-ae56-c7244317aec2/scratchpad/nav/`: os scripts de navegador
(`entrar.mjs`, `conferir.mjs`, `rel.mjs`, `busca.mjs`, `celular.mjs`,
`celular2.mjs`, `larguras.mjs`, `preso.mjs`) e os prints.
