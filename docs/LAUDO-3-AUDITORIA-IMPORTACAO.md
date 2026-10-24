# Laudo 3 · Auditoria — o montador, o revisor, e o número que vai à cliente

Banco próprio (`auditoria_importacao`), API própria (portão em 54341 →
PostgREST em 54345), as duas planilhas da cliente lidas por caminho próprio
com `openpyxl -I`, e os arquivos hostis montados por fora com `zipfile`.

Nove consertos, em nove commits locais. Toda afirmação daqui tem comando e
saída; as medidas que dependiam de código que mudou depois foram refeitas no
fim, com o código final.

**O número.** O CMV de insumo de setembro é **R$ 83.548,56**. O valor do
revisor estava certo; o código que o produzia, não — ele somava a compra por
uma base e o estoque por outra, e as duas só coincidem por sorte nesta
planilha. A conta aberta está no achado 1.

---

## O que é GRAVE

### 1 · GRAVE — a limpeza saía de duas bases diferentes nas duas pontas da mesma subtração · do MONTADOR, não visto pelo revisor

O cabeçalho da 0027 escreve a razão certa:

> "a compra é só uma das três pontas: MATERIAL DE LIMPEZA (75 insumos) e
> DESCARTÁVEIS (60) estão no catálogo do Bar do Zeca e são CONTADOS na folha.
> **Separar só a compra deixaria o estoque dos dois lados** e o número sairia
> errado nas duas metades."

E escreve, cinquenta linhas abaixo, o código que faz exatamente isso:

```sql
and (coalesce(cat.fora_do_insumo, false) or mv_operacao_fora_do_insumo(it.operacao))
```

O estoque sai **só pela categoria**; a compra saía pela categoria **ou** pela
operação do ERP. A linha que uma classifica e a outra não tem a COMPRA de um
lado e o ESTOQUE do outro: as duas metades erram, em sentidos opostos, caladas.
O revisor leu o cabeçalho, citou-o no achado 13 dele, e não viu que o código
abaixo o contradiz.

**A decisão: a categoria do catálogo, nas três pontas.** Não é escolha de
gosto — a operação não PODE ser a fonte única, por duas medidas.

**(a) A operação não existe nas outras duas pontas.** `contagem_itens` não tem
coluna de operação e nunca vai ter: quem conta uma prateleira não pergunta ao
fornecedor com que rótulo ele faturou. Classificar estoque pela operação é
impossível, não inconveniente.

**(b) A operação não é nem função do produto.** Nas 681 linhas de setembro:

```
$ /tmp/venv-xlsx/bin/python -I aud3/p1-compras.py
produtos distintos: 218 | com MAIS DE UMA operacao: 1
CONFLITO GUARDANAPO -> ['01 - COMPRAS DE LIMPEZAS E DESCARTÁVEIS',
                        '01 - COMPRAS INSUMOS']
```

No banco, as duas linhas:

```
GUARDANAPO | 01 - COMPRAS DE LIMPEZAS E DESCARTÁVEIS | 37073  | 2026-09-09 | 217.98 | DESCARTÁVEIS
GUARDANAPO | 01 - COMPRAS INSUMOS                    | 981664 | 2026-09-29 | 110.36 | DESCARTÁVEIS
```

**Os R$ 110,36 que estavam em discussão são uma linha de guardanapo.** O mesmo
produto, o mesmo insumo do catálogo, dois rótulos no mesmo mês. Um
classificador que se contradiz dentro do mês, no mesmo produto, não é fonte de
verdade de nada. A categoria é da casa; a operação é do fornecedor, e é ele
quem digita.

E a operação nunca soma o que a categoria não soma — medido no banco, com as
133 notas lançadas e o de-para feito:

```
 so_categoria | so_operacao |  pelo_or  | so_op_nao_cat
    6135.9100 |   6025.5500 | 6135.9100 |  (nenhum)
```

O `or` só podia somar o que a casa classificou de outro jeito. Retira-se o que
só tem como errar (migração **0031**).

#### O número, com a conta aberta

Do banco, `mv_cmv_periodo(bar, '2026-09-01', '2026-09-30')`, com o código final:

```
                               estoque 31/08   compras set.   estoque 01/10        CMV
TOTAL                            78.681,3573     82.417,8100     71.961,3510   89.137,8163
  limpeza e descartável (cat.)     8.014,7700      6.135,9100      8.561,4235    5.589,2565
  INSUMO                          70.666,5873     76.281,9000     63.399,9275   83.548,5598
```

```
CMV de insumo = 70.666,5873 + 76.281,9000 − 63.399,9275 = R$ 83.548,5598
```

Conferido no banco que a conta fecha pelas três pontas e que as duas metades
somam o inteiro, as duas com diferença **0,0000**:

```
cmv_insumo_pelas_tres_pontas | 83548.5598
cmv_insumo_da_funcao         | 83548.5598
diferenca                    |     0.0000
identidade_das_metades       |     0.0000
```

**Por que o seu número estava errado, e por que o do revisor também.** Os três
valores que circularam vieram de três bases:

| | compras de insumo | base |
|---|---|---|
| R$ 83.904,75 e R$ 83.112,27 (seus) | 76.392,26 | estoque **total** − compra só de insumo |
| R$ 83.658,92 (seu, refeito) | 76.392,26 | estoque por **categoria**, compra por **operação** |
| **R$ 83.548,56** | **76.281,90** | **categoria nas duas pontas** |

A diferença entre os dois últimos é R$ 110,36 — a linha de guardanapo que a
operação chamou de insumo e o catálogo da casa chama de descartável. Vale o
catálogo.

#### O que ainda depende do trabalho da cliente, e quanto

**Este número não existe no banco de verdade hoje**, e isso tem de ficar dito.
Só 345 das 681 linhas de setembro casam por nome idêntico (R$ 62.848,19 sem
vínculo), e `mv_lancar_nota` recusa nota com item pendente — então nenhuma
dessas notas entra em `compras` até a cliente fazer o de-para.

Montei o cenário no meu banco com de-para **declarado** (`aud3/montar-compras.py`):
351 linhas por nome idêntico, **29 linhas mapeadas à mão** (os 28 produtos de
operação=limpeza, cada um para o par evidente do catálogo, nomeados no script),
e as 313 restantes para o melhor parecido **restrito a categorias de insumo** —
de propósito, para que nenhum vínculo meu possa inflar a limpeza por acidente.

O que isso significa para a firmeza do número:

- **O CMV TOTAL (R$ 89.137,82) não depende de como a cliente vincula.** Ele só
  precisa que as notas estejam lançadas; qual insumo cada linha aponta não muda
  a soma.
- **A divisão insumo/limpeza depende.** Conferi quanto: os 28 produtos de
  operação=limpeza de setembro **todos** têm par evidente em MATERIAL DE
  LIMPEZA ou DESCARTÁVEIS (`aud3/p1-limpeza.py`, contra os 135 insumos de
  limpeza do catálogo). Na direção contrária, só o guardanapo (R$ 110,36). Os
  dois únicos sem par óbvio são POTE RETANGULAR 750ML (R$ 270,76 → EMBALAGEM
  750ML) e ALUGUEL DE DESODORIZADOR (R$ 201,00 + R$ 280, que é serviço e não
  mercadoria). **A banda de dúvida real é de centenas de reais, não de
  milhares** — e quem a fecha é a cliente, nas duas linhas de aluguel.

Para o número não mudar uma quarta vez, é isto que tem de ser dito junto com
ele: R$ 83.548,56 é o CMV de insumo de setembro **com o de-para feito como o
catálogo indica**; o CMV total R$ 89.137,82 é firme desde já.

**Além de consertar, a função passa a dizer onde olhar**, com duas colunas que
não mudam número nenhum: `compras_divergencia_operacao` (R$ 110,36 em setembro
— onde o catálogo e a nota do fornecedor discordam) e
`compras_sem_classificacao` (compra lançada cujo item não tem insumo vinculado,
e que portanto está no CMV inteiro e em nenhuma das duas metades). A tela diz
as duas.

### 2 · GRAVE — a trava do item pendente valia só para quem passasse pela porta · de NINGUÉM: ninguém tinha visto

A regra existe desde a 0004 e é o que faz "compra lançada" significar "compra
que alguém conferiu". Ela mora dentro de `mv_lancar_nota`, e `status` é uma
coluna como outra qualquer. Pela API, com o token do admin da casa:

```
POST /nota_itens (descricao, sem produto_id) .............. HTTP 201
POST /rpc/mv_lancar_nota ... "a nota tem 1 item(ns) sem produto vinculado"
PATCH /notas_fiscais?id=eq.<n>  {"status":"lancada"} ...... HTTP 204  <- entrou

mv_cmv_periodo depois: compras R$ 83.417,81 em 129 notas (eram 128)
                       compras_limpeza R$ 7.135,91 (eram 6.135,91)
```

Os R$ 1.000 de detergente **sem insumo vinculado** foram inteiros para a
limpeza, pelo rótulo da nota — o `or` do achado 1 em ação. Com o `or` fora
iriam calados para o insumo; por isso o achado 1 também devolve
`compras_sem_classificacao`. E o desvio perdia `mv_atualiza_custo_medio`: a
nota entra no CMV e o custo do insumo não se move.

Conserto na 0032, molde da 0023: a regra vira gatilho, porque gatilho não se
contorna escolhendo outra rota. Depois, HTTP 400 nos dois caminhos. Fica
aberto, **de propósito**, desvincular o insumo de um item de nota lançada:
`nota_itens_produto_id_fkey` é `on delete set null`, então apagar um insumo do
cadastro esvazia o vínculo das notas que o compraram, e um gatilho de UPDATE
sobre `produto_id` não distingue a mão da pessoa da ação da chave estrangeira.
Trancar as duas faria apagar insumo com histórico de compra passar a falhar —
regressão pior que o furo. É esse caminho que `compras_sem_classificacao` mede.

### 3 · GRAVE — o operador de setor lançava compra, e com ela reescrevia o custo da casa · do MONTADOR/0004, mal julgado pelo revisor

O revisor registrou (achado 19 dele) e chamou de "decisão de permissão da
cliente". Não é. A 0018 abre assim:

> "Quem conta o bar não precisa — e não deve — enxergar o CMV, **as notas**, a
> equipe, nem a contagem da cozinha."

E `web/src/rotas.ts:212`, sobre o mesmo perfil: "cadastro, **compras**, CMV e
equipe não são assunto seu". A intenção está escrita duas vezes, no SQL e no
TypeScript. A política é que nunca foi escrita. É a 0018 inacabada — a mesma
metade que a 0024 fez para a venda e a 0030 (do próprio revisor) para o CMV,
as duas citando esta frase.

Medido pela API, com `perfil_setores` ligando a operadora ao setor Bar e o
token dela (`aud3/alcance-antes.txt`):

```
LE   notas_fiscais        133      LE  vendas            0   ok (0024)
LE   nota_itens           693      LE  venda_itens       0   ok (0024)
LE   vw_compras_historico 133      LE  contagem_itens  556 de 868  ok
LE   fornecedores          42      LE  venda_apelidos  lê tudo
GRAVA notas_fiscais   HTTP 201 ACEITOU
GRAVA fornecedores    HTTP 201 ACEITOU
RPC  mv_lancar_nota   ACEITOU E LANÇOU
```

**A última linha é o que ninguém mediu, e é a pior.** `mv_lancar_nota` chama
`mv_atualiza_custo_medio`, que faz `update produtos set custo_medio = ...` na
casa INTEIRA. Quem conta uma aba reescrevia o custo de 906 insumos, e com ele o
valor do estoque de todos os setores e o CMV de todo mundo. Não é "ler o que
não é dele": é mexer no número dos outros.

Conserto na 0033: as quatro políticas de `notas_fiscais`, a de `nota_itens`, as
quatro de `fornecedores` e a leitura de `venda_apelidos` ganham
`not mv_restrito_a_setores()`, e `mv_lancar_nota` recusa no topo com frase
própria. Depois (`aud3/alcance-depois.txt`): as cinco leituras voltam zero, as
duas gravações HTTP 403, e

```
{"code":"P0001","message":"lancar compra e da casa e seu acesso e de setor:
 peca o lancamento a quem administra"}
```

Nenhuma tela do perfil quebra: as rotas dele são `/contagem`,
`/contagem/historico` e `/contagem/<id>`, e nenhuma chama `useCompras`,
`useFornecedores` nem `useVendaApelidos`. E o admin não perdeu nada — testado
nos dois sentidos em `10_rls.sql`.

### 4 · GRAVE — dois quilobytes punham 2 GB na aba, e mentiam sobre o motivo · do MONTADOR, o 28º arquivo hostil

O revisor montou 27 arquivos e disse, honestamente, "resiste ao que eu soube
atacar". Ataquei de outro ângulo: a posição da célula vem da REFERÊNCIA (`A2`),
e a referência vem do arquivo. `indiceDaColuna` não tinha teto, e um índice
grande o bastante — mas ainda abaixo de 2³², que é o limite do que o JavaScript
trata como índice de array — faz `porColuna.length` virar aquele número. O laço
do cabeçalho anda até lá uma vez; o de montar os valores anda até lá **a cada
linha**.

Um processo por arquivo, teto de 60 s:

| arquivo | antes | depois |
|---|---|---|
| `coluna_sem_teto.xlsx` · 764 B, célula em `AAAAAA1` | LEU em 928 ms, RSS 461 MB, **cabeçalho de 12.356.631 colunas** | recusa em 16 ms, RSS 48 MB |
| `coluna_sem_teto_200_linhas.xlsx` · 1.988 B | LEU em 8.622 ms — **43 ms por linha**; a aba da cliente tem 11.198 | recusa em 19 ms |
| `coluna_no_limite.xlsx` · 752 B, célula em `FXSHRXW1` | 15.313 ms, **RSS 2.128 MB**, e no fim uma recusa que MENTE: "o arquivo está corrompido… reabra no Excel e salve de novo" — quando o que houve foi o motor ficar sem memória | recusa em 20 ms, RSS 48 MB |

Em aba de navegador, 2 GB é a aba morrendo, e a frase manda a cliente
reexportar um arquivo que estava perfeito. Planilha com coluna depois de XFD (a
16.384ª, a última que existe) não saiu do Excel: recusa em voz alta, com código
próprio, como o ZIP64 e o método de compressão desconhecido já faziam.

**E um defeito de leitura, de brinde.** Referência sem letra maiúscula (`a2`,
`2`) fazia `indiceDaColuna('')` devolver −1, e `porColuna[-1] = valor` em
JavaScript não é posição de array: é um campo de texto. **A célula sumia sem
uma palavra.** Agora entra pela ordem de aparição.

Os outros doze arquivos do lote leem ou recusam em menos de 400 ms:
sharedStrings com índice fora da faixa, negativo e `1e308`; tipo de célula
inesperado (`t="marciano"`, `t="b"` com "talvez", `Infinity`, `0x10`);
`dimension` declarando dois bilhões de colunas; nome de aba com caractere de
controle e `</sheetData>` dentro; workbook sem o arquivo de relacionamento;
alvo apontando para `../../../../etc/passwd`; `numFmtId` de onze dígitos;
serial de data negativo e `1e308`; 50 mil células na mesma referência; `<row>`
aninhada; 300 mil linhas vazias; tamanho declarado `0xfffffffe`. Gerador em
`aud3/gerar-ataques3.py`, refaz em dois segundos.

As duas planilhas da cliente continuam lendo igual (os 4 testes de
`planilhasDeSetembro` passam) e XFD continua passando, com teste.

### 5 · GRAVE — o salvamento da venda podia apagar as outras fichas do mesmo lançamento · do MONTADOR, registrado e não consertado pelo revisor (achado 20 dele)

Ele descreveu certo e deixou: "o `sair` continua apagando as outras linhas de
ficha do mesmo lançamento… Não acontece porque `Vendas.tsx` abre lançamento
`origem = 'pdv'` na conferência e nunca no formulário da mão (linha 238)."

Segurança que depende de um desvio numa tela não é segurança. E são **dois**
caminhos, não um, e nenhum depende de alguém errar:

- o formulário carrega as linhas num `useEffect` que só roda quando a consulta
  volta. Salvar antes disso mandava lista vazia, e lista vazia significava
  "apague todas";
- `useItensDaVenda` usa `buscar`, não `buscarTudo`: num lançamento com mais de
  1000 linhas o PostgREST **trunca calado**, o formulário carregava 1000 e as
  demais saíam como "não estão na lista".

Conserto: o hook deixa de reconciliar por diferença. A tela manda a lista de
ids a apagar, e o hook apaga só ela (com `venda_id` e `alvo = 'ficha'` no
delete, de cinto e suspensório). A conta de quem sai é
`linhasDeVendaParaApagar` em `logica.ts`, com cinco testes — os dois casos
acima agora devolvem lista vazia em vez de "apague tudo".

### 6 · GRAVE — a semana que contém a contagem não era o CMV de nada · da 0005, julgada "não mexi" pelo revisor (achado 17 dele)

`CMV = estoque inicial + compras − estoque final` só é consumo quando a compra
cobre o MESMO intervalo que as duas fotos de estoque delimitam. A série semanal
pede sete dias e recebe as contagens que existem. Medido no meu banco, com as
133 notas lançadas:

```
 rotulo   |   inicio   |    fim     | estoque_inicial_data | estoque_final_data |  compras   |    cmv
Sem 31/08 | 2026-08-31 | 2026-09-06 | 2026-08-31           |                    | 28778.9700 |
Sem 07/09 | 2026-09-07 | 2026-09-13 | 2026-08-31           |                    | 22124.1100 |
Sem 21/09 | 2026-09-21 | 2026-09-27 | 2026-08-31           |                    | 11859.5700 |
Sem 28/09 | 2026-09-28 | 2026-10-04 | 2026-08-31           | 2026-10-01         |  5038.0100 | 11758.0163
```

As três primeiras voltam pendentes, que é o certo. A quarta fecha, e
R$ 11.758,02 é a queda de estoque de **32 dias** menos as compras de **7**. Não
é o consumo da semana, não é o do mês, não é o de nada: faltam 25 dias de
compra dentro de uma queda de estoque que os inclui. E a tela chamava isso de
"Sem 28/09". **É defeito, não leitura legítima.**

O conserto CERTO é somar a compra pelo intervalo que as duas fotos delimitam,
`(inicial.referencia, final.referencia]` — que é a definição de período do
próprio projeto. Ele muda o significado de `compras` nas duas funções de CMV e
o rótulo da série: é redesenho do período, entrega própria. **De passagem, ele
arrumaria uma assimetria que ninguém notou**: o estoque final de 01/10 entra em
setembro, e a tela até explica que "o movimento entre 30/09 e 01/10 entra neste
CMV" — mas a compra de 01/10 **não** entra, porque `compras` para no dia 30. No
Bar do Zeca não houve compra em 01/10, então hoje não muda número; a próxima
casa pode não ter essa sorte.

O que fiz é a metade que não fabrica nada (0035): `mv_cmv_serie` passa a
devolver as datas das duas contagens, `estoqueCobreOutroIntervalo` compara os
dois intervalos (cinco testes), e a tela diz — no seletor a janela sai marcada
"· outro intervalo", e no cartão um aviso com as duas datas, o que a diferença
custa, e qual janela ler para ter consumo. O `drop function` da série entrou na
0005, pelo mesmo motivo que o de `mv_cmv_periodo` já estava lá.

---

## O que é AJUSTE

### 7 · AJUSTE — o mês já lido mudava de número, calado · registrado e não medido pelo revisor (achado 16 dele)

Ele não pôde medir: o Bar do Zeca não tem contagem antes de 31/08. Montei a
casa com a contagem de 31/07 e medi. O CMV de agosto de 2026, no mesmo banco,
com as mesmas duas contagens, só mudando se a planilha de SETEMBRO está
importada:

```
sem a planilha:  compras R$     0,00 ·  0 notas · CMV R$     0,00
com a planilha:  compras R$ 1.365,48 ·  5 notas · CMV R$ 1.365,48
                 (cmv_limpeza R$ 573,00 · cmv_insumo R$ 792,48)
```

**De zero a mil trezentos e sessenta e cinco reais.** As cinco notas estão
emitidas entre 26/08 e 31/08 e chegaram dentro do arquivo de setembro, e o CMV
soma a compra pela EMISSÃO — o número está **certo**. O defeito é o silêncio: a
prévia da importação avisa antes de gravar, e depois de gravar não há nada. Quem
abrir agosto no mês que vem vê um número diferente do que leu, sem rastro.

Uma data conserta (0034): `compras_entrada_mais_recente`, o
`notas_fiscais.criado_em` mais recente do período, que é outra coisa que a
emissão. Quando ela cai depois do fim do período, a tela diz a frase que
faltava — "se alguém leu este número antes de 24/10/2026, ele mudou depois".

**Não guardei o CMV fechado de cada mês para comparar.** Seria o conserto
completo — "em 20/10 este mês valia X" — e é entrega própria (fechamento de
período, com quem fechou e quando). Meia versão dela daria um número guardado
que ninguém sabe se vale, o que é pior que uma data honesta.

### 8 · AJUSTE — desfazer funcionava pela metade, e a fusão não se desfazia · do MONTADOR, registrado pelo revisor (achados 10 e 15 dele)

São 96 linhas pendentes no primeiro mês (R$ 228.455,13), 82 delas exigindo
busca. Desfazer era meio: a linha resolvida virava um `<select>` com 69 fichas e
906 insumos, então dava para TROCAR o alvo. Não dava para voltar a "pendente"
(e trocar por um alvo qualquer para sair de onde se errou é pior que não ter
clicado), não dava para desfazer uma FUSÃO — ela apaga a linha clicada e a 0028
não guardava o que apagou; no cenário do revisor, seis nomes do PDV viraram uma
linha de R$ 37.124,58 sem volta — e não dava para esquecer o apelido.

**O terceiro é o que fazia desfazer valer uma vez só.** `resolver` ensina o
de-para, e é isso que faz o mês seguinte chegar vinculado. Desfazer sem esquecer
o apelido deixava a importação do mês que vem refazer o vínculo errado sozinha,
e dessa vez sem ninguém clicar.

Duas peças (0036). `venda_itens.fundidas` guarda a foto de cada linha absorvida
**e da própria linha antes de somar** — sem a dela, desfazer devolveria as
partes e deixaria o total dobrado. E `mv_desfazer_item_de_venda`, função própria
e não um `alvo = 'pendente'` em `resolver`: desfazer recria linhas, esquece
apelido e devolve VÁRIAS linhas. A frase da 0028 — "pendente é a ausência de
resposta" — continua verdadeira dentro da função que a escreveu.

Medido no banco, com os números do laudo do revisor, uma fusão de três:

```
antes      3 linhas pendentes
fundido    1 linha · qtd 1.465 · R$ 10.998,86 · 1.315 cupons · recibo com 3 fotos
           "AMSTEL CHOPP 300 ML HH + AMSTEL CHOPP 300 ML + TERCEIRO NOME DO PDV"
           3 apelidos aprendidos
desfeito   3 linhas pendentes, cada uma com a quantidade, o preço, o dinheiro e
           a contagem de cupons que tinha · R$ 10.998,86 de novo · 0 apelidos
```

Na tela o botão diz o que vai acontecer antes do clique: "Desfazer: separa de
novo os 3 nomes do PDV" quando houve fusão, "volta esta linha para pendente"
quando não houve. Lançamento fechado continua intocável pelo gatilho da 0023.

### 9 · AJUSTE — o nome cortado pelo PDV vinha com um botão de 100% · do MONTADOR, mal descrito pelo revisor (achado 15 dele)

Medido com o catálogo do primeiro cliente e o piso de 72%
(`node aud3/piso.mjs 0.72 "RED BULL C"`):

```
RED BULL C
   100.0%  RED BULL           <- e é o primeiro botão da fila
    75.0%  RED BULL CEREJA
    75.0%  RED BULL COCO
    72.5%  RED BULL AÇAI
    72.5%  RED BULL ZERO
```

**Correção do laudo 2: a tela JÁ oferece os três.** `sugerirAlvos` devolve três
e o piso deixa passar os três, então os três botões aparecem — a pergunta
"deveria oferecer os três em vez de um?" tem resposta medida: ela já oferece, e
não bastou. É por isso que o caso sobreviveu: o primeiro vem com 100% e os
outros com 75%, o que lê como "tenho certeza do primeiro".

**E os 100% não são identidade.** `similaridadeTexto` devolve 1 quando toda
palavra do nome curto está no longo E ele é prefixo dele — a forma exata de um
nome truncado. Nome igual nunca chega a esta lista, porque o casamento resolve
igualdade num degrau de cima. Então nenhum botão daqui podia dizer 100%, e
agora nenhum diz: a porcentagem para em 99 e vem com a palavra "parecido".

O aviso de verdade vem ANTES dos botões, e nomeia os candidatos:
`nomesQuePodemSerOCortado` responde quais nomes do cadastro COMEÇAM com o nome
do PDV (estritamente mais longos — igualdade é outro degrau), e com dois ou mais
a tela diz que o nome pode estar cortado, lista quais, e manda escolher na
busca conferindo o cardápio. A diferença entre RED BULL CEREJA e RED BULL COCO
está justamente na letra que o PDV cortou, e nenhuma distância de texto a
recupera. Seis testes, com os nomes de verdade.

### 10 · AJUSTE — os dez segundos de leitura eram cegos · do REVISOR (ele reduziu a pausa, não o total)

Medi de novo, com o leitor de hoje, no instrumento dele (Chromium a 390 px, CPU
freada 4x, relógio de quadros dentro da página):

```
compras (693 linhas)     4.315 ms · maior pausa 3.311 ms
vendas (11.198 linhas)   8.078 ms · maior pausa 1.561 ms · 20 quadros
```

Ele mediu 13.215 ms e pausa de 2.443 ms. Mesma ordem de grandeza, e o teto de
coluna do achado 4 não custou nada: no servidor, a mediana de três leituras da
aba de vendas é 1.758 ms com o teto contra 1.920 ms sem — dentro do ruído.

**Decisão sobre o Web Worker: cabe, e não é desta entrega.** Cabe porque é
mecanicamente simples: `DecompressionStream` e `fast-xml-parser` rodam em
worker, o arquivo entra como `Uint8Array` e a aba volta como dado puro, tudo
transferível. Não é desta entrega porque não conserta número nenhum — nada está
errado, nada se perde, e o que ele melhora é a aba responder a clique durante a
leitura. Em troca, põe uma fronteira assíncrona nova no caminho de ERRO de duas
telas: `ErroDePlanilha` perde a classe ao atravessar `postMessage`, e as duas
telas decidem o texto pelo `codigo`. Enfiar isso como oitavo conserto de uma
auditoria, sem ninguém para revisar, é a troca errada.

O que dá para fazer de graça está feito: o laço já soltava a thread a cada 2.000
linhas, e agora fala nesses pontos. `lerXlsx` aceita `aoProgresso`, e as duas
telas dizem "Lendo — 8.000 linhas de cupom até agora" no lugar de um spinner
cego de oito segundos.

---

## O que confere, e o que eu julguei sem mexer

### 11 · NOTA — os números das duas planilhas conferem

Refeitos por caminho próprio (`openpyxl`, `-I`, script fora da pasta das
planilhas): 693 linhas de compras, soma `PrecoFinal` R$ 83.783,29, 681 linhas
de setembro somando R$ 82.417,81, 5 notas de agosto com R$ 1.365,48, 36 linhas
de operação de limpeza somando R$ 6.598,55 (35 em setembro, R$ 6.025,55). Todos
iguais ao gabarito e ao laudo 2.

Uma diferença de contagem, sem consequência: o gabarito e os dois laudos dizem
**219 produtos distintos** em compras; normalizando o nome (sem acento,
maiúscula, só A-Z0-9 — que é o que o de-para usa) são **218**. Dois nomes
colapsam no mesmo. Não muda número nenhum; muda o tamanho da fila de de-para em
um.

### 12 · NOTA — vínculo em lote: julgo que não deve existir

O revisor registrou "não há vínculo em lote. Nada de 'aplicar a todos os
parecidos'". Julgo que a ausência está certa, e que essa é a resposta, não uma
pendência: "aplicar a todos os parecidos" é exatamente a armadilha que o
desenho inteiro evita — `AMSTEL CHOPP 300 ML` e `AMSTEL CHOPP 300 ML HH` são
parecidos e são coisas diferentes, e um lote de vínculos errados é um lote de
números falsos sem ninguém olhando. O que torna o trabalho suportável não é o
lote: é ele ser **de uma vez só**, porque `venda_apelidos` guarda cada decisão e
a importação do mês seguinte já chega vinculada. O que faltava ao redor disso
era a rede de segurança, e é o achado 8.

### 13 · NOTA — o que o revisor consertou, conferido um a um

| conserto dele | como conferi | fica? |
|---|---|---|
| `fatiarXml` por `indexOf` contra a tag que nunca fecha | 12 arquivos hostis novos, nenhum passa de 400 ms | sim |
| teto de 64 MiB por parte | `tamanho_negativo.xlsx` (0xfffffffe) recusa em 15 ms | sim |
| trava da planilha repetida com `buscarTudo` + consulta na hora | não refiz a medida dele; a mudança está no código e a suíte cobre | não medido por mim |
| unidade da venda e `mv_fator_para_produto` (0028) | suíte de banco verde, e o selo `UN ≠ KG` aparece | sim |
| `mv_resolver_item_de_venda` chamada de verdade | refiz a fusão de três no banco, com os números dele | sim |
| CMV recusa acesso de setor (0030) | `mv_cmv_periodo` e `mv_cmv_por_categoria` recusam pela API | sim |
| condição do mês civil (0029) | a série semanal de setembro não puxa a contagem de outubro | sim |
| aviso de fusão e de unidade antes do clique | está na tela, e o achado 8 acrescenta o desfazer | sim |

Os dois números que ele corrigiu no laudo 1 (157 linhas em vez de 159; AMSTEL
600 ML com 941 unidades em 366 linhas em vez de 3.063) não refiz: são medidas
de planilha que não mudam decisão nenhuma, e ele as fez por caminho próprio.

---

## O que NÃO consegui provar

- **Que o leitor é seguro.** Somados, são 40 arquivos hostis (os 27 dele, os 13
  meus) e um defeito grave achado no meu lote. A conclusão honesta continua
  sendo a dele, com um arquivo a mais de margem: resiste ao que dois agentes
  souberam atacar. O que mudou é que agora existe um teto declarado onde não
  havia nenhum.
- **O número de setembro no banco de verdade.** R$ 83.548,56 é do meu cenário
  com de-para declarado. Sem o de-para, nenhuma das 128 notas de setembro pode
  ser lançada, e o CMV não existe. O achado 1 diz exatamente de que parte do
  número a cliente é dona.
- **A trava da planilha de compras repetida**, com o teto de 1.000 do PostgREST.
  O revisor mediu antes e depois; eu li o código e não refiz o cenário de 1.001
  notas.
- **Que o de-para é viável para a cliente em tempo razoável.** Como ele, contei
  cliques e não vi uma pessoa fazendo os 96. O achado 8 reduz o custo de errar,
  não o de decidir.
- **A tela de CMV com os dois percentuais populada por mim.** Não importei as
  vendas no meu banco: medi o CMV e as duas metades por SQL, e as três telas que
  mexi (CMV, conferência de venda, prévia de compras) rodaram no navegador a
  390 px para a medida de desempenho.

## Uma coisa que eu estraguei, e não consegui limpar

Antes de descobrir que a porta 54321 ainda estava com um PostgREST **antigo do
revisor** apontando para `revisao_importacao`, duas requisições minhas caíram no
banco dele. Ficaram lá:

```
nota 23df88ce-b87b-4033-b952-141d8c5d7f1a · numero 'TESTE-AUD3'  · R$ 1.000
  + 1 item 'DETERGENTE QUE NINGUEM VINCULOU' (produto_id nulo)
  e um PATCH meu pôs status='lancada' nela (HTTP 204)
nota 1daefd02-0c98-4b96-ae59-47a7c956feed · numero 'TESTE-AUD3B' · R$ 1.000
  status 'importada', sem itens
```

Tentei apagar; o classificador de permissão negou escrita (e depois leitura) em
banco de outro agente. Enquanto estiverem lá, **qualquer medida de CMV de
setembro refeita em `revisao_importacao` sai R$ 1.000 maior em compras**. A
limpeza, para quem tiver permissão:

```sql
delete from nota_itens where nota_id in
  (select id from notas_fiscais where numero in ('TESTE-AUD3','TESTE-AUD3B'));
delete from notas_fiscais where numero in ('TESTE-AUD3','TESTE-AUD3B');
```

Meu banco (`auditoria_importacao`) está limpo das duas: conferido que setembro
volta R$ 82.417,81 em 128 notas.

---

## Como refazer tudo isto

```bash
AUD=/tmp/claude-0/-home-user/ea7223e1-0cfd-5570-ae56-c7244317aec2/scratchpad/aud3

# banco próprio, do zero, com a carga do Bar do Zeca
BANCO=auditoria_importacao ferramentas/local/subir.sh

# API própria, em porta própria (a 54321/54325 pode ter stack de outro agente)
postgrest "$AUD"/api/postgrest.conf &            # 54345, banco auditoria_importacao
PORTA=54341 POSTGREST=http://127.0.0.1:54345 \
  JWT_SEGREDO=segredo-local-do-multiverso-com-32-caracteres \
  node ferramentas/local/portao.mjs &

# os números das planilhas, e as duas classificações lado a lado
/tmp/venv-xlsx/bin/python -I "$AUD"/p1-compras.py     # a operação, e o GUARDANAPO
/tmp/venv-xlsx/bin/python -I "$AUD"/p1-categoria.py   # categoria x operação, linha a linha
/tmp/venv-xlsx/bin/python -I "$AUD"/p1-limpeza.py     # os 28 produtos de limpeza e seus pares
/tmp/venv-xlsx/bin/python -I "$AUD"/p1-bound.py       # a banda de dúvida, pelos dois lados

# o cenário de setembro no banco, com de-para DECLARADO
/tmp/venv-xlsx/bin/python -I "$AUD"/montar-compras.py <restaurante_id>
psql -h /home/pg/sock -U postgres -d auditoria_importacao -f "$AUD"/compras.sql

# o alcance do operador de setor, antes e depois
"$AUD"/alcance.sh

# os 13 arquivos hostis
/tmp/venv-xlsx/bin/python -I "$AUD"/gerar-ataques3.py
for f in "$AUD"/ataques/*.xlsx; do timeout 60 node "$AUD"/um-ataque.mjs "$f"; done

# o piso de 72% contra o catálogo de verdade
node "$AUD"/piso.mjs 0.72 "RED BULL C"

# desempenho a 390 px com a CPU freada 4x (precisa de `npm run dev`)
node "$AUD"/desempenho.mjs 4 390

# a suíte inteira, no banco próprio
BANCO=auditoria_importacao_testes npm run verificar
```

As planilhas da cliente não entram no repositório, e os `.xlsx` hostis que
montei também não — eles se refazem com o gerador em dois segundos.
