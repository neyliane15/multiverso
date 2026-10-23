# Laudo 1 · Montador — importação de planilha e o CMV com denominador

O que a cliente pediu:

> "Na página de compras e na página de vendas adicione um botão para adicionar
> os itens a partir da extensão xlsx, faça a leitura dos dados com cautela,
> adicione esses dados em compras e vendas e estruture o cálculo para vermos o
> CMV, tenha bastante atenção."

E, no meio do trabalho, a regra que conserta setembro:

> "Algo muito importante sobre o CMV, mesmo que a contagem do final do mês
> tenha sido feita no mês seguinte, você irá pegar a primeira contagem do mês
> seguinte para ser o estoque final."

Três commits: o leitor de xlsx, a estrutura de banco, as telas.

---

## 1. Ler xlsx sem dependência nova

O projeto não tinha leitor de planilha. Avaliei as duas candidatas antes de
escrever uma linha:

| | tamanho | dependências | problema |
|---|---|---|---|
| `xlsx@0.18.5` | 7,5 MB | nenhuma | é a **última publicada no npm**, e é a que carrega os avisos de prototype pollution e ReDoS abertos. As correções (0.19.3+) saem pelo CDN próprio da SheetJS, que não é canal de `package-lock.json`. Fixar a versão, como manda a casa, seria fixar justamente a vulnerável. |
| `exceljs@4.4.0` | 21,8 MB | 9 de runtime | `archiver`, `unzipper`, `tmp`, `readable-stream` — feitas para Node. No navegador arrastam polyfill de `Buffer` e de `stream` para o bundle. |

Nenhuma das duas se paga para ler **uma aba de tabela plana**: sem fórmula, sem
estilo, sem gráfico, sem escrita. E um `.xlsx` é um ZIP com XML dentro — o
projeto já tem `fast-xml-parser` lendo NFe desde a 3.1, e o navegador já
descompacta com `DecompressionStream('deflate-raw')`. O que faltava era abrir o
ZIP: 46 bytes de cabeçalho por arquivo no diretório central.

`web/src/dados/planilha/lerXlsx.ts`, ~400 linhas com comentário, 15 testes.

### A medida que decidiu o desenho

Na aba de vendas (11.198 linhas × 29 colunas, 11,5 MB de XML, 324.703 células):

```
árvore inteira num parse só .... 3.530 ms · 285 MB de heap
uma linha por parse ............ 1.549 ms ·  25 MB de heap
```

Por isso o XML é fatiado por `<row>` com expressão regular — e **só** por
`<row>`. O miolo de cada linha continua passando pelo `fast-xml-parser`, que é
quem sabe de escape, de `<is>` embutido e de namespace. Fatiar o envelope é
diferente de parsear XML com regex.

### Três defeitos que o teste pegou antes de a tela existir

1. **`trimValues: true`** transformava `"AMSTEL " + "600 ML"` (texto formatado,
   que o Excel quebra em vários `<r><t>`) em `"AMSTEL600 ML"` — nome que o
   de-para não casa com nada.
2. **A época do serial estava um dia errada**: o serial 1 saía 31/12/1899. O
   Excel preserva o bug do ano 1900 do Lotus 1-2-3, e abaixo do serial 61 a
   época é outra. Conferido contra o `openpyxl` nas duas planilhas.
3. **A célula era lida por ordem de aparição**, e a planilha de vendas **omite
   célula vazia**: a linha 2 pula de `C2` para `E2` (a coluna `Cliente` é vazia
   em quase todo cupom). Todo o resto da linha andava uma coluna para a
   esquerda. Agora a posição vem da referência da célula.

O leitor **recusa em voz alta** o que não sabe: ZIP64, método de compressão
desconhecido, arquivo que não é ZIP, aba sem cabeçalho.

---

## 2. Os números das duas planilhas

Todos medidos por mim, todos iguais aos do gabarito. Nenhuma diferença a
explicar.

### Compras — aba "Entradas 09-26"

```
693 linhas · 219 produtos distintos
soma Qtde       =    9.517,4800
soma PrecoFinal = R$ 83.783,29
133 notas (Nota_fiscal + Fornecedor + Emissao) · 42 fornecedores
```

**`PrecoFinal` não é `Qtde × Unitario`.** Em 159 das 693 linhas os dois
discordam, e a diferença é o rateio de frete, despesa acessória e ICMS-ST. A
soma de `PrecoFinal` fecha com `ValorTotalNota` em **133 de 133 notas**. Então
`PrecoFinal` é o desembolso da linha e é ele que vira `nota_itens.valor_total` —
a mesma decisão que `parsearXml.ts` tomou ao usar `custoDesembolsado` em vez de
`vProd`. Exemplo: AMSTEL 600 ML, 360 × R$ 4,44 = R$ 1.598,40, e a nota cobrou
R$ 1.944,47. Usar `Unitario` subestimaria essa linha em 18%.

**Dois centavos que vale explicar.** A soma dos `ValorTotalNota` distintos dá
R$ 83.783,27; a soma dos `PrecoFinal` dá R$ 83.783,29. A diferença é o
arredondamento do rateio por linha em 133 notas. O cabeçalho que o sistema grava
**soma os itens**, não copia o `ValorTotalNota`: assim o total da nota é sempre a
soma do que está dentro dela, e o total do período bate com a planilha no
centavo.

**A `Emissao` mais antiga é 26/08/2026.** Cinco notas de agosto, R$ 1.365,48,
recebidas em setembro. `mv_cmv_periodo` soma pela EMISSÃO, então elas caem no CMV
de agosto. O importador não mexe na data — avisa, com o valor, na prévia.

### Vendas — aba "Faturamento 09-26"

```
11.198 linhas · 136 produtos distintos · 26 dias de caixa
soma Qtde                 =     13.651,0000
soma PrecoFinal           = R$ 255.417,78
soma DescontoTotalRateado = R$  17.069,44
```

**A pergunta que estava aberta, respondida: `PrecoFinal` JÁ é líquido do
desconto.** Nas 11.198 linhas, sem uma exceção: `Qtde × Unitario −
DescontoTotalRateado = PrecoFinal`, na tolerância de um centavo. Em números:
bruto R$ 272.487,22 − desconto R$ 17.069,44 = **exatamente** R$ 255.417,78.
Subtrair de novo tiraria 6,7% do faturamento e inflaria o CMV% na mesma
proporção. São 748 linhas com desconto, e `ValorUnitarioTabela` é igual a
`Unitario` em todas — nem por aí haveria outra conta.

**A data é `DataCaixa`, não `Emissao`.** Venda do dia 12 fechada depois da
meia-noite sai com `Emissao` 13/09: são 28 datas de emissão contra 26 de caixa.
Quem decide em que dia o bar vendeu é o caixa.

### O de-para contra o catálogo

Reproduzido pelo meu código, igual ao gabarito:

```
casam com FICHA técnica        36 itens   R$  18.370,07    7,2%
casam com PRODUTO do catálogo   4 itens   R$   8.592,58    3,4%
parecem serviço                 5 itens   R$  53.049,68   20,8%
SEM CORRESPONDÊNCIA            91 itens   R$ 175.405,45   68,7%
```

---

## 3. O que foi construído no banco (migração 0027)

### A venda ganha três alvos, e um quarto estado

`venda_itens.alvo` é um enum de **quatro** valores: `ficha`, `produto`,
`servico`, `pendente`.

- **`produto`** é a decisão escrita da cliente: "garrafa é produto fechado
  vendido inteiro, dose é apenas uma pequena quantidade". Ficha de uma linha
  para 209 cervejas seria cadastro de enfeite.
- **`servico`** veio da planilha com R$ 53.049,68 em cima da mesa. Couvert e
  taxa são 20,8% do faturamento e não consomem insumo nenhum.
- **`pendente`** é o que ainda não foi decidido.

Por que enum de quatro e não par de booleanos: `servico` e `pendente` têm as
**mesmas colunas nulas**, e nenhuma coluna poderia distingui-los — a diferença
entre eles não está no dado, está na decisão. Confundi-los faria toda linha não
resolvida virar faturamento sem custo, calada.

`mv_fechar_venda` passa a **recusar** lançamento com linha pendente, que é o
espelho exato de `mv_lancar_nota` recusando nota com item pendente. Enquanto
houver pendente, nada daquela planilha entra em número nenhum.

### `valor_total_origem`: o dinheiro do PDV é medida, não conta

`venda_itens.total` é coluna gerada (`quantidade × preco_unitario`). Para a venda
da mão está certo. Para a agregação de um mês não fecha: AMSTEL 600 ML saiu
3.063 vezes e faturou R$ 16.633,21; 16.633,21 / 3.063 = 5,4303657…, e 5,4304 ×
3.063 = R$ 16.633,32 — **onze centavos de erro em UM item**, com 136 no arquivo.

Então o faturamento da linha vai para uma coluna própria. O `preco_unitario` fica
sendo o que sempre foi numa agregação: uma média para a tela ler. Nada muda para
o lançamento da mão, onde a coluna é nula.

### Limpeza e descartáveis fora do CMV de insumo

A marca mora na **categoria** (`categorias.fora_do_insumo`), não na nota, porque
as três pontas do CMV precisam dela: `MATERIAL DE LIMPEZA` (75 insumos) e
`DESCARTÁVEIS` (60) estão no catálogo do Bar do Zeca e são **contados na folha**.
Separar só a compra deixaria o estoque dos dois lados.

A `operacao` da nota (`nota_itens.operacao`, guardada como veio da planilha) entra
como segundo sinal: ela é o único classificador que existe para um item que ainda
não foi vinculado a insumo nenhum.

`cmv_limpeza + cmv_insumo = cmv`, por construção, e há teste para isso.

### O fechamento que acontece no mês seguinte

Medido antes, no banco com a carga de verdade — o Bar do Zeca tem duas contagens
fechadas, 31/08 e 01/10:

```
mv_cmv_periodo(bar, '2026-09-01', '2026-09-30')   ANTES
  estoque_final_data | (vazio)
  cmv                | (vazio)
  pendencia          | Falta a contagem de estoque final
```

Setembro inteiro sem CMV — justamente o mês das planilhas. A casa contou o
estoque; o sistema é que não soube ler a data.

A busca do estoque final passa a ter dois degraus: (a) a contagem fechada mais
recente **dentro** do período, como antes; (b) não havendo nenhuma, a **primeira**
contagem fechada do mês civil seguinte.

**A decisão que tomei e que o revisor deve olhar primeiro:** o degrau (b) só vale
para período que **fecha um mês** (`p_fim` é o último dia do mês). Medido: sem
essa condição, a série semanal de setembro saía com **quatro semanas mostrando o
mesmo CMV de R$ 6.720,0063** — o CMV do mês inteiro, repetido, como se o bar
consumisse isso por semana. Quatro barras iguais no gráfico, cada uma sendo o
mês. A regra da cliente fala do "final do mês"; aplicá-la a janela semanal
fabrica número. A semana que de fato **contém** a contagem continua fechando pelo
degrau (a), que não mudou.

A função devolve `estoque_final_fora_do_periodo` em coluna própria, e a tela diz
a data e **o que isso custa**, em texto. A mesma contagem vira o estoque inicial
do mês seguinte, o que é correto e desejado; a trava de que inicial ≠ final
continua valendo (a busca exige `referencia > inicial.referencia`).

### `mv_resolver_item_de_venda`: funde em vez de esbarrar

O PDV escreve "AMSTEL 600 ML" e "AMSTEL GF 600" para a mesma garrafa. O
`unique (venda_id, ficha_id)` da 0023 recusa a segunda — e está certo em recusar:
duas linhas da mesma ficha dobrariam o consumo dela no relatório. O que faltava
não era afrouxar a trava, era dizer o que fazer quando ela bate.

A fusão soma quantidade, dinheiro e linhas de cupom, recalcula o preço como
**média ponderada** (ele sempre foi média), guarda os dois nomes do PDV separados
por `" + "` na linha que sobra, e **ensina o de-para do nome que desaparece
antes de apagá-lo**. A regra mora no banco, não na tela, para valer também para
script e API.

Conferido que ela não escapa da trava de lançamento fechado: a fusão faz um
`update` e um `delete`, e o gatilho `t_venda_itens_bloqueio` da 0023 cobre os
dois — apagar escapa de muita trava escrita pensando só em escrita. Há teste.

### O de-para dos nomes do PDV: tabela própria

`venda_apelidos`, e não `produto_apelidos`, por três motivos medidos:

- `produto_apelidos.produto_id` é `not null`: ele não sabe apontar para ficha, e
  36 dos 136 nomes são ficha;
- ele não sabe dizer "isto é serviço", que são outros 5 nomes e 20,8% do
  faturamento;
- ele é indexado por fornecedor, que não existe em venda, e o vocabulário é
  outro. Misturar faria o importador de NFe começar a casar linha de compra com
  apelido de cardápio — vínculo errado com cara de aprendizado.

O desenho é o mesmo da 0004: o vínculo feito à mão fica registrado, e é **só
isso** que vincula sozinho.

---

## 4. O casamento automático, e o que ele se recusa a fazer

`web/src/dados/planilha/dePara.ts` reusa `casarProdutos.ts` — a cascata de
apelido, EAN e código já está lá e já tem teste — e **tranca o último degrau
dela**, o da similaridade de texto, passando `confiancaMinima: 1.01`
(`similaridadeTexto` devolve no máximo 1).

Vincula sozinho só duas coisas: o **apelido aprendido** e o **nome idêntico** ao
do cadastro depois de normalizado.

Por quê, com os números da planilha:

```
AMSTEL 600 ML          R$ 16.633,21
AMSTEL CHOPP 300 ML
AMSTEL CHOPP 300 ML HH R$  7.023,92
```

Três produtos. As duas últimas se separam por duas letras — "HH" é happy hour,
preço de carta diferente. Nenhuma distância de texto as separa com segurança, e
a similaridade marcaria 90%+ entre elas. Linha errada envenena o CMV em silêncio;
linha pendente é um incômodo de dois cliques.

Serviço é **afirmação** ("isto não consome nada"), então a lista de palavras
(`COUVERT`, `TAXA DE SERVICO`, `TAXA ROLHA`, `GORJETA`…) **não vincula**: ela só
destaca o botão na tela. Um bar que batize um prato de "TAXA DO CHEF" não pode
perder o custo dele por causa de uma lista nossa.

`BUFFET DE FEIJOADA` (R$ 17.332,50) não casa com nada e não recebe ficha
inventada.

---

## 5. O que foi provado, e como

### Postgres de verdade

`npm run test:banco` inteiro passando, com as migrações aplicadas **duas vezes**
(a segunda por cima do banco já pronto e com carga). Casos novos em
`supabase/testes/20_fluxos.sql` e `supabase/testes/10_rls.sql`.

A segunda passada pegou um defeito real: a 0005 morria em `cannot change return
type of existing function`, porque a 0027 muda o retorno de `mv_cmv_periodo`. O
`drop` entrou na 0005, com o mesmo comentário que `mv_cmv_por_categoria` já
carregava desde a 0007.

Os números do teste de CMV, com valores redondos para a conta ser conferida de
cabeça: CMV 850 sobre faturamento 5000 = **17,00%**; sobre faturamento de produto
4000 = **21,25%**. A razão entre os dois percentuais é a razão entre os dois
faturamentos — a prova cruzada que o gabarito pede.

### As duas planilhas, pelas telas, em navegador de verdade

Chromium, PostgREST, `admin@bardozeca.com.br`. Sem um erro de console.

```
COMPRAS   prévia 1,5 s · gravação 9,0 s
          693 linhas -> 133 notas · R$ 83.783,29
          342 itens pendentes em 140 nomes distintos
          42 fornecedores cadastrados a partir da planilha, com CNPJ
          aviso de agosto: R$ 1.365,48 em 5 notas

VENDAS    prévia 3,7 s · gravação 2,6 s
          11.198 linhas -> 136 itens · R$ 255.417,78 · 26 dias
          36 ficha (R$ 18.370,07) · 4 insumo direto (R$ 8.592,58)
          96 sem destino (R$ 228.455,13)
          5 serviços marcados pela tela, um a um: R$ 53.049,68 (20,8%)
          e os 5 nomes ficaram aprendidos em venda_apelidos
```

**A soma fecha no centavo, nas duas pontas.** No banco, depois:
`sum(notas_fiscais.valor_total)` = R$ 83.783,29 e `sum(nota_itens.valor_total)`
= R$ 83.783,29. `sum(coalesce(venda_itens.valor_total_origem, total))` =
R$ 255.417,78.

### Isolamento, com identidade de verdade

`supabase/testes/10_rls.sql`, com `set local role authenticated` +
`set_config('request.jwt.claim.sub', …, true)` dentro da transação. Provado que o
admin da Casa B **não enxerga** linha de venda, de-para, explosão em insumo nem
faturamento da Casa A; que ficha e insumo da Casa B são recusados na venda da
Casa A, com a mensagem da 0025 que não afirma qual das duas coisas aconteceu; e
que a Casa A continua vendo os números dela (320 de faturamento, 100 de serviço),
para o teste provar isolamento e não uma sessão quebrada.

### `npm run verificar`

Rodado inteiro como último ato, depois da última mudança de código.

---

## 6. O que a tela aberta pegou, e que teste nenhum tinha pegado

1. **A tabela por categoria discordava do cartão do período.** O cartão mostrava
   CMV de setembro R$ 11.882,84 e a tabela dizia "sem CMV" nas 21 categorias,
   porque `mv_cmv_periodo` e `mv_cmv_por_categoria` procuravam as contagens cada
   uma por conta própria e só a primeira conhecia a regra nova. É a mesma doença
   da 0007, ao contrário. A cura não foi copiar a regra para o segundo lugar: foi
   `mv_contagens_do_periodo`, para não haver segundo lugar. Há teste que exige
   que as duas somem igual.
2. **A carga nascia sem categoria marcada.** O carimbo da 0027 só alcança
   categoria que já existe, e numa instalação nova a migração roda antes de a
   carga criar qualquer uma: zero categorias marcadas, e o indicador de limpeza
   mostrando R$ 0,00 com cara de medida. `fora_do_insumo` passa a sair do gerador
   de carga, com a mesma regra de nome da migração.
3. **Sugestão de 13% virava botão de um clique.** COUVERT ARTISTICO 20 REAIS —
   a maior linha do mês — vinha com "COUVE FLOR 13%" para clicar. Abaixo de 72%
   (o mesmo `CONFIANCA_MINIMA` de `casarProdutos.ts`) a parecença some.
4. **R$ 255.417,78 não cabia em um quarto da largura do painel** e saía cortado.

E um defeito que o typecheck pegou antes: `useSalvarItensDaVenda` reconciliava
por `ficha_id` sem filtrar alvo. Linha de insumo, de serviço e pendente têm
`ficha_id` nulo, `querida.has(null)` é falso para todas — salvar **uma** ficha
pela tela da mão apagaria as 100 linhas da planilha, sem aviso e sem desfazer.

---

## 7. O que ficou de fora, e o que não está provado

- **O lançamento de setembro não fecha**, porque 91 linhas (R$ 175.405,45)
  continuam pendentes: são os nomes que só a casa sabe traduzir
  (`ANTARTICA ORIG600 ML`, `BRAHMA CHOPP 300ML`, `ISCA DE FRANGO A MILANESA`…).
  Isso é o sistema funcionando como desenhado, não uma falha — mas significa que
  **o bloco dos dois percentuais não foi visto populado no navegador**. Ele está
  provado no Postgres, com números exatos (17,00% e 21,25%), e no navegador
  aparece no estado honesto: "sem venda fechada, não há percentual", com o
  caminho para resolver. Não inventei um de-para para tirar uma captura de tela
  mais bonita.
- **Só 9 das 133 notas puderam ser lançadas** (as que não têm item pendente), e
  elas somam R$ 5.162,83 das R$ 83.783,29. As outras 124 esperam vínculo. O CMV
  de setembro no navegador é R$ 11.882,84 com essas 9 notas dentro — número
  correto para o estado atual do banco, não o número final do mês.
- **`mv_cmv_serie` não ganhou faturamento nem percentual.** Ela continua
  devolvendo as colunas de sempre (e continua funcionando, porque lê por nome).
  O CMV% aparece só no cartão do período em detalhe. Um gráfico de CMV% ao longo
  dos meses é trabalho de outra entrega.
- **A importação de compras não detecta a planilha repetida pela chave de
  acesso**, porque nota de planilha não tem chave. A trava é número + fornecedor
  + emissão, conferida contra o histórico já carregado no navegador. Se o
  histórico estiver truncado ou frio, a trava não pega — ver abaixo.
- **O couvert não tem ficha, e nem deveria**, mas isso significa que
  `faturamento_produto` ainda inclui qualquer prato cujo nome não foi resolvido.
  Enquanto houver pendente o lançamento não fecha, então o número nunca sai
  parcial — mas vale o olho.
- **Importar a mesma planilha de vendas duas vezes** bate em `vendas_ref_unica`
  (uma venda por data de referência), com a mensagem já traduzida em
  `consultas.ts` desde a 0023. Não há merge de lançamentos.

---

## 8. O que um revisor deve atacar primeiro

Por ordem de dano se eu estiver errado:

1. **A condição "só para período que fecha um mês"** no degrau (b) do estoque
   final. Eu a inventei: a cliente disse "a primeira contagem do mês seguinte",
   sem falar de semana. Se ela quiser a regra literal em toda janela, a série
   semanal volta a mostrar quatro barras iguais e eu prefiro ter errado por
   cautela. Está em `mv_contagens_do_periodo`, uma linha de `if`.
2. **`compras_limpeza` sai do item e `compras` sai do cabeçalho.** Para a nota de
   planilha os dois batem (a soma dos itens é o cabeçalho, por construção). Para
   a nota de XML podem divergir, e o resíduo (frete e imposto que a nota não
   rateou por item) cai todo do lado do insumo. É uma escolha, não um teorema.
3. **A trava de planilha de compras repetida** depende de `useCompras`, que não
   usa `buscarTudo`: uma casa com mais de 1000 notas receberia um histórico
   truncado **calado** pelo PostgREST, e a trava deixaria passar a reimportação.
   Hoje são 133; o teto chega.
4. **`mv_contagens_do_periodo` é `stable security invoker`** e é chamada por duas
   funções. Vale conferir sob RLS de operador de setor — `mv_relatorio_de_contagem`
   recusa esse perfil explicitamente, mas o CMV nunca recusou e eu não mudei isso.
5. **A unidade da linha `produto`.** Assumi que a quantidade vendida está na
   unidade de compra do insumo (1 garrafa = 1 UND), sem chamar
   `mv_fator_para_produto`. É o que "aponta direto para o insumo" significa, e
   evita inventar conversão — mas se o PDV vender picanha em KG e o cadastro
   contar em UND, a conta sai errada sem avisar. É o ponto mais frágil da
   migração.
6. **`lerXlsx.ts` é código novo lendo arquivo de terceiro.** Ele recusa ZIP64 e
   método desconhecido, e tem 15 testes incluindo ZIP montado byte a byte — mas é
   um leitor de formato binário escrito à mão, e merece um olhar de quem não o
   escreveu.

---

## 9. Arquivos

```
supabase/migrations/20260901000005_cmv.sql          drop para a segunda passada
supabase/migrations/20260901000027_...sql           a migração nova
supabase/testes/10_rls.sql                          isolamento da importação
supabase/testes/20_fluxos.sql                       os quatro alvos, o CMV, a fusão
supabase/seed/0001_bar_do_zeca.sql                  fora_do_insumo na carga
scripts/gerar-seed.mjs                              quem gera a linha acima

web/src/dados/planilha/lerXlsx.ts                   o leitor + 15 testes
web/src/dados/planilha/compras.ts                   693 linhas -> 133 notas
web/src/dados/planilha/vendas.ts                    11.198 linhas -> 136 itens
web/src/dados/planilha/dePara.ts                    o casamento que se recusa
web/src/dados/planilha/planilhasDeSetembro.test.ts  os arquivos de verdade

web/src/paginas/compras/PlanilhaDeCompras.tsx       o 4º caminho da tela de notas
web/src/paginas/compras/importarPlanilha.ts         a gravação, em 4 requisições
web/src/paginas/contagem/PlanilhaDeVendas.tsx       importar + conferir
web/src/paginas/contagem/importarPlanilhaDeVendas.ts
web/src/paginas/cmv/Dashboard.tsx                   os dois lados, a limpeza
web/src/paginas/cadastros/TelaDeCadastro.tsx        a caixa "fora do CMV de insumo"
```

O teste das planilhas de verdade se pula sozinho: os arquivos não entram no
repositório (são dado de cliente, com CNPJ e faturamento dentro). Para rodá-lo:

```bash
MULTIVERSO_PLANILHAS=/caminho/da/pasta npm test
```
