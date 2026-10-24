# Laudo 2 · Revisor — importação de planilha, de-para do PDV e CMV

Refiz tudo por caminho próprio, em banco próprio (`revisao_importacao`), com as
migrações aplicadas do zero três vezes, a carga do Bar do Zeca dentro, PostgREST
e navegador de verdade. **Não confirmei nada por leitura**: cada número abaixo
tem comando e saída, e cada defeito tem a medida de antes e a de depois.

Dez consertos, sete deles graves. Dois números do laudo 1 estão errados (não
mudam nenhuma decisão) e **um número que já foi passado à cliente está errado**
— o CMV de insumo de setembro.

---

## O que é GRAVE

### 1 · GRAVE — dois quilobytes de arquivo matavam a aba da cliente

O leitor de xlsx roda na thread da interface e abre arquivo de terceiro. Montei
arquivos hostis por fora (Python, `zipfile` e `zlib`) e rodei cada um **em
processo próprio, com teto de 60 s**. Quatro travaram:

```
"<row " repetido 200 mil vezes  (2,0 KB de .xlsx)  -> não terminou em 60 s
"<si "  repetido   1 milhão     (4,7 KB)           -> não terminou em 60 s
"<xf "  em styles.xml, 1 milhão (7,9 KB)           -> não terminou em 60 s
r:id = "(a+)+$" no workbook.xml (663 bytes!)       -> não terminou em 60 s
```

Os três primeiros são a mesma doença: `/<row\b([^>]*?)(?:\/>|>...)/g` não casa
nada quando a tag nunca fecha, e o motor recomeça **um caractere adiante** —
custo N × tamanho. O quarto é de outra natureza e é pior: o `r:id` vinha do
arquivo e era interpolado em `new RegExp(...)`, ou seja, **quem manda a planilha
escolhia a expressão regular que o navegador da cliente ia rodar**.

Conserto: `fatiarXml`, que anda por `indexOf` e visita cada caractere uma vez; e
a busca do relacionamento virou comparação de texto. Depois: **46 ms, 108 ms,
123 ms e 28 ms**.

### 2 · GRAVE — bomba de descompressão: 9 MB viravam 5,8 GB de memória

```
bomba_1900mb.xlsx  (9,2 MB, aba que expande em 1,9 GB)
  antes:  38.320 ms · RSS 5.831 MB · Error: Cannot create a string longer
          than 0x1fffffe8 characters        <- erro de motor, não de planilha
  depois: recusa em 21 ms, com frase que diz o que fazer

bomba_mentirosa.xlsx (1,1 MB; o índice DECLARA 1 MB e entrega 299 MB)
  antes:  31.604 ms · RSS 1.071 MB · leu 682.370 linhas como se fosse planilha
  depois: recusa em 411 ms
```

Em aba de navegador, 5,8 GB é a aba morrendo. Conserto: teto de 64 MiB por parte
— recusa barata pelo tamanho declarado no índice, e recusa de verdade **contando
os bytes enquanto descomprime**, porque a declaração é do arquivo. O número veio
da medida: um mês de vendas da cliente são 11,5 MB crus, e a mensagem manda
exportar período menor.

### 3 · GRAVE — a mesma planilha entrou duas vezes, com 133 notas e R$ 83.783,29 repetidos

O próprio laudo 1 aponta que a trava depende de `useCompras`, que não pagina.
Provei com o teto de verdade. No HTTP, com 1.001 notas e `db-max-rows = 1000`,
que é o que o Supabase hospedado usa:

```
GET /rest/v1/vw_compras_historico?select=numero,emitida_em
-> HTTP 200 · content-range: 0-999/* · 1.000 linhas de 1.001
```

Sem erro. No navegador, com as 1.001 notas de outubro ocupando a janela e a
planilha de setembro importada duas vezes seguidas:

```
importação 1: "Importar 133 notas" -> 133 gravadas, R$ 83.783,29
importação 2: "Importar 133 notas" -> 133 gravadas, R$ 83.783,29
             e nenhum aviso de "nota já estava no sistema"
banco: 266 notas de planilha, R$ 167.566,58 de compras em setembro
       (a nota 28130 de 16/09 aparece duas vezes)
```

Conserto em duas pontas: `useCompras` pagina com `buscarTudo`, e a gravação
pergunta ao banco, na hora, quais notas já existem **na janela de emissão da
planilha** — o que fecha também o furo que a paginação não fecha (cache frio
desde antes de outra pessoa importar). Depois: 133 na primeira, **0 gravadas e
"133 notas já estavam no sistema"** na segunda.

### 4 · GRAVE — a venda que aponta para o insumo não convertia a unidade

O montador marcou isto como o ponto mais frágil dele, e está certo. A planilha
tem **54 linhas em KG** contra 11.144 em UN, e a unidade **nem chegava ao
banco**: `venda_itens` não tinha coluna de unidade, então o importador lia a
coluna, mostrava na prévia e jogava fora.

O dano não é na importação: é no relatório da 0023, que compara venda com
contagem e com compra — e esses dois convertem (`mv_fator_para_produto` na
contagem, `quantidade_convertida` na compra). Só a venda não convertia.

E é alcançável **em um clique**. Rodei o casamento automático contra a lista real
dos 96 pendentes com o catálogo do primeiro cliente dentro:

```
PASTEL DE CAMARAO UND  R$ 2.184,30 em UN -> botão de 75% para PASTEL DE CAMARÃO, contado em KG
CARNE SECA COM AIPIM   R$ 4.060,35 em UN -> botão de 75% para CARNE SECA, contado em KG
```

São R$ 6.244,65 de venda que viravam quantidade sem conversão possível, calada.
O catálogo é feito para esse encontro: **362 insumos em KG contra 476 em UND, e
zero com `conteudo_quantidade`** preenchido, que é o único outro caminho de
conversão.

Conserto (migração 0028): a unidade vai para a linha e `mv_vendas_por_produto`
passa por `mv_fator_para_produto`. Quando não há conversão, a linha sai marcada
com `fator_ausente` e o motivo escrito — o mesmo caminho que a contagem em
unidade incompatível já percorre desde a 0023. Em teste: 59 KG contra UND volta
**nulo com o motivo**; contra um saco de 5 kg volta **11,8**; sem unidade
(lançamento da mão) continua 1 por 1.

### 5 · GRAVE — a fusão de linhas era código morto, e a tela dizia uma frase sem sentido

A 0027 escreveu, testou e documentou `mv_resolver_item_de_venda` ("a regra mora
no banco, não na tela") para fundir duas linhas do PDV no mesmo alvo. **Nenhum
lugar do app a chamava**: `useResolverItemDaVenda` fazia um `update` direto.

Medido no navegador, com o código do montador, vinculando dois nomes do PDV ao
mesmo insumo:

```
ISCA DE FRANGO A MILANESA          -> ISCA DE FRANGO   (ok)
ISCA DE FRANGO COM FRITAS INFANTIL -> ISCA DE FRANGO
MENSAGEM NA TELA: "ISCA DE FRANGO COM FRITAS INFANTIL: Já existe um
                   registro com esse nome ou código."
```

Frase que não quer dizer nada para quem acabou de clicar numa ficha. Depois do
conserto, o mesmo par funde: uma linha só, 162 de quantidade (138 + 24) e
R$ 6.713,60 (5.873,60 + 840,00), com os dois nomes guardados. E a prova no par
que o próprio laudo 1 usa de exemplo:

```
AMSTEL CHOPP 300 ML HH + AMSTEL CHOPP 300 ML
  quantidade 1.455 (1.140 + 315) · R$ 10.948,86 (7.023,92 + 3.924,94)
  1.305 cupons (1.014 + 291) · preço médio recalculado 7,5250
```

### 6 · GRAVE — o CMV mostrava três números diferentes para o operador de setor

O laudo 1 pede para conferir isto e não conferiu. Conferi, com `set local role
authenticated` e o `sub` de cada perfil, no mesmo período e no mesmo banco —
isto é o estado **antes** do conserto:

| | admin da casa | operador preso a 1 setor |
|---|---|---|
| estoque_inicial | 78.681,36 | 78.681,36 |
| compras | 82.417,81 | 82.417,81 |
| cmv | 89.137,82 | 89.137,82 |
| **cmv_limpeza** | **5.589,26** | **6.135,91** |
| **cmv_insumo** | **83.548,56** | **83.001,91** |
| **faturamento** | **255.417,78** | **0** |
| cmv_percentual | 34,90% | (nulo) |

A RLS está funcionando em **metade** das fontes: `estoque_inicial` e `cmv` saem
de `contagens.total` (cabeçalho, não recortado), as metades de limpeza somam
`contagem_itens` (recortado: ele vê 556 dos 868 itens) e o faturamento lê
`vendas`, que a 0024 fechou para ele. Daí a tela dizer "sem venda fechada, não há
percentual" para quem tem uma venda fechada na casa — ela só não é dele.

A tela já barra (`SoAContagem` manda perfil de setor para `/contagem`; conferi no
navegador, o link do CMV nem aparece no menu). O caminho que existia era a API:

```
POST /rest/v1/rpc/mv_cmv_periodo   (token do próprio operador de setor)
antes:  200 com os números divergentes
depois: {"code":"P0001","message":"este relatorio soma a casa inteira e seu
         acesso e de setor: peca a leitura a quem administra"}
```

A frase é a mesma da 0026, que já tinha tomado esta decisão para o relatório de
contagem. Vale consertar na função e não só confiar na tela: a próxima tela que
alguém escrever vai chamá-la.

### 7 · GRAVE — a condição do "mês fechado" era necessária, e insuficiente

O montador pediu para eu julgar com número próprio a condição que ele
acrescentou à regra da cliente. Julguei: **ela é necessária**. Fiz uma cópia da
função sem a condição e rodei nas semanas de setembro, com as 133 notas lançadas:

```
31/08-06/09  estoque final 01/10  CMV R$ 35.498,98
07/09-13/09  estoque final 01/10  CMV R$ 28.844,12
14/09-20/09  estoque final 01/10  CMV R$ 21.910,16
21/09-27/09  estoque final 01/10  CMV R$ 18.579,58
```

Cada um é a queda de estoque do **mês inteiro** (R$ 6.720,01) somada às compras
daquela semana. (Ele mediu quatro barras *iguais* de R$ 6.720,0063 porque mediu
antes de importar as notas. A forma do defeito é a mesma.)

**E é insuficiente**, porque ela olha só `p_fim`. Na função de verdade, com a
mesma carga:

```
21/09-30/09 (dez dias)  estoque final 01/10  CMV R$ 23.617,59
30/09-30/09 (UM dia)    estoque final 01/10  CMV R$  7.883,27
```

Não é janela de laboratório: a série semanal da tela chama `mv_cmv_periodo` com
`[início da semana, +6]`, e **quando o último dia do mês cai no último dia da
semana da casa, uma semana da série acaba exatamente no fim do mês**. Com
`dia_virada_semana = 1`, maio de 2026 é um desses meses (31/05/2026 é domingo), e
todo restaurante passa por um ou dois por ano.

Conserto (0029): a condição passa a ser a janela **ser** um mês civil — começa no
dia 1º e acaba no último dia do mesmo mês. Uma linha a mais na mesma condição, e
nada do que funcionava parou: a série mensal chama com `date_trunc('month')` + 1
mês − 1 dia, que cai nela exata. Depois: setembro continua R$ 89.137,82 com
`estoque_final_fora_do_periodo` ligado; dez dias, um dia e a semana que acaba em
30/09 voltam pendentes; e a semana que de fato **contém** a contagem continua
fechando pelo degrau (a).

---

## O que é AJUSTE

### 8 · AJUSTE — o leitor aceitava arquivo corrompido, adulterado e ambíguo

Tudo medido com arquivo montado por fora, antes e depois:

| arquivo | antes | depois |
|---|---|---|
| CRC-32 adulterado | **leu a planilha inteira, calado** | recusa, dizendo qual parte |
| nome de parte repetido | **ficou com a última cópia, calado** | recusa |
| ZIP64 declarado na entrada (0xffffffff no diretório central) | **leu** (recortava até o fim do arquivo e o deflate parava sozinho — deu certo por sorte) | recusa |
| índice apontando para fora do arquivo | `RangeError: Offset is outside the bounds of the DataView` na tela | `ErroDePlanilha` com frase de gente |
| fluxo que não é deflate | erro de motor cru | `arquivo_corrompido`, com o detalhe técnico no fim da frase |

O nome de parte repetido é o truque clássico de confundir leitor de ZIP: a cópia
que a pessoa confere num programa é uma, a que entra no banco é outra.

**O que NÃO é furo, e vale dizer por quê**: zip slip não alcança este leitor — o
nome da entrada só é chave de um `Map` e as partes lidas são quatro nomes fixos,
nada toca disco; e XXE e bilhão de risadas chegam **literais** à célula
(`&xxe;`, `&a9;`), porque o DOCTYPE nunca vai para o parser: só o miolo de cada
`<row>` e de cada `<si>` vai. O fatiamento, que existe por memória, também fecha
essa porta. Há teste para os dois, para ninguém desfazer sem saber.

### 9 · AJUSTE — a prévia congelava a aba por 28 segundos num telefone

Medido a 390 px com a CPU freada 4x, com um relógio de quadros dentro da página:

```
                      antes                        depois
compras (693 linhas)  29.327 ms · pausa 28.143 ms   4.813 ms · pausa 3.581 ms
vendas (11.198)       12.655 ms · pausa 11.897 ms  13.215 ms · pausa 2.443 ms
```

A causa das compras não era o leitor: `casarItem` calcula as três "parecenças de
cortesia" contra o catálogo inteiro na primeira linha do corpo, **antes de
qualquer degrau** — 693 × 906 = 628 mil comparações de texto que
`casarCompraDaPlanilha` joga fora, porque nunca lê `sugestoes`. O próprio
`dePara.ts` já tinha medido isso ("mais de 3 segundos de navegador travado") e
documentado a cura; só que `casarItem` continuava fazendo por dentro o que o
comentário dizia não fazer.

Para vendas, o laço agora solta a thread a cada 2.000 linhas: a pausa única de
11,8 s virou pausas de 2,4 s, com 44 quadros no lugar de 15. A aba responde a
clique enquanto lê. **Os 13 s de leitura continuam** — o conserto de verdade é
ler em Web Worker, e isso é mudança grande demais para um revisor enfiar no fim.

### 10 · AJUSTE — a fusão não se desfaz, e a tela não avisava

Ligada a fusão (achado 5), ela passou a acontecer — e ela apaga a linha clicada.
No meu cenário de teste um casamento por parecença sem piso juntou **seis nomes
numa linha só**: "BUFFET DE FEIJOADA + BRAHMA CHOPP 300ML + BRAHMA GF 600 ML +
BUFFET DIÁRIO DE ALMOÇO + BRIGADEIRO COLHER + BUFFET FEIJOADA 1/2", R$ 37.124,58,
sem como voltar atrás pela tela. Um vínculo errado não erra só o alvo: ele apaga
a conferência por nome.

Agora o botão de sugestão e o resultado da busca dizem **"junta com <nome>"**
quando o alvo já tem linha, a linha fundida diz **quantos nomes do PDV** foram
juntados nela, e o selo de unidade (`UN ≠ KG`) aparece ao lado. Tudo antes do
clique.

---

## O que confere, e o que eu mediria de novo

### 11 · NOTA — os números das duas planilhas conferem, no centavo

Refeitos com openpyxl (`-I`, script fora da pasta das planilhas), sem olhar o
código dele:

```
COMPRAS  693 linhas · 219 produtos · Qtde 9.517,48 · PrecoFinal R$ 83.783,29
         133 notas por (Nota_fiscal + Fornecedor + Emissao) — e 133 por
         Nota_fiscal sozinho, então a chave composta é cinto e suspensório
         42 fornecedores · 42 CNPJs distintos
         soma(PrecoFinal) == ValorTotalNota em 133 de 133 notas (tolerância 1c)
         soma dos ValorTotalNota = R$ 83.783,27 -> os 2 centavos existem
         5 notas emitidas em agosto, R$ 1.365,48 (12 linhas)

VENDAS   11.198 linhas · 136 produtos · Qtde 13.651 · PrecoFinal R$ 255.417,78
         DescontoTotalRateado R$ 17.069,44 · bruto R$ 272.487,22
         272.487,22 − 17.069,44 = 255.417,78 EXATO
         0 de 11.198 linhas violam Qtde×Unitario − Desconto = PrecoFinal
         748 linhas com desconto · ValorUnitarioTabela = Unitario em 11.198
         26 datas de DataCaixa contra 28 de Emissao
         unidade: 11.144 UN e 54 KG (a BATATA FRITA, R$ 2.463,67 em 59 KG)
```

**`PrecoFinal` já é líquido do desconto: confirmado.** Se não fosse, o
faturamento inteiro estaria 6,7% errado — e não está.

E o leitor dele lê a mesma coisa que o openpyxl: comparei **célula a célula**,
17.350 células em compras e 324.771 em vendas, **zero diferença**. As únicas duas
colunas que divergem são `HRAbertura` e `HRFechamento` (hora do dia: o openpyxl
devolve `14:48:18`, o leitor devolve a fração 0,616875), e nenhum importador lê
essas colunas. Vale uma linha de registro, não um conserto.

### 12 · NOTA — dois números do laudo 1 estão errados

Nenhum dos dois muda decisão, mas o laudo é o que a cliente lê:

- **"Em 159 das 693 linhas"** `PrecoFinal` discorda de `Qtde × Unitario`. Medido:
  **157** com tolerância de um centavo, 176 comparando arredondado a 2 casas,
  211 exato, 163 em ponto flutuante com tolerância de 1 centavo. Nenhum critério
  dá 159.
- **"AMSTEL 600 ML saiu 3.063 vezes"** (repetido no cabeçalho da 0027): são
  **941 unidades em 366 linhas de cupom**, R$ 16.633,21. O argumento do
  arredondamento continua valendo — 16.633,21/941 = 17,6761, e 17,6761 × 941 =
  R$ 16.633,11, dez centavos de erro — mas o número citado não existe no arquivo.

### 13 · NOTA — o CMV de insumo de setembro que foi passado à cliente está errado

O coordenador mediu R$ 83.112,27 e já corrigiu com a cliente de R$ 83.904,75 para
esse valor. Refiz, e **os dois estão errados pelo mesmo motivo**: subtraem só a
*compra* de limpeza e deixam o *estoque* de limpeza dentro do insumo.

```
CMV total de setembro = 78.681,3573 + 82.417,81 − 71.961,3510 = R$ 89.137,8163

limpeza, pelas três pontas (que é como a 0027 define):
  estoque inicial 8.014,77 + compras 6.135,91 − estoque final 8.561,4235
                                                  = R$ 5.589,2565
CMV de insumo = 89.137,8163 − 5.589,2565          = R$ 83.548,5598

a conta que foi passada (só a compra de limpeza):
  89.137,8163 − 6.025,55                          = R$ 83.112,2663
```

A diferença de R$ 436,29 é exatamente o estoque de limpeza que cresceu no mês
(8.561,42 − 8.014,77 = 546,65) menos os R$ 110,36 de itens que a *categoria*
classifica como limpeza embora a *operação* do ERP não classifique. É o erro que
o cabeçalho da 0027 descreve com todas as letras: "separar só a compra deixaria
o estoque dos dois lados".

**Os números certos de setembro**, do banco e da tela, batendo no centavo:

```
CMV total      R$ 89.137,82   34,90% do faturamento total · 44,05% do de produto
CMV de insumo  R$ 83.548,56   32,71% · 41,29%
CMV de limpeza R$  5.589,26   (R$ 6.135,91 comprados no mês)
```

Se a conta de limpeza usar só a operação do ERP (sem depender do vínculo item a
item, que a casa ainda vai fazer à mão), o insumo é R$ 83.658,92. Está entre
83.548,56 e 83.658,92, e **não** em 83.112,27.

### 14 · NOTA — os dois percentuais, vistos populados no navegador

O montador não conseguiu mostrar, e estava certo em não inventar de-para para
tirar captura. Montei cenário próprio no meu banco (deixo claro: **cenário, não
dado da cliente** — vinculei 342 itens de compra e 86 linhas de venda pela maior
parecença de texto, por SQL meu), lancei as 133 notas e fechei o lançamento
**pela tela**. O bloco:

```
SOBRE O FATURAMENTO TOTAL      34,9%    Faturamento R$ 255.417,78 · CMV R$ 89.137,82
SOBRE O FATURAMENTO DE PRODUTO 44,0%    Produto R$ 202.368,10 · Serviço −R$ 53.049,68
```

Bate com o banco (34,90% e 44,05%) e com o gabarito no centavo: R$ 255.417,78 e
R$ 202.368,10. A prova cruzada que o gabarito pede fecha: a razão entre os
percentuais é **1,2622** e a razão entre os faturamentos é **1,2621** (a
diferença é o arredondamento dos próprios percentuais a duas casas).

A diferença está explicada em texto que uma pessoa entende, e é bom texto: *"A
diferença entre os dois é couvert e taxa de serviço: R$ 53.049,68 (20,8% do
faturamento) que entraram sem tirar nada do estoque... o número da cozinha é
1,26× o do caixa. O do caixa diz se a casa fecha a conta; o da cozinha diz se a
ficha está certa."*

E a tabela por categoria soma o mesmo que o cartão: **R$ 89.137,8163 nas 21
categorias**, zero categorias sem CMV. (Confirma o defeito 1 da lista dele.)

### 15 · NOTA — o de-para é o trabalho que sobra, e ele é de uma vez só

Medido na tela, com o arquivo de verdade:

- **96 linhas pendentes** (os 91 do gabarito mais os 5 de serviço), R$ 228.455,13.
- **14 das 96 ganham botão de um clique** com o piso de 72%. As outras 82 exigem
  digitar na busca e clicar no resultado — duas interações e uma decisão.
- **Serviço é um clique**, e os cinco levaram 1,3 a 1,5 s de ida e volta cada.
- **Não há vínculo em lote.** Nada de "aplicar a todos os parecidos".
- **Desfazer existe pela metade**: a linha resolvida vira um `<select>` com 69
  fichas + 906 insumos + "Serviço", então dá para TROCAR o alvo; não dá para
  voltar a "pendente" (`mv_resolver_item_de_venda` recusa 'pendente' de
  propósito), e **não dá para desfazer uma fusão** — daí o achado 10.
- O trabalho é de uma vez: `venda_apelidos` ficou com **136 linhas** depois da
  minha passada, e a importação do mês que vem já chega vinculada.

**Ataquei o piso de 72% com a lista real.** Dos 14 botões, três são "HH" (GT ARPO
GIN HH, SALVE JORGE HH, Agora Por Favor HH) apontando para a ficha base e estão
**certos** para efeito de consumo: happy hour é preço de carta, não receita
diferente. O que o piso não separa são dois casos de natureza diferente:

```
RED BULL C   R$ 562,86  ->  100% RED BULL
             e o catálogo tem também RED BULL CEREJA e RED BULL COCO
```

Um botão de **100%** que não é identidade, num nome truncado pelo PDV, com dois
irmãos no catálogo: é exatamente a armadilha que o laudo 1 descreve para a AMSTEL
e que o piso não pega, porque o problema não é a altura do piso.

```
ISCA DE FRANGO A MILANESA R$ 5.873,60 -> 75% do INSUMO "ISCA DE FRANGO"
CARNE SECA COM AIPIM      R$ 4.060,35 -> 75% do INSUMO "CARNE SECA"
```

Prato vendido apontando para insumo cru é erro de **quantidade por construção**:
`alvo = 'produto'` quer dizer "um vendido = uma unidade do insumo", que é verdade
para a garrafa e nunca para o prato. Nenhuma distância de texto conserta isso —
quem conserta é ficha técnica. Não mexi no piso; registrei, e o selo de unidade
do achado 4 já faz os dois piores (PASTEL e CARNE SECA) avisarem antes do clique.

### 16 · NOTA — as notas de agosto caem em agosto, e ninguém é avisado disso depois

Provado no meu banco, com as 133 notas lançadas:

```
mv_cmv_periodo(bar, '2026-09-01','2026-09-30')  compras R$ 82.417,81 · 128 notas
mv_cmv_periodo(bar, '2026-08-01','2026-08-31')  compras R$  1.365,48 ·   5 notas
                                                cmv (vazio) · "Falta a contagem
                                                de estoque inicial"
```

Setembro **não** as inclui: 128 notas, R$ 83.783,29 − R$ 1.365,48 = R$ 82.417,81.
Agosto fica com as cinco, e a prévia avisa antes de gravar — vi na tela, a 390
px: *"As notas desta planilha estão emitidas em 2 meses diferentes. O CMV soma a
compra pela data da EMISSÃO, então agosto de 2026 fica com R$ 1.365,48, fora do
mês principal (setembro de 2026)."*

O que fica: no Bar do Zeca agosto não tem CMV (falta a contagem inicial), então
nada muda de número. **Numa casa que tenha a contagem de 31/07, importar a
planilha de setembro muda o CMV de agosto — um mês já fechado e já lido — e nada
no sistema avisa que um número do passado mudou.** Isso é decisão de produto, não
defeito: registro.

### 17 · NOTA — a semana que contém a contagem mistura um mês de estoque com uma semana de compras

Herança da 0005, não da 0027, e aparece na tela:

```
Sem 28/09 a 04/10   estoque inicial 31/08 (78.681,36) · estoque final 01/10
                    (71.961,35) · compras da semana 5.038,01 · CMV 11.758,02
```

A queda de estoque é de um mês; as compras, de sete dias. A função devolve as
duas datas e a tela as mostra, então dá para ver — mas o número aparece como
"CMV da semana". Não mexi: mexer é redesenhar a série semanal, que é outra
entrega, e a 0029 já tirou daí os casos fabricados.

### 18 · NOTA — migrações: três passadas, e os grants sobreviveram

`ON_ERROR_STOP=1`, do zero: passada 1 → carga do Bar do Zeca → passada 2 →
passada 3. Todas verdes. Fotografei `role_table_grants` de `public` nas quatro
etapas: **356 linhas idênticas** nas quatro; as funções (nome, argumentos e tipo
de retorno) e as vistas também idênticas entre passadas. O `drop` que ele pôs na
0005 não levou grant nenhum embora. O único aviso é cosmético e correto: na
segunda passada a 0027 diz "0 categoria(s) marcada(s) como fora do CMV de
insumo", porque a carga já as marcou — que é o conserto dele funcionando.

### 19 · NOTA — o que o operador de setor ainda pode, e eu não mudei

Provado com `set local role authenticated` e o `sub` dele:

```
vendas / venda_itens .................. não lê, não grava (0024)         ok
venda_apelidos ........................ LÊ as 136 linhas; não grava
notas_fiscais / nota_itens ............ LÊ as 133 notas e os 693 itens
                                        e GRAVA: insert aceito nas duas
vw_compras_historico .................. lê 134 linhas
contagem_itens ........................ 556 dos 868 (o setor dele)       ok
```

Ou seja: **a importação de compras é possível para ele pela API** (a tela o manda
de volta para `/contagem`). Isso vem das políticas da 0004/0006, não desta
entrega, e trocar permissão de compras é decisão da cliente — registro e não
mexo. O `venda_apelidos` que ele lê é vocabulário de cardápio, não dinheiro, mas
é inconsistente com as vendas estarem fechadas para ele.

### 20 · NOTA — `useSalvarItensDaVenda` está seguro hoje por causa da tela

O conserto dele (filtrar `alvo = 'ficha'`) protege linha de insumo, de serviço e
pendente. Mas o `sair` continua apagando **as outras linhas de ficha** do mesmo
lançamento: salvar uma ficha pela tela da mão num lançamento de planilha apagaria
as outras 53. Não acontece porque `Vendas.tsx` abre lançamento `origem = 'pdv'`
na conferência e nunca no formulário da mão (linha 238). O guarda é da tela, não
do hook — vale saber antes de alguém reusar o hook.

---

### 21 · NOTA — os cinco defeitos que ele achou com a tela aberta, conferidos um a um

| o defeito dele | o caso que o pegou, refeito por mim | resolve? |
|---|---|---|
| o cartão do período e a tabela por categoria discordavam | soma das 21 categorias = **R$ 89.137,8163**, igual ao cartão, **zero** categorias sem CMV enquanto o período tem | sim |
| a carga nascia sem categoria marcada | banco do zero: `MATERIAL DE LIMPEZA` e `DESCARTÁVEIS` marcadas pela carga; a regra do gerador (`/LIMPEZA\|DESCARTAV\|HIGIENE/`) é a mesma da migração, e `npm run seed:conferir` fecha | sim |
| sugestão de 13% virava botão de um clique | com o piso, "COUVE FLOR 13%" some de COUVERT ARTISTICO 20 REAIS; a maior linha do mês fica só com a busca (achado 15 diz o que o piso ainda deixa passar) | sim, em parte |
| `useSalvarItensDaVenda` apagava as linhas da planilha | o filtro por `alvo = 'ficha'` protege insumo, serviço e pendente (achado 20 diz o que resta) | sim, em parte |
| a 0005 morria na segunda passada | três passadas verdes com `ON_ERROR_STOP`, grants idênticos nas quatro fotos | sim |

## O que eu NÃO consegui provar

- **Que o leitor é seguro.** Provei que ele resiste aos 27 arquivos hostis que
  eu montei, e que lê 342 mil células iguais ao openpyxl. Não provei que não há um
  décimo quarto: é um leitor de formato binário escrito à mão, e a conclusão
  honesta é "resiste ao que eu soube atacar".
- **Os 13 s de leitura da aba de vendas num telefone freado.** Diminuí a pausa de
  11,8 s para 2,4 s, não o tempo total. O conserto é Web Worker.
- **O comportamento com dois meses na mesma planilha num banco que tenha a
  contagem anterior** (achado 16): o Bar do Zeca não tem contagem antes de 31/08,
  então não há como medir o CMV de agosto mudando. O raciocínio está no achado,
  a medida não.
- **Que o de-para dos 91 é viável para a cliente em tempo razoável.** Contei
  cliques e medi a ida e volta de cada um (1,3–1,5 s), mas não vi uma pessoa real
  fazendo os 96 — e a decisão de cada linha é o que custa, não o clique.
- **`npm run verificar` com `BANCO=multiverso`.** A instrução era não usar aquele
  banco; rodei a suíte inteira com `BANCO=revisao_importacao_testes`, que é o
  mesmo caminho com outro nome de banco.

---

## Como refazer tudo isto

```bash
REV=/tmp/claude-0/-home-user/ea7223e1-0cfd-5570-ae56-c7244317aec2/scratchpad/rev

# banco do revisor, três passadas de migração com ON_ERROR_STOP + carga no meio
"$REV"/montar-banco.sh

# o sistema inteiro no meu banco (Postgres + PostgREST + portão + vite)
BANCO=revisao_importacao ferramentas/local/subir.sh && npm run dev

# os números das planilhas, por caminho próprio
/tmp/venv-xlsx/bin/python -I "$REV"/medir.py     # compras
/tmp/venv-xlsx/bin/python -I "$REV"/medir2.py    # vendas
/tmp/venv-xlsx/bin/python -I "$REV"/medir3.py    # notas, agosto, limpeza
/tmp/venv-xlsx/bin/python -I "$REV"/comparar.py py-vendas.tsv js-vendas.tsv VENDAS

# os 27 arquivos hostis, e as duas rodadas de ataque, antes e depois
/tmp/venv-xlsx/bin/python -I "$REV"/gerar-ataques.py
/tmp/venv-xlsx/bin/python -I "$REV"/gerar-ataques2.py
"$REV"/rodar-ataques.sh                      # leitor de hoje
"$REV"/rodar-ataques.sh lerXlsx-antes.mjs    # leitor da 0027
"$REV"/rodar-ataques2.sh                     # a segunda rodada

# o piso de 72% contra a lista real dos pendentes
node "$REV"/piso.mjs 0.72

# navegador: importação, fusão, CMV cheio, desempenho a 390 px
node "$REV"/nav.mjs DEPOIS 2
node "$REV"/vendas.mjs && node "$REV"/fusao.mjs && node "$REV"/cmv.mjs
node "$REV"/desempenho.mjs 4 390

# a suíte de banco, no banco do revisor
BANCO=revisao_importacao_testes supabase/testes/executar.sh
```

Os arquivos de medida ficam em
`/tmp/claude-0/-home-user/ea7223e1-0cfd-5570-ae56-c7244317aec2/scratchpad/rev/`
(scripts, fotos, saídas de antes e depois). As planilhas da cliente não entram no
repositório, e os `.xlsx` hostis que montei também não — eles se refazem com o
gerador em dois segundos.
